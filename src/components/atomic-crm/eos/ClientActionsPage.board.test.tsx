// CE MF2 (v1d U2 review): board Prev/Next must use the board's ids, never the
// List's perPage:1 page. Page-level, with the real List + board + drawer.
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { MemoryRouter, useLocation } from "react-router";
import { CoreAdminContext, type DataProvider } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { ClientActionsPage } from "./ClientActionsPage";
import { makeFakeProvider, type FakeRow } from "./boardFakeProvider.testutil";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("../providers/supabase/supabase", () => ({
  getSupabaseClient: () => {
    throw new Error("no network in this test");
  },
}));

const row = (
  id: string,
  status: string,
  due: string,
  extra: Partial<FakeRow> = {},
): FakeRow => ({
  id,
  title: `Action ${id}`,
  status,
  needs_review: false,
  company_id: 8,
  owner_sales_id: 3,
  priority: "medium",
  direction: "to_client",
  due_date: due,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: new Date().toISOString(),
  archived_at: null,
  ...extra,
});

// Open lane (due order): r1, r2, r3. In progress: r4. Completed: c1.
const ROWS = [
  row("r2", "open", "2026-11-12"),
  row("r1", "open", "2026-11-10"),
  row("r3", "open", "2026-11-14"),
  row("r4", "in_progress", "2026-11-11"),
  row("c1", "completed", "2026-11-01"),
];

/** Optionally delay the List's own query (perPage 1 in board view). */
const withListDelay = (dp: DataProvider, ms: number): DataProvider => ({
  ...dp,
  getList: async (r: string, p: any) => {
    const isListQuery =
      r === "eos_commitments" &&
      p.pagination?.perPage === 1 &&
      p.sort?.field !== "id";
    if (isListQuery && ms > 0) await new Promise((res) => setTimeout(res, ms));
    return dp.getList(r, p);
  },
});

const Url = () => {
  const loc = useLocation();
  return <output data-testid="url">{`${loc.pathname}${loc.search}`}</output>;
};

const renderPage = (url: string, listDelay = 0) => {
  const { dp } = makeFakeProvider(ROWS);
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CoreAdminContext
        dataProvider={withListDelay(dp, listDelay)}
        i18nProvider={testI18nProvider}
      >
        <ClientActionsPage />
        <Url />
      </CoreAdminContext>
    </MemoryRouter>,
  );
};

const btn = (id: string) =>
  document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);

const waitBoard = () =>
  expect
    .poll(
      () =>
        document.querySelectorAll(
          '[data-testid="board-lane-open"] [data-lane-card]',
        ).length,
    )
    .toBe(3);

describe("ClientActionsPage board Prev/Next (CE MF2)", () => {
  for (const delay of [0, 800]) {
    it(`middle card ?view=board&item=r2: Prev and Next enabled (List query delay ${delay}ms)`, async () => {
      await renderPage("/client-actions?tab=all&view=board&item=r2", delay);
      await waitBoard();
      await expect.poll(() => btn("action-drawer-prev")?.disabled).toBe(false);
      await expect.poll(() => btn("action-drawer-next")?.disabled).toBe(false);
      // Let the List's own query resolve; it must not clobber the board ids.
      await new Promise((r) => setTimeout(r, delay + 300));
      expect(btn("action-drawer-prev")?.disabled).toBe(false);
      expect(btn("action-drawer-next")?.disabled).toBe(false);
      await userEvent.click(btn("action-drawer-next")!);
      await expect
        .poll(() => document.querySelector('[data-testid="url"]')?.textContent)
        .toContain("item=r3");
    });
  }

  it("lane boundary: last Open card's Next is the first In progress card", async () => {
    await renderPage("/client-actions?tab=all&view=board&item=r3");
    await waitBoard();
    await expect.poll(() => btn("action-drawer-next")?.disabled).toBe(false);
    await userEvent.click(btn("action-drawer-next")!);
    await expect
      .poll(() => document.querySelector('[data-testid="url"]')?.textContent)
      .toContain("item=r4");
    await expect.poll(() => btn("action-drawer-prev")?.disabled).toBe(false);
    await userEvent.click(btn("action-drawer-prev")!);
    await expect
      .poll(() => document.querySelector('[data-testid="url"]')?.textContent)
      .toContain("item=r3");
  });

  it("Show in list lands on view=list&status=completed with the completed rows", async () => {
    await renderPage("/client-actions?tab=all&view=board");
    await waitBoard();
    await expect
      .poll(
        () =>
          document.querySelectorAll(
            '[data-testid="board-lane-completed"] [data-lane-card]',
          ).length,
      )
      .toBe(1);
    await userEvent.click(btn("board-completed-show-in-list")!);
    await expect
      .poll(() => document.querySelector('[data-testid="url"]')?.textContent)
      .toMatch(/view=list/);
    const url = document.querySelector('[data-testid="url"]')!.textContent!;
    expect(new URLSearchParams(url.split("?")[1]).get("status")).toBe(
      "completed",
    );
    await expect
      .poll(() =>
        document.querySelector('[data-open-item="c1"]') ? "c1" : null,
      )
      .toBe("c1");
    expect(document.querySelector('[data-open-item="r1"]')).toBeNull();
  });
});
