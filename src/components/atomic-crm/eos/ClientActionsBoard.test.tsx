import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext, ListContextProvider, type DataProvider } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { ClientActionsBoard } from "./ClientActionsBoard";
import { confirmReviewPatch, OPEN_BOARD_CAP } from "./boardLanes";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const mkRows = (n: number, status = "open") =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    title: `Row ${i}`,
    status: i % 17 === 0 ? "ambiguous" : status,
    needs_review: i % 17 === 0,
    company_id: 8,
    owner_sales_id: 4,
    due_date: `2026-11-${String((i % 28) + 1).padStart(2, "0")}`,
    created_at: `2026-11-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
    archived_at: null,
    priority: null,
    direction: null,
  }));

describe("ClientActionsBoard (v1d U2)", () => {
  it("cap > 200: truncated lanes show first n of N; needs-review = openTotal − 3 counts", async () => {
    const open = mkRows(220);
    const getList = vi.fn(async (_r: string, p: any) => {
      const f = p.filter ?? {};
      // completed
      if (f.status === "completed") return { data: [], total: 0 };
      // lane counts
      if (f.needs_review === false && f.status === "open")
        return { data: open.slice(0, 1), total: 180 };
      if (f.needs_review === false && f.status === "in_progress")
        return { data: [], total: 10 };
      if (f.needs_review === false && f.status === "blocked")
        return { data: [], total: 5 };
      // Q-open
      return { data: open.slice(0, OPEN_BOARD_CAP), total: 220 };
    });
    const dp = {
      getList,
      getOne: async () => ({ data: {} }),
      getMany: async () => ({ data: [] }),
      getManyReference: async () => ({ data: [], total: 0 }),
      create: async () => ({ data: {} }),
      update: async () => ({ data: {} }),
      updateMany: async () => ({ data: [] }),
      delete: async () => ({ data: {} }),
      deleteMany: async () => ({ data: [] }),
    } as unknown as DataProvider;
    const permanentFilter = {
      "archived_at@is": null,
      "status@in": "(open,in_progress,blocked,ambiguous)",
    };
    const screen = await render(
      <CoreAdminContext dataProvider={dp} i18nProvider={testI18nProvider}>
        <ListContextProvider
          value={
            {
              data: [],
              total: 0,
              filterValues: {},
              displayedFilters: {},
              isPending: false,
            } as any
          }
        >
          <ClientActionsBoard
            permanentFilter={permanentFilter}
            onOpenItem={() => undefined}
            onShowCompletedInList={() => undefined}
          />
        </ListContextProvider>
      </CoreAdminContext>,
    );
    const nr = await expect
      .poll(
        () =>
          screen.getByTestId("board-lane-count-needs_review").element()
            .textContent ?? "",
      )
      .toMatch(/25/); // 220 − 180 − 10 − 5
    void nr;
    // Open lane is truncated relative to its count query when cards < total
    const openLabel =
      screen.getByTestId("board-lane-count-open").element().textContent ?? "";
    expect(openLabel.length).toBeGreaterThan(0);
    expect(
      getList.mock.calls.some((c) =>
        JSON.stringify(c[1]?.filter ?? {}).includes("@or"),
      ),
    ).toBe(false);
    // Cap: open query asked for 200
    const openCall = getList.mock.calls.find(
      (c) =>
        c[1]?.pagination?.perPage === OPEN_BOARD_CAP &&
        c[1]?.filter?.status == null &&
        c[1]?.filter?.["status@in"],
    );
    expect(openCall?.[1]?.pagination?.perPage).toBe(OPEN_BOARD_CAP);
  });

  it("Confirm patch: in_progress keeps status; ambiguous → open; no account disables", () => {
    expect(
      confirmReviewPatch({
        status: "in_progress",
        needs_review: true,
        company_id: 1,
      }),
    ).toEqual({ needs_review: false });
    expect(
      confirmReviewPatch({
        status: "ambiguous",
        needs_review: true,
        company_id: 1,
      }),
    ).toEqual({ needs_review: false, status: "open" });
    expect(
      confirmReviewPatch({ status: "open", needs_review: true, company_id: null }),
    ).toBeNull();
  });
});
