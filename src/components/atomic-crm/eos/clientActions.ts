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
  } = {},
): Record<string, unknown> | null => {
  const now = opts.now ?? new Date();
  const base: Record<string, unknown> = activeActionFilter();
  if (opts.companyId != null && opts.companyId !== "")
    base.company_id = opts.companyId;
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
  opts: { now?: Date; identityId?: string | number | null } = {},
) => {
  const now = opts.now ?? new Date();
  if (r.archived_at != null) return false;
  if (!r.status || !COMMITMENT_OPEN.includes(r.status)) return false;
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
