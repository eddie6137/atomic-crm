// Client Actions Hub (thin, option A-lite). Pure predicates over existing eos_commitments
// columns only: no new tables, columns, statuses, RPCs or views.
import {
  addDays,
  COMMITMENT_OPEN,
  COMMITMENT_STATUSES,
  inFilter,
  todayPT,
  weekStart,
} from "./constants";

export const CLIENT_ACTION_TABS = [
  { id: "all", label: "All open" },
  { id: "mine", label: "My actions" },
  { id: "week", label: "Due this week" },
  { id: "overdue", label: "Overdue" },
  { id: "waiting", label: "Waiting on client" },
] as const;
export type ClientActionTab = (typeof CLIENT_ACTION_TABS)[number]["id"];

/** Default landing tab: every open action, so a just-created row is always visible. */
export const DEFAULT_CLIENT_ACTION_TAB: ClientActionTab = "all";

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
    /**
     * v1d D2 (list view only): one status that REPLACES the open set, so
     * `status=completed` lists completed rows and `status=blocked` is a subset of open.
     */
    status?: string | null;
  } = {},
): Record<string, unknown> | null => {
  const now = opts.now ?? new Date();
  const base: Record<string, unknown> = activeActionFilter();
  if (opts.status && COMMITMENT_STATUSES.includes(opts.status)) {
    delete base["status@in"];
    base.status = opts.status;
  }
  if (opts.companyId != null && opts.companyId !== "")
    base.company_id = opts.companyId;
  if (opts.unclassified && tab !== "waiting") base["direction@is"] = null;
  switch (tab) {
    case "all":
      return base;
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
    case "all":
      return true;
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

/** True when the Client Actions drawer is open: /client-actions with a non-empty ?item=. */
export const isClientActionsDrawerOpen = (pathname: string, search: string) =>
  (pathname === CLIENT_ACTIONS_PATH ||
    pathname.startsWith(`${CLIENT_ACTIONS_PATH}/`) ||
    /^\/companies\/[^/]+\/show\/actions\/?$/.test(pathname)) &&
  !!new URLSearchParams(search).get("item");
export const clientActionsLink = (
  tab: ClientActionTab,
  companyId?: string | number | null,
  extra: { view?: "list" | "board"; status?: string; drill?: boolean } = {},
) => {
  const p = new URLSearchParams({ tab });
  if (companyId != null) p.set("company_id", String(companyId));
  if (extra.view) p.set("view", extra.view);
  if (extra.status) p.set("status", extra.status);
  if (extra.drill) p.set("drill", "1");
  return `${CLIENT_ACTIONS_PATH}?${p.toString()}`;
};

/**
 * U3 CE MF1: a count badge's target. `drill=1` makes the URL the whole filter: the
 * List ignores this tab's saved q/owner/priority/sort/page (storeKey=false, as with
 * ?highlight=) and never writes to them, so badge = list while saved filters survive.
 * The single writer drops `drill` on the first list change (tab, account, status, …).
 */
export const drilldownLink = (
  tab: ClientActionTab,
  companyId?: string | number | null,
  extra: { view?: "list" | "board"; status?: string } = {},
) => clientActionsLink(tab, companyId, { ...extra, drill: true });

/** U3 Portfolio "blocked" drilldown: All open, the account, list view, status=blocked (N2: chip is list-only). */
export const blockedActionsLink = (companyId: string | number) =>
  drilldownLink("all", companyId, { view: "list", status: "blocked" });

/** U3: one getList for every account's blocked count (no N+1), grouped client-side. */
export const BLOCKED_PORTFOLIO_CAP = 500;
export const blockedPortfolioFilter = () => {
  const f: Record<string, unknown> = activeActionFilter();
  delete f["status@in"];
  f.status = "blocked";
  return f;
};
export const groupCountByCompany = (
  rows: ReadonlyArray<{ company_id?: string | number | null }>,
) => {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.company_id == null) continue;
    const k = String(r.company_id);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};

/** Company page Actions tab (U3, Q5): path-routed so it never collides with ?tab=. */
export const COMPANY_ACTIONS_TAB = "actions";
export const companyActionsPath = (companyId: string | number) =>
  `/companies/${companyId}/show/${COMPANY_ACTIONS_TAB}`;

/**
 * Pre-merge nit 1: a count's target on the company Actions tab ("View all {total}").
 * Same `drill=1` contract as drilldownLink: the tab's saved company params are paused.
 */
export const companyActionsDrilldownPath = (
  companyId: string | number,
  tab: ClientActionTab = "all",
) => `${companyActionsPath(companyId)}?tab=${tab}&drill=1`;

/**
 * Target of a company-page tab change (Q5). The path carries no query, so leaving
 * the Actions tab always strips its drawer/view params (item, view, highlight)
 * and its list params; they never leak into Activity/Contacts/Deals/EOS.
 */
export const companyTabPath = (companyId: string | number, nextTab: string) =>
  nextTab === "activity"
    ? `/companies/${companyId}/show`
    : `/companies/${companyId}/show/${nextTab}`;

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

/** Where create/edit land: Client Actions "All open" with the saved row highlighted (UAT 2026-11-08). */
export const commitmentCreatedPath = (id: unknown) =>
  `${CLIENT_ACTIONS_PATH}?${new URLSearchParams({ tab: "all", highlight: String(id) })}`;

/** Class put on the highlighted Client Actions row or card; used to scroll it into view. */
export const HIGHLIGHT_CLASS = "eos-highlight";

/**
 * List storeKey for a Client Actions tab; false (no stored params read or written)
 * while highlighting a row or on a drilldown arrival (`drill=1`, CE MF1).
 */
export const clientActionsStoreKey = (
  tab: string,
  highlightId?: string | null,
  scope: "global" | "company" = "global",
  drill = false,
) =>
  highlightId || drill
    ? (false as const)
    : scope === "company"
      ? `client-actions.company.${tab}`
      : `client-actions.${tab}`;

/**
 * Where an edit lands: back on All open with the row highlighted while it is still open;
 * once done or archived it no longer appears there, so land on the default view instead.
 */
export const commitmentEditedPath = (
  id: unknown,
  data?: Record<string, any>,
) =>
  data && (data.archived_at || !COMMITMENT_OPEN.includes(data.status))
    ? CLIENT_ACTIONS_PATH
    : commitmentCreatedPath(id);
