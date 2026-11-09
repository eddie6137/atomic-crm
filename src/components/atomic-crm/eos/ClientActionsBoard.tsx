import { useEffect, useMemo, useState } from "react";
import {
  useGetList,
  useListContext,
  useNotify,
  useRefresh,
  useUpdate,
} from "ra-core";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { ActionCard } from "./ActionCard";
import {
  BOARD_LANE_LABEL,
  BOARD_LANES,
  bucketOpenCards,
  COMPLETED_BOARD_CAP,
  completedBoardFilter,
  confirmReviewPatch,
  laneCountFilter,
  laneHeaderCount,
  OPEN_BOARD_CAP,
  OPEN_BOARD_SORT,
  sortOpenBoardCards,
  statusMovePatch,
  type BoardLane,
} from "./boardLanes";
import { StatusSelectOptions } from "./StatusSelectOptions";
import { useScrollToHighlightOnce } from "./useScrollToHighlightOnce";

const selectClass =
  "min-h-11 md:min-h-8 rounded-md border bg-background text-foreground scheme-light dark:scheme-dark px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60";

type Props = {
  highlightId?: string | null;
  onOpenItem: (id: string | number) => void;
  /** List permanent filter (tab predicates + open set). Merged with filterValues. */
  permanentFilter: Record<string, unknown>;
  /** Switch Completed → list with status=completed. */
  onShowCompletedInList: () => void;
  /** Report visible card ids (open set + completed) for drawer Prev/Next. */
  onIds?: (ids: string[]) => void;
};

/**
 * v1d U2 board (spec §5 U2, D2). Tap-only status moves (no drag — v1e).
 * Queries: Q-open (200), 3× lane counts, Needs-review by subtraction, Q-done (14 PT days).
 */
export const ClientActionsBoard = ({
  highlightId,
  onOpenItem,
  permanentFilter,
  onShowCompletedInList,
  onIds,
}: Props) => {
  const isMobile = useIsMobile();
  const { filterValues } = useListContext();
  // ra merges permanent filter over filterValues for the List query; mirror that here.
  const baseFilter = useMemo(() => {
    const f = {
      ...(filterValues as Record<string, unknown>),
      ...permanentFilter,
    };
    delete f.status; // board ignores status chip (N2)
    return f;
  }, [filterValues, permanentFilter]);

  const openFilter = useMemo(() => {
    const f = { ...baseFilter };
    // Ensure open set (tab filter already has it via List permanent filter).
    return f;
  }, [baseFilter]);

  const {
    data: openRows,
    total: openTotal,
    isPending: openPending,
    error: openError,
  } = useGetList(
    "eos_commitments",
    {
      filter: openFilter,
      pagination: { page: 1, perPage: OPEN_BOARD_CAP },
      sort: OPEN_BOARD_SORT,
    },
    { retry: false },
  );

  const openSorted = useMemo(
    () => sortOpenBoardCards(openRows ?? []),
    [openRows],
  );
  const buckets = useMemo(() => bucketOpenCards(openSorted), [openSorted]);

  const countOpen = useLaneCount(openFilter, "open");
  const countInProg = useLaneCount(openFilter, "in_progress");
  const countBlocked = useLaneCount(openFilter, "blocked");
  const needsReviewTotal =
    openTotal != null &&
    countOpen.total != null &&
    countInProg.total != null &&
    countBlocked.total != null
      ? Math.max(
          0,
          openTotal - countOpen.total - countInProg.total - countBlocked.total,
        )
      : undefined;

  const doneFilter = useMemo(
    () => completedBoardFilter(baseFilter),
    [baseFilter],
  );
  const {
    data: doneRows,
    total: doneTotal,
    isPending: donePending,
  } = useGetList(
    "eos_commitments",
    {
      filter: doneFilter,
      pagination: { page: 1, perPage: COMPLETED_BOARD_CAP },
      sort: { field: "updated_at", order: "DESC" },
    },
    { retry: false },
  );

  const laneTotals: Record<BoardLane, number | undefined> = {
    needs_review: needsReviewTotal,
    open: countOpen.total,
    in_progress: countInProg.total,
    blocked: countBlocked.total,
    completed: doneTotal,
  };
  const laneCards: Record<BoardLane, any[]> = {
    needs_review: buckets.needs_review,
    open: buckets.open,
    in_progress: buckets.in_progress,
    blocked: buckets.blocked,
    completed: doneRows ?? [],
  };

  useEffect(() => {
    if (!onIds) return;
    const ids = [
      ...buckets.needs_review,
      ...buckets.open,
      ...buckets.in_progress,
      ...buckets.blocked,
      ...(doneRows ?? []),
    ].map((r) => String(r.id));
    onIds(ids);
  }, [buckets, doneRows, onIds]);

  useScrollToHighlightOnce(
    highlightId,
    !openPending && !donePending,
  );

  const [mobileLane, setMobileLane] = useState<BoardLane>("open");

  if (openError)
    return (
      <p className="text-sm text-muted-foreground p-2" data-testid="board-error">
        Could not load the board.
      </p>
    );

  const lanes = isMobile ? [mobileLane] : [...BOARD_LANES];

  return (
    <div className="flex flex-col gap-2 min-w-0" data-testid="client-actions-board">
      {isMobile && (
        <div
          role="tablist"
          aria-label="Board lanes"
          className="flex gap-1 overflow-x-auto pb-[env(safe-area-inset-bottom)] sticky top-0 z-10 bg-background"
          data-testid="board-lane-switcher"
        >
          {BOARD_LANES.map((lane) => (
            <button
              key={lane}
              type="button"
              role="tab"
              aria-selected={mobileLane === lane}
              data-testid={`board-lane-chip-${lane}`}
              onClick={() => setMobileLane(lane)}
              className={`px-3 min-h-11 text-sm whitespace-nowrap rounded-full border ${mobileLane === lane ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"}`}
            >
              {shortLabel(lane)}
              {laneTotals[lane] != null ? ` (${laneTotals[lane]})` : ""}
            </button>
          ))}
        </div>
      )}
      <div
        className={
          isMobile
            ? "flex flex-col gap-2"
            : "grid grid-cols-5 gap-2 items-start min-w-0"
        }
        data-testid="board-lanes"
      >
        {lanes.map((lane) => (
          <BoardLaneColumn
            key={lane}
            lane={lane}
            cards={laneCards[lane]}
            total={laneTotals[lane]}
            openPending={openPending || donePending}
            highlightId={highlightId}
            onOpenItem={onOpenItem}
            onShowCompletedInList={
              lane === "completed" ? onShowCompletedInList : undefined
            }
          />
        ))}
      </div>
      {/* Query count marker for metrics (1 open + 3 counts + 1 done = 5; List also runs its own). */}
      <span className="sr-only" data-testid="board-query-count" data-count="5">
        5 board queries
      </span>
    </div>
  );
};

const shortLabel = (lane: BoardLane) =>
  lane === "needs_review"
    ? "Needs review"
    : lane === "in_progress"
      ? "In progress"
      : lane === "completed"
        ? "Completed"
        : BOARD_LANE_LABEL[lane].split(" ")[0];

const useLaneCount = (
  base: Record<string, unknown>,
  status: "open" | "in_progress" | "blocked",
) => {
  const filter = useMemo(() => laneCountFilter(base, status), [base, status]);
  const { total, isPending } = useGetList(
    "eos_commitments",
    {
      filter,
      pagination: { page: 1, perPage: 1 },
      sort: { field: "id", order: "ASC" },
    },
    { retry: false },
  );
  return { total: isPending ? undefined : total, isPending };
};

const BoardLaneColumn = ({
  lane,
  cards,
  total,
  openPending,
  highlightId,
  onOpenItem,
  onShowCompletedInList,
}: {
  lane: BoardLane;
  cards: any[];
  total?: number;
  openPending: boolean;
  highlightId?: string | null;
  onOpenItem: (id: string | number) => void;
  onShowCompletedInList?: () => void;
}) => (
  <section
    className="flex flex-col gap-2 min-w-0 rounded-lg border bg-muted/30 p-2"
    data-testid={`board-lane-${lane}`}
    aria-labelledby={`board-lane-h-${lane}`}
  >
    <header className="flex flex-col gap-1">
      <h3
        id={`board-lane-h-${lane}`}
        className="text-sm font-medium flex items-baseline justify-between gap-2"
      >
        <span>{BOARD_LANE_LABEL[lane]}</span>
        <span
          className="text-xs text-muted-foreground font-normal"
          data-testid={`board-lane-count-${lane}`}
        >
          {openPending && total == null
            ? "…"
            : laneHeaderCount(cards.length, total ?? cards.length)}
        </span>
      </h3>
      {lane === "completed" && onShowCompletedInList && (
        <button
          type="button"
          className="text-xs underline self-start min-h-8"
          data-testid="board-completed-show-in-list"
          onClick={onShowCompletedInList}
        >
          Show in list
        </button>
      )}
    </header>
    <div className="flex flex-col gap-2 min-h-[4rem]">
      {openPending && cards.length === 0 ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : cards.length === 0 ? (
        <p className="text-xs text-muted-foreground">None</p>
      ) : (
        cards.map((r) => (
          <ActionCard
            key={r.id}
            record={r}
            highlightId={highlightId}
            onOpen={onOpenItem}
            footer={
              <CardStatusControls record={r} lane={lane} />
            }
          />
        ))
      )}
    </div>
  </section>
);

/** Tap-only status menu + Confirm (Needs review). Partial writes only. */
const CardStatusControls = ({
  record,
  lane,
}: {
  record: any;
  lane: BoardLane;
}) => {
  const [update, { isPending }] = useUpdate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [blocker, setBlocker] = useState("");
  const [askingBlocker, setAskingBlocker] = useState(false);

  const run = (patch: Record<string, unknown>) => {
    update(
      "eos_commitments",
      { id: record.id, data: patch, previousData: record },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          notify("Saved", { type: "success" });
          refresh();
          setAskingBlocker(false);
          setBlocker("");
        },
        onError: (e: any) =>
          notify(
            e?.message ? `Could not save: ${e.message}` : "Could not save",
            { type: "error" },
          ),
      },
    );
  };

  const onStatus = (status: string) => {
    if (status === (record.status ?? "")) return;
    if (status === "blocked") {
      setAskingBlocker(true);
      return;
    }
    run(statusMovePatch(status));
  };

  const confirmPatch = confirmReviewPatch(record);

  return (
    <>
      <label className="sr-only" htmlFor={`board-status-${record.id}`}>
        Status
      </label>
      <select
        id={`board-status-${record.id}`}
        data-testid="board-card-status"
        className={selectClass}
        value={record.status ?? ""}
        disabled={isPending}
        onChange={(e) => onStatus(e.target.value)}
      >
        <StatusSelectOptions current={record.status} />
      </select>
      {askingBlocker && (
        <div className="flex flex-col gap-1 w-full" data-testid="board-blocker-prompt">
          <input
            className={selectClass}
            placeholder="Blocker (optional)"
            value={blocker}
            onChange={(e) => setBlocker(e.target.value)}
            data-testid="board-blocker-input"
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              className="min-h-11 md:min-h-8"
              disabled={isPending}
              data-testid="board-blocker-save"
              onClick={() => run(statusMovePatch("blocked", blocker))}
            >
              Move to blocked
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 md:min-h-8"
              onClick={() => setAskingBlocker(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {lane === "needs_review" && (
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 md:min-h-8"
          data-testid="board-confirm-review"
          disabled={isPending || confirmPatch == null}
          title={
            confirmPatch == null
              ? "Add an account first"
              : "Confirm review"
          }
          onClick={() => confirmPatch && run(confirmPatch)}
        >
          {confirmPatch == null ? "Add an account first" : "Confirm"}
        </Button>
      )}
    </>
  );
};
