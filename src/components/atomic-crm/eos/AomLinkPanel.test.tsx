import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext, type DataProvider } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { ActionDrawer } from "./ActionDrawer";
import { AomLinkPanel } from "./AomLinkPanel";
import { offeredActions, statusLabel } from "./aomLink";
import { useAomWriteBack, type Invoke } from "./useAomWriteBack";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("../providers/supabase/supabase", () => ({
  getSupabaseClient: () => {
    throw new Error("no network in this test");
  },
}));

const ID = "11111111-1111-4111-8111-111111111111";
const aomRow = {
  id: "m1",
  commitment_id: ID,
  namespace: "aom",
  source_key: `assignment:${ID}`,
  kind: "assignment" as const,
  deep_link_path: `/playbooks/assign?assignment=${ID}`,
};
const rec = (status: string, extra: Record<string, unknown> = {}) => ({
  id: ID,
  title: "[SYNTHETIC-SEED] Acme Brand action",
  status,
  revision: 3,
  company_id: 8,
  ...extra,
});

const makeDp = (record: any, mapRows: any[]) => {
  const update = vi.fn(async () => ({ data: record }));
  const dp = {
    getOne: async (r: string) => {
      if (r === "eos_commitments") return { data: { ...record } };
      return { data: { id: 8, name: "[Demo] Acme" } };
    },
    getList: async (r: string) => {
      const data = r === "eos_action_source_map" ? mapRows : [];
      return { data, total: data.length };
    },
    getMany: async () => ({ data: [{ id: 8, name: "[Demo] Acme" }] }),
    getManyReference: async () => ({ data: [], total: 0 }),
    create: async () => ({ data: { id: 1 } }),
    update,
    updateMany: async () => ({ data: [] }),
    delete: async () => ({ data: { id: 1 } }),
    deleteMany: async () => ({ data: [] }),
  } as unknown as DataProvider;
  return { dp, update };
};

const hasText = (
  screen: { getByTestId: (id: string) => { element: () => Element } },
  id: string,
  want: string | RegExp,
) =>
  expect
    .poll(() => screen.getByTestId(id).element().textContent ?? "")
    .toSatisfy((t: string) =>
      typeof want === "string" ? t.includes(want) : want.test(t),
    );

const withDp = (node: React.ReactNode, dp: DataProvider) =>
  render(
    <CoreAdminContext dataProvider={dp} i18nProvider={testI18nProvider}>
      {node}
    </CoreAdminContext>,
  );

describe("offeredActions / statusLabel", () => {
  it("Complete only from in_progress; terminal states offer nothing", () => {
    expect(offeredActions("open")).toEqual(["start", "skip"]);
    expect(offeredActions("in_progress")).toEqual(["complete", "skip"]);
    for (const s of [
      "completed",
      "cancelled",
      "blocked",
      "ambiguous",
      "lapsed",
    ])
      expect(offeredActions(s)).toEqual([]);
  });
  it("cancelled + skipped reads 'Skipped'", () => {
    expect(statusLabel({ status: "cancelled", status_reason: "skipped" })).toBe(
      "Skipped",
    );
    expect(statusLabel({ status: "in_progress" })).toBe("in progress");
  });
});

describe("AomLinkPanel", () => {
  it("Complete is hidden on an OPEN AOM-originated card (Start first)", async () => {
    const { dp } = makeDp(rec("open"), []);
    const screen = await withDp(
      <AomLinkPanel record={rec("open")} aom={aomRow} />,
      dp,
    );
    await expect.element(screen.getByTestId("aom-action-start")).toBeVisible();
    await expect.element(screen.getByTestId("aom-action-skip")).toBeVisible();
    expect(screen.getByTestId("aom-action-complete").query()).toBeNull();
  });

  it("in_progress offers Complete and Skip, not Start; shows link-back path and provenance", async () => {
    const { dp } = makeDp(rec("in_progress"), []);
    const screen = await withDp(
      <AomLinkPanel record={rec("in_progress")} aom={aomRow} />,
      dp,
    );
    await expect
      .element(screen.getByTestId("aom-action-complete"))
      .toBeVisible();
    expect(screen.getByTestId("aom-action-start").query()).toBeNull();
    await hasText(screen, "aom-open-path", aomRow.deep_link_path);
    await hasText(screen, "aom-provenance", `aom · assignment:${ID}`);
  });

  it("completed and Skipped cards offer no actions (no reopen); label says Skipped", async () => {
    const { dp } = makeDp(rec("completed"), []);
    const done = await withDp(
      <AomLinkPanel record={rec("completed")} aom={aomRow} />,
      dp,
    );
    expect(done.getByTestId("aom-actions").query()).toBeNull();
    await done.unmount();
    const skipped = await withDp(
      <AomLinkPanel
        record={rec("cancelled", { status_reason: "skipped" })}
        aom={aomRow}
      />,
      dp,
    );
    await hasText(skipped, "aom-status", "Skipped");
    expect(skipped.getByTestId("aom-actions").query()).toBeNull();
  });

  it("Start asks AOM (never writes Atomic status) and shows a waiting state", async () => {
    const invoke = vi.fn<Invoke>(async () => ({
      data: { ok: true, result: "applied", aom_status: "in_progress" },
      error: null,
    }));
    const { dp, update } = makeDp(rec("open"), []);
    const screen = await withDp(
      <AomLinkPanel record={rec("open")} aom={aomRow} invoke={invoke} />,
      dp,
    );
    await screen.getByTestId("aom-action-start").click();
    await hasText(screen, "aom-status", /waiting for AOM/);
    expect(invoke).toHaveBeenCalledWith(ID, "start");
    expect(update).not.toHaveBeenCalled();
  });
});

// A client that bypasses the hidden button (forced Complete from `open`) must hit the restore path.
const Forced = ({ invoke }: { invoke: Invoke }) => {
  const r = rec("open");
  const wb = useAomWriteBack(r, { invoke });
  return (
    <div>
      <output data-testid="shown">{wb.shownStatus}</output>
      <output data-testid="err">{wb.error ?? ""}</output>
      <button onClick={() => void wb.send("complete")}>force-complete</button>
    </div>
  );
};

describe("write-back rejection restores the last projected status", () => {
  it("Complete forced from open → AOM 409 invalid_transition → status restored to open, error surfaced, no chain", async () => {
    const invoke = vi.fn<Invoke>(async () => ({
      data: { ok: false, error: "invalid_transition", aom_status: "planned" },
      error: null,
    }));
    const { dp, update } = makeDp(rec("open"), []);
    const screen = await withDp(<Forced invoke={invoke} />, dp);
    await screen.getByRole("button", { name: "force-complete" }).click();
    await hasText(screen, "err", /Start the item first/);
    await hasText(screen, "shown", "open");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(ID, "complete");
    expect(update).not.toHaveBeenCalled();
  });

  it("network failure (invoke throws) also restores and surfaces", async () => {
    const invoke = vi.fn<Invoke>(async () => {
      throw new Error("offline");
    });
    const { dp } = makeDp(rec("open"), []);
    const screen = await withDp(<Forced invoke={invoke} />, dp);
    await screen.getByRole("button", { name: "force-complete" }).click();
    await hasText(screen, "err", /could not be reached/);
    await hasText(screen, "shown", "open");
  });
});

describe("ActionDrawer for AOM-originated vs ordinary rows", () => {
  it("AOM row: read-only title/account, no status select, panel present", async () => {
    const { dp } = makeDp(rec("open"), [aomRow]);
    const screen = await withDp(
      <ActionDrawer item={ID} onClose={() => undefined} />,
      dp,
    );
    await expect.element(screen.getByTestId("aom-link-panel")).toBeVisible();
    await expect
      .element(screen.getByTestId("action-drawer-title-readonly"))
      .toBeVisible();
    expect(screen.getByTestId("action-drawer-title").query()).toBeNull();
    expect(screen.getByTestId("action-drawer-status").query()).toBeNull();
    expect(screen.getByTestId("aom-action-complete").query()).toBeNull();
  });

  it("ordinary row: unchanged editable title + status select, no panel", async () => {
    const { dp } = makeDp(rec("open"), []);
    const screen = await withDp(
      <ActionDrawer item={ID} onClose={() => undefined} />,
      dp,
    );
    await expect
      .element(screen.getByTestId("action-drawer-status"))
      .toBeVisible();
    await expect
      .element(screen.getByTestId("action-drawer-title"))
      .toBeVisible();
    expect(screen.getByTestId("aom-link-panel").query()).toBeNull();
  });
});
