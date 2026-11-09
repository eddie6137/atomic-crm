import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { CoreAdminContext, type DataProvider } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { ActionDrawer } from "./ActionDrawer";
import { FORBIDDEN_WRITE_KEYS } from "./actionDrawerWrites";

vi.mock("../providers/supabase/supabase", () => ({
  getSupabaseClient: () => {
    throw new Error("no network in this test");
  },
}));

const SENTINEL_RAW = "SENTINEL-RAW-7f3a-do-not-render";
const SENTINEL_PATH = "sentinel-uuid-9c1e/SENTINEL-PATH-secret-brief.pdf";
const SENTINEL_URL = "https://sentinel.invalid/SENTINEL-URL-private-doc";

const sales = [
  { id: 3, first_name: "Pat", last_name: "Demo" },
  { id: 4, first_name: "Terry", last_name: "Team" },
];
const companies = [
  { id: 8, name: "[Demo] Acme Widgets" },
  { id: 9, name: "[Demo] Beta Co" },
];
const projects = [{ id: "p1", title: "Launch", company_id: 8 }];

const baseRecord = () => ({
  id: "c1",
  title: "Send deck",
  status: "open",
  owner_sales_id: 3,
  due_date: "2026-11-20",
  priority: "medium",
  direction: null,
  company_id: 8,
  project_id: null as string | null,
  needs_review: false,
  archived_at: null as string | null,
  blocker: null,
  definition_of_done: null,
  raw: { a: 1 },
  revision: 4,
  updated_at: "2026-11-08T10:00:00Z",
  attachments: [
    {
      path: "u/brief.pdf",
      title: "brief.pdf",
      uploaded_at: "2026-11-01T00:00:00Z",
    },
  ],
  links: [{ url: "https://example.invalid/brief", label: "Brief" }],
});

const activity = [
  {
    id: 12,
    table_name: "eos_commitments",
    record_id: "c1",
    action: "update",
    actor_sales_id: null,
    created_at: "2026-11-08T12:00:00Z",
    changes: {
      raw: { note: SENTINEL_RAW },
      attachments: [{ path: SENTINEL_PATH, title: "brief.pdf" }],
      links: [{ url: SENTINEL_URL, label: "Doc" }],
      definition_of_done: SENTINEL_RAW,
    },
  },
  {
    id: 11,
    table_name: "eos_commitments",
    record_id: "c1",
    action: "update",
    actor_sales_id: 3,
    created_at: "2026-11-07T12:00:00Z",
    changes: { owner_sales_id: 4, company_id: 9, archived_at: null },
  },
  {
    id: 10,
    table_name: "eos_commitments",
    record_id: "c1",
    action: "insert",
    actor_sales_id: 4,
    created_at: "2026-11-06T12:00:00Z",
    changes: null,
  },
];

const table = (r: string): any[] =>
  r === "sales"
    ? sales
    : r === "companies"
      ? companies
      : r === "eos_projects"
        ? projects
        : [];

const makeDp = (record = baseRecord()) => {
  const update = vi.fn(async (_r: string, p: any) => {
    Object.assign(record, p.data, { updated_at: new Date().toISOString() });
    return { data: { ...record } };
  });
  const getMany = vi.fn(async (r: string, p: any) => ({
    data: table(r).filter((x) => p.ids.map(String).includes(String(x.id))),
  }));
  const dp = {
    getOne: async (r: string, p: any) => {
      if (r === "eos_commitments") {
        if (String(p.id) !== record.id) throw new Error("Not found");
        return { data: { ...record } };
      }
      const hit = table(r).find((x) => String(x.id) === String(p.id));
      if (!hit) throw new Error("Not found");
      return { data: hit };
    },
    getList: async (r: string) => {
      const data = r === "eos_activity" ? activity : table(r);
      return { data, total: data.length };
    },
    getMany,
    getManyReference: async () => ({ data: [], total: 0 }),
    create: async () => ({ data: { id: 1 } }),
    update,
    updateMany: async () => ({ data: [] }),
    delete: async () => ({ data: { id: 1 } }),
    deleteMany: async () => ({ data: [] }),
  } as unknown as DataProvider;
  return { dp, update, getMany, record };
};

const renderDrawer = (dp: DataProvider, item = "c1") =>
  render(
    <CoreAdminContext dataProvider={dp} i18nProvider={testI18nProvider}>
      <ActionDrawer item={item} onClose={() => undefined} />
    </CoreAdminContext>,
  );

const sentKeys = (update: any) =>
  update.mock.calls.map((c: any[]) => Object.keys(c[1].data));

describe("ActionDrawer (v1d U1)", () => {
  it("unknown id shows a Not found state and does not throw", async () => {
    const { dp } = makeDp();
    const screen = await renderDrawer(dp, "does-not-exist");
    await expect.element(screen.getByText("Action not found")).toBeVisible();
  });
  it("archived id shows an archived state", async () => {
    const { dp } = makeDp({
      ...baseRecord(),
      archived_at: "2026-11-08T00:00:00Z",
    });
    const screen = await renderDrawer(dp);
    await expect
      .element(screen.getByText("This action is archived"))
      .toBeVisible();
  });
  it("renders the record and the activity log with the privacy rules (sentinels)", async () => {
    const { dp, getMany } = makeDp();
    const screen = await renderDrawer(dp);
    await expect
      .element(screen.getByTestId("action-drawer-title"))
      .toHaveValue("Send deck");
    await expect.element(screen.getByText("Files updated (1)")).toBeVisible();
    await expect.element(screen.getByText("Links updated (1)")).toBeVisible();
    await expect
      .element(screen.getByText("Other fields updated"))
      .toBeVisible();
    await expect.element(screen.getByText("System")).toBeVisible();
    await expect.element(screen.getByText("Unarchived")).toBeVisible();
    await expect.element(screen.getByText("Created")).toBeVisible();
    await expect
      .element(screen.getByText("set owner to Terry Team"))
      .toBeVisible();
    await expect
      .element(screen.getByText("set account to [Demo] Beta Co"))
      .toBeVisible();
    const text = document.body.textContent ?? "";
    for (const s of [SENTINEL_RAW, SENTINEL_PATH, SENTINEL_URL])
      expect(text).not.toContain(s);
    expect(document.body.innerHTML).not.toContain("SENTINEL");
    // Batched lookups: one getMany per resource, never one per entry.
    const salesCalls = getMany.mock.calls.filter((c) => c[0] === "sales");
    const companyCalls = getMany.mock.calls.filter((c) => c[0] === "companies");
    expect(salesCalls.length).toBeGreaterThanOrEqual(1);
    expect(
      new Set(salesCalls.map((c) => JSON.stringify(c[1].ids))).size,
    ).toBeLessThanOrEqual(2);
    expect(companyCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("status, priority and title each send only the edited key", async () => {
    const { dp, update } = makeDp();
    const screen = await renderDrawer(dp);
    await screen.getByTestId("action-drawer-status").selectOptions("completed");
    await expect.poll(() => update.mock.calls.length).toBe(1);
    expect(update.mock.calls[0][1].data).toEqual({ status: "completed" });
    await expect
      .element(screen.getByTestId("action-drawer-status"))
      .toBeEnabled();
    await screen.getByTestId("action-drawer-priority").selectOptions("high");
    await expect.poll(() => update.mock.calls.length).toBe(2);
    expect(update.mock.calls[1][1].data).toEqual({ priority: "high" });
    const title = screen.getByTestId("action-drawer-title");
    await title.fill("Send revised deck");
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => update.mock.calls.length).toBe(3);
    expect(update.mock.calls[2][1].data).toEqual({
      title: "Send revised deck",
    });
    for (const keys of sentKeys(update)) {
      expect(keys).toHaveLength(1);
      for (const k of FORBIDDEN_WRITE_KEYS) expect(keys).not.toContain(k);
    }
  });

  it("Escape cancels a title edit without writing", async () => {
    const { dp, update } = makeDp();
    const screen = await renderDrawer(dp);
    const title = screen.getByTestId("action-drawer-title");
    await title.fill("Oops");
    await userEvent.keyboard("{Escape}");
    await expect.element(title).toHaveValue("Send deck");
    await expect.element(screen.getByTestId("action-drawer")).toBeVisible();
    expect(update).not.toHaveBeenCalled();
  });

  it("due date via the calendar sends only due_date; Escape in the calendar closes only the popover", async () => {
    const { dp, update } = makeDp();
    const screen = await renderDrawer(dp);
    const field = screen.getByTestId("action-drawer-field-due_date");
    await field.getByRole("button", { name: "Open calendar" }).click();
    await expect
      .element(screen.getByTestId("date-picker-calendar"))
      .toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect
      .element(screen.getByTestId("date-picker-calendar"))
      .not.toBeInTheDocument();
    await expect.element(screen.getByTestId("action-drawer")).toBeVisible();
    await field.getByRole("button", { name: "Open calendar" }).click();
    await screen
      .getByRole("button", { name: "Saturday, November 21, 2026" })
      .click();
    await expect.poll(() => update.mock.calls.length).toBe(1);
    expect(update.mock.calls[0][1].data).toEqual({ due_date: "2026-11-21" });
  });

  it("owner via the picker sends only owner_sales_id", async () => {
    const { dp, update } = makeDp();
    const screen = await renderDrawer(dp);
    const field = screen.getByTestId("action-drawer-field-owner_sales_id");
    await field.getByRole("combobox").click();
    await screen.getByRole("option", { name: "Terry Team" }).click();
    await expect.poll(() => update.mock.calls.length).toBe(1);
    expect(update.mock.calls[0][1].data).toEqual({ owner_sales_id: 4 });
  });

  it("account: editable with no Clear", async () => {
    const { dp } = makeDp();
    const screen = await renderDrawer(dp);
    const field = screen.getByTestId("action-drawer-field-company_id");
    await expect.element(field.getByRole("combobox")).toBeVisible();
    expect(field.element().querySelector("[aria-label*='Clear' i]")).toBeNull();
  });
  it("account: locked with a hint when a project is set", async () => {
    const { dp } = makeDp({ ...baseRecord(), project_id: "p1" });
    const screen = await renderDrawer(dp);
    await expect
      .element(screen.getByTestId("action-drawer-account-locked"))
      .toBeVisible();
    await expect
      .element(screen.getByText(/Change account in full edit/))
      .toBeVisible();
    expect(
      document.querySelector("[data-testid='action-drawer-field-company_id']"),
    ).toBeNull();
  });
});
