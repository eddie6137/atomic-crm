import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import {
  CoreAdminContext,
  ListContextProvider,
  type DataProvider,
} from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { ClientActionsBoard } from "./ClientActionsBoard";
import {
  BOARD_LANES,
  completedBoardFilter,
  confirmReviewPatch,
  laneCountFilter,
  OPEN_BOARD_CAP,
  OPEN_BOARD_SORT,
  type BoardLane,
} from "./boardLanes";
import { CLIENT_ACTION_TABS, clientActionFilter } from "./clientActions";
import {
  makeFakeProvider,
  mixedRows,
  queryRows,
  type FakeRow,
} from "./boardFakeProvider.testutil";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const NOW = new Date("2026-11-08T20:00:00Z"); // noon-ish PT
const ME = 3;

const mkOpenRows = (n: number): FakeRow[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${String(i).padStart(3, "0")}`,
    title: `${i % 2 ? "Deck" : "Task"} ${i}`,
    status:
      i % 17 === 0
        ? "ambiguous"
        : i % 5 === 0
          ? "in_progress"
          : i % 11 === 0
            ? "blocked"
            : "open",
    needs_review: i % 17 === 0 || i % 23 === 0,
    company_id: 8,
    owner_sales_id: 4,
    priority: null,
    direction: null,
    // many ties on due_date (28 distinct values) and some nulls
    due_date:
      i % 13 === 0 ? null : `2026-11-${String((i % 28) + 1).padStart(2, "0")}`,
    created_at: `2026-11-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
    updated_at: "2026-11-08T10:00:00Z",
    archived_at: null,
  }));

const renderBoard = async (
  dp: DataProvider,
  permanentFilter: Record<string, unknown>,
  filterValues: Record<string, unknown> = {},
  extra: { onIds?: (ids: string[]) => void; onShow?: () => void } = {},
) =>
  render(
    <CoreAdminContext dataProvider={dp} i18nProvider={testI18nProvider}>
      <ListContextProvider
        value={
          {
            data: [],
            total: 0,
            filterValues,
            displayedFilters: {},
            isPending: false,
          } as any
        }
      >
        <ClientActionsBoard
          permanentFilter={permanentFilter}
          onOpenItem={() => undefined}
          onShowCompletedInList={extra.onShow ?? (() => undefined)}
          onIds={extra.onIds}
        />
      </ListContextProvider>
    </CoreAdminContext>,
  );

const laneIds = (lane: BoardLane) =>
  Array.from(
    document.querySelectorAll(
      `[data-testid="board-lane-${lane}"] [data-lane-card]`,
    ),
  ).map((el) => el.getAttribute("data-lane-card")!);

const laneCountText = (lane: BoardLane) =>
  document.querySelector(`[data-testid="board-lane-count-${lane}"]`)
    ?.textContent ?? "";

/** Expected lane totals straight from the data (what the count queries return). */
const expectedTotals = (
  rows: FakeRow[],
  base: Record<string, unknown>,
): Record<BoardLane, number> => {
  const openTotal = queryRows(rows, base).length;
  const open = queryRows(rows, laneCountFilter(base, "open")).length;
  const inProg = queryRows(rows, laneCountFilter(base, "in_progress")).length;
  const blocked = queryRows(rows, laneCountFilter(base, "blocked")).length;
  return {
    needs_review: openTotal - open - inProg - blocked,
    open,
    in_progress: inProg,
    blocked,
    completed: queryRows(rows, completedBoardFilter(base, new Date())).length,
  };
};

const waitLoaded = () =>
  expect
    .poll(() =>
      BOARD_LANES.every(
        (l) => laneCountText(l) !== "" && !laneCountText(l).includes("…"),
      ),
    )
    .toBe(true);

describe("ClientActionsBoard (v1d U2)", () => {
  for (const q of [undefined, "deck"]) {
    it(`cap > 200${q ? " with q" : ""}: every truncated lane shows "first n of N" and N = its count query`, async () => {
      const rows = mkOpenRows(260);
      const { dp, getList } = makeFakeProvider(rows);
      const permanentFilter = clientActionFilter("all", { now: NOW })!;
      const filterValues = q ? { q } : {};
      await renderBoard(dp, permanentFilter, filterValues);
      await waitLoaded();
      const base = { ...filterValues, ...permanentFilter };
      const totals = expectedTotals(rows, base);
      const openTotal = queryRows(rows, base).length;
      if (!q) expect(openTotal).toBeGreaterThan(OPEN_BOARD_CAP); // cap actually bites
      let truncated = 0;
      for (const lane of BOARD_LANES) {
        const shown = laneIds(lane).length;
        const N = totals[lane];
        expect(shown).toBeLessThanOrEqual(N);
        if (shown < N) {
          truncated++;
          expect(laneCountText(lane)).toBe(`first ${shown} of ${N}`);
        } else {
          expect(laneCountText(lane)).toBe(String(N));
        }
      }
      if (!q) expect(truncated).toBeGreaterThan(0);
      // Loaded open cards are exactly the first 200 of the fixed server order.
      const loaded = BOARD_LANES.filter((l) => l !== "completed").flatMap(
        laneIds,
      );
      expect(new Set(loaded)).toEqual(
        new Set(
          queryRows(rows, base, OPEN_BOARD_SORT)
            .slice(0, OPEN_BOARD_CAP)
            .map((r) => r.id),
        ),
      );
      // Every board query carries q and none uses @or.
      const calls = getList.mock.calls.filter(
        (c) => c[0] === "eos_commitments",
      );
      expect(calls).toHaveLength(5);
      for (const c of calls) {
        expect(JSON.stringify(c[1].filter)).not.toMatch(/@or/);
        if (q) expect(c[1].filter.q).toBe(q);
      }
    });
  }

  const combos: Array<[string, Record<string, unknown>]> = [
    ["no filters", {}],
    ["priority + account", { priority: "medium", company_id: 9 }],
    ["q", { q: "deck" }],
    ["q + owner", { q: "task", owner_sales_id: 4 }],
  ];
  for (const tab of CLIENT_ACTION_TABS.map((t) => t.id)) {
    for (const [label, filterValues] of combos) {
      it(`list↔board ID parity: tab=${tab}, ${label}`, async () => {
        const rows = mixedRows();
        const { dp } = makeFakeProvider(rows);
        const permanentFilter = clientActionFilter(tab, {
          now: NOW,
          identityId: ME,
        })!;
        await renderBoard(dp, permanentFilter, filterValues);
        await waitLoaded();
        // List: all pages of the same tab + filters (open set; permanent filter wins).
        const listIds = queryRows(rows, {
          ...filterValues,
          ...permanentFilter,
        }).map((r) => r.id);
        const boardOpen = (
          ["needs_review", "open", "in_progress", "blocked"] as const
        ).flatMap(laneIds);
        expect(new Set(boardOpen).size).toBe(boardOpen.length); // 0 duplicates
        expect([...boardOpen].sort()).toEqual([...listIds].sort());
        // Completed ⊆ list at status=completed (same tab + filters).
        const listCompleted = new Set(
          queryRows(rows, {
            ...filterValues,
            ...clientActionFilter(tab, {
              now: NOW,
              identityId: ME,
              status: "completed",
            })!,
          }).map((r) => r.id),
        );
        for (const id of laneIds("completed"))
          expect(listCompleted.has(id)).toBe(true);
      });
    }
  }

  it("dataset sanity: parity cases are non-trivial", () => {
    const rows = mixedRows();
    const all = clientActionFilter("all", { now: NOW, identityId: ME })!;
    expect(queryRows(rows, all).length).toBeGreaterThan(20);
    expect(queryRows(rows, { q: "deck", ...all }).length).toBeGreaterThan(3);
    expect(
      queryRows(
        rows,
        clientActionFilter("all", { now: NOW, status: "completed" })!,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("Completed lane is non-empty here, a subset of the list, and Show in list fires", async () => {
    const rows = mixedRows();
    const { dp } = makeFakeProvider(rows);
    const onShow = vi.fn();
    const permanentFilter = clientActionFilter("all", { now: NOW })!;
    await renderBoard(dp, permanentFilter, {}, { onShow });
    await waitLoaded();
    expect(laneIds("completed").length).toBeGreaterThan(0);
    await userEvent.click(
      document.querySelector<HTMLElement>(
        '[data-testid="board-completed-show-in-list"]',
      )!,
    );
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("Prev/Next ids: lanes in order, no duplicates", async () => {
    const rows = mixedRows();
    const { dp } = makeFakeProvider(rows);
    const onIds = vi.fn();
    await renderBoard(
      dp,
      clientActionFilter("all", { now: NOW })!,
      {},
      {
        onIds,
      },
    );
    await waitLoaded();
    const expected = BOARD_LANES.flatMap(laneIds);
    await expect.poll(() => onIds.mock.calls.at(-1)?.[0]).toEqual(expected);
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
      confirmReviewPatch({
        status: "open",
        needs_review: true,
        company_id: null,
      }),
    ).toBeNull();
  });
});
