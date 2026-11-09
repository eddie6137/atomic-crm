// Client Actions Hub (thin, option A-lite). Pure predicates over existing eos_commitments
// columns only: no new tables, columns, statuses, RPCs or views.
import {
  addDays,
  COMMITMENT_OPEN,
  inFilter,
  todayPT,
  weekStart,
} from "./constants";

export const CLIENT_ACTION_TABS = [
  { id: "mine", label: "My actions" },
  { id: "week", label: "Due this week" },
  { id: "overdue", label: "Overdue" },
  { id: "waiting", label: "Waiting on client" },
] as const;
export type ClientActionTab = (typeof CLIENT_ACTION_TABS)[number]["id"];

export const isClientActionTab = (v: unknown): v is ClientActionTab =>
  CLIENT_ACTION_TABS.some((t) => t.id === v);

/** Shared active predicate: unarchived + existing open status set. */
export const activeActionFilter = () => ({
  "archived_at@is": null,
  "status@in": inFilter(COMMITMENT_OPEN),
});

/** Mon–Sun calendar week (America/Los_Angeles) containing `now`, inclusive. */
export const ptWeekRange = (now: Date = new Date()) => {
  const start = weekStart(todayPT(now));
  return { start, end: addDays(start, 6) };
};

/**
 * PostgREST-style filter for a tab. Returns null when the tab cannot be computed yet
 * (My actions before identity resolves) so callers never fall back to "all owners".
 */
export const clientActionFilter = (
  tab: ClientActionTab,
  opts: {
    now?: Date;
    identityId?: string | number | null;
    companyId?: string | number | null;
    /** Narrow to rows with no direction yet. Ignored on Waiting (always from_client). */
    unclassified?: boolean;
  } = {},
): Record<string, unknown> | null => {
  const now = opts.now ?? new Date();
  const base: Record<string, unknown> = activeActionFilter();
  if (opts.companyId != null && opts.companyId !== "")
    base.company_id = opts.companyId;
  if (opts.unclassified && tab !== "waiting") base["direction@is"] = null;
  switch (tab) {
    case "mine":
      if (opts.identityId == null || opts.identityId === "") return null;
      return { ...base, owner_sales_id: opts.identityId };
    case "week": {
      const { start, end } = ptWeekRange(now);
      return { ...base, "due_date@gte": start, "due_date@lte": end };
    }
    case "overdue":
      // due_date < today PT; null due_date never matches lt, so it is not overdue.
      return { ...base, "due_date@lt": todayPT(now) };
    case "waiting":
      return { ...base, direction: "from_client" };
  }
};

/** Client-side mirror of the same predicate (used by tests and for sanity checks). */
export const matchesClientActionTab = (
  r: {
    status?: string | null;
    archived_at?: string | null;
    due_date?: string | null;
    owner_sales_id?: unknown;
    direction?: string | null;
  },
  tab: ClientActionTab,
  opts: {
    now?: Date;
    identityId?: string | number | null;
    unclassified?: boolean;
  } = {},
) => {
  const now = opts.now ?? new Date();
  if (r.archived_at != null) return false;
  if (!r.status || !COMMITMENT_OPEN.includes(r.status)) return false;
  if (opts.unclassified && tab !== "waiting" && !isUnclassified(r.direction))
    return false;
  switch (tab) {
    case "mine":
      return (
        opts.identityId != null &&
        String(r.owner_sales_id) === String(opts.identityId)
      );
    case "week": {
      const { start, end } = ptWeekRange(now);
      return !!r.due_date && r.due_date >= start && r.due_date <= end;
    }
    case "overdue":
      return !!r.due_date && r.due_date < todayPT(now);
    case "waiting":
      return r.direction === "from_client";
  }
};

/** Quick-classify: the three values the existing direction check constraint allows. */
export const DIRECTION_OPTIONS = [
  { id: "from_client", label: "From client" },
  { id: "to_client", label: "To client" },
  { id: "internal", label: "Internal" },
] as const;
export type CommitmentDirection = (typeof DIRECTION_OPTIONS)[number]["id"];

/** Blank direction (null, undefined or empty) = unclassified. */
export const isUnclassified = (d: unknown) =>
  d == null || (typeof d === "string" && d.trim() === "");

/** Select value to DB value: "" clears to null; anything outside the allowed set is rejected. */
export const toDirectionValue = (v: string): CommitmentDirection | null => {
  if (v === "") return null;
  const hit = DIRECTION_OPTIONS.find((o) => o.id === v);
  if (!hit) throw new Error(`Invalid direction: ${v}`);
  return hit.id;
};

/** UI "done" never reaches the DB: it maps to the existing 'completed' status. */
export const normalizeCommitmentStatus = (status: unknown) =>
  typeof status === "string" && status.trim().toLowerCase() === "done"
    ? "completed"
    : status;

export const normalizeCommitment = <T extends Record<string, any>>(
  data: T,
): T =>
  data && "status" in data
    ? { ...data, status: normalizeCommitmentStatus(data.status) }
    : data;

export const CLIENT_ACTIONS_PATH = "/client-actions";
export const clientActionsLink = (
  tab: ClientActionTab,
  companyId?: string | number | null,
) => {
  const p = new URLSearchParams({ tab });
  if (companyId != null) p.set("company_id", String(companyId));
  return `${CLIENT_ACTIONS_PATH}?${p.toString()}`;
};

/** Honest count label: never present a capped page as the full total. */
export const sectionCount = (shown: number, total?: number, cap = 50) =>
  total != null && total > shown
    ? `first ${shown} of ${total}`
    : total == null && shown >= cap
      ? `first ${shown}`
      : String(shown);

/** Time-of-day in America/Los_Angeles as ms since PT midnight. */
const ptMsOfDay = (now: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return (
    ((+p.hour * 60 + +p.minute) * 60 + +p.second) * 1000 + now.getMilliseconds()
  );
};

/** ms until the PT calendar date next changes (DST-safe), plus a 1s buffer. */
export const msUntilNextPTMidnight = (now: Date = new Date()) => {
  const today = todayPT(now);
  let ms = 24 * 3600e3 - ptMsOfDay(now) + 1000;
  // 23h/25h DST days: nudge until the PT date has actually changed.
  while (todayPT(new Date(now.getTime() + ms)) === today) ms += 3600e3;
  while (
    ms > 3600e3 &&
    todayPT(new Date(now.getTime() + ms - 3600e3)) !== today
  )
    ms -= 3600e3;
  return ms;
};
