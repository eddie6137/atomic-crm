// v1d U2 board: pure lane predicate, filters, Confirm/status patches (spec §3, D2).
import { addDays, COMMITMENT_OPEN, todayPT } from "./constants";
import { sectionCount } from "./clientActions";

export const BOARD_LANES = [
  "needs_review",
  "open",
  "in_progress",
  "blocked",
  "completed",
] as const;
export type BoardLane = (typeof BOARD_LANES)[number];

export const BOARD_LANE_LABEL: Record<BoardLane, string> = {
  needs_review: "Needs review",
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed (updated in last 14 days)",
};

/** Primary statuses offered on the tap menu / drawer (before More…). */
export const STATUS_PRIMARY = [
  "open",
  "in_progress",
  "blocked",
  "completed",
] as const;
/** Grouped under More… */
export const STATUS_MORE = ["superseded", "cancelled", "ambiguous"] as const;

export const OPEN_BOARD_CAP = 200;
export const COMPLETED_BOARD_CAP = 50;
export const COMPLETED_LOOKBACK_DAYS = 14;

/** PT calendar date COMPLETED_LOOKBACK_DAYS ago (inclusive lower bound for updated_at). */
export const completedSincePT = (now: Date = new Date()) =>
  addDays(todayPT(now), -COMPLETED_LOOKBACK_DAYS);

/**
 * Pure lane predicate (spec §3). Completed membership on the board is further
 * narrowed by the Q-done query (14 PT days); laneOf alone only checks status.
 */
export const laneOf = (row: {
  status?: string | null;
  archived_at?: string | null;
  needs_review?: boolean | null;
}): BoardLane | null => {
  if (row.archived_at != null) return null;
  if (row.status === "completed") return "completed";
  if (!row.status || !COMMITMENT_OPEN.includes(row.status)) return null;
  if (row.status === "ambiguous" || row.needs_review === true)
    return "needs_review";
  if (row.status === "open") return "open";
  if (row.status === "in_progress") return "in_progress";
  if (row.status === "blocked") return "blocked";
  return null;
};

/** Bucket open-set cards into the four open lanes (Completed is a separate query). */
export const bucketOpenCards = <T extends { id: any }>(
  rows: T[],
): Record<"needs_review" | "open" | "in_progress" | "blocked", T[]> => {
  const out = {
    needs_review: [] as T[],
    open: [] as T[],
    in_progress: [] as T[],
    blocked: [] as T[],
  };
  for (const r of rows) {
    const lane = laneOf(r as any);
    if (
      lane === "needs_review" ||
      lane === "open" ||
      lane === "in_progress" ||
      lane === "blocked"
    )
      out[lane].push(r);
  }
  return out;
};

/**
 * Count-query filter for Open / In progress / Blocked (plain AND, no @or).
 * needs_review=false ∧ status=<x>, merged onto the caller's tab filter.
 */
export const laneCountFilter = (
  base: Record<string, unknown>,
  status: "open" | "in_progress" | "blocked",
) => {
  const f = { ...base };
  delete f["status@in"];
  f.status = status;
  f.needs_review = false;
  return f;
};

/**
 * UTC instant (ISO) of 00:00 America/Los_Angeles on a PT calendar date.
 * PT midnight is 07:00Z (PDT) or 08:00Z (PST); DST switches happen at 02:00,
 * so midnight itself is never skipped or repeated.
 */
export const ptMidnightUtcIso = (ptDate: string) => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  for (const h of ["07", "08"]) {
    const inst = new Date(`${ptDate}T${h}:00:00.000Z`);
    const p = Object.fromEntries(
      fmt.formatToParts(inst).map((x) => [x.type, x.value]),
    );
    if (
      `${p.year}-${p.month}-${p.day}` === ptDate &&
      p.hour === "00" &&
      p.minute === "00"
    )
      return inst.toISOString();
  }
  return new Date(`${ptDate}T08:00:00.000Z`).toISOString();
};

/**
 * Q-done filter: same tab predicates with status=completed (no open set) and
 * updated_at >= PT today − 14 days. No @or.
 */
export const completedBoardFilter = (
  base: Record<string, unknown>,
  now: Date = new Date(),
) => {
  const f = { ...base };
  delete f["status@in"];
  f.status = "completed";
  f["archived_at@is"] = null;
  f["updated_at@gte"] = ptMidnightUtcIso(completedSincePT(now));
  return f;
};

/**
 * Fixed open-set sort (D2): due_date asc nulls last, created_at desc, id asc.
 * ra-data-postgrest emits `${field}.${dir}`, so a composite field string yields
 * `order=due_date.asc,created_at.desc,id.asc` and the 200-row cut is deterministic.
 */
export const OPEN_BOARD_SORT = {
  field: "due_date.asc,created_at.desc,id",
  order: "ASC" as const,
};
/** Q-done sort: updated_at desc, id asc (spec D2) → `order=updated_at.desc,id.asc`. */
export const COMPLETED_BOARD_SORT = {
  field: "updated_at.desc,id",
  order: "ASC" as const,
};
/** Same order re-applied client-side (stable across refetch/merge). */
export const sortOpenBoardCards = <
  T extends { due_date?: string | null; created_at?: string | null; id: any },
>(
  rows: T[],
): T[] =>
  [...rows].sort((a, b) => {
    const ad = a.due_date ?? "\uffff";
    const bd = b.due_date ?? "\uffff";
    if (ad !== bd) return ad < bd ? -1 : 1;
    const ac = a.created_at ?? "";
    const bc = b.created_at ?? "";
    if (ac !== bc) return ac > bc ? -1 : 1;
    return String(a.id) < String(b.id)
      ? -1
      : String(a.id) > String(b.id)
        ? 1
        : 0;
  });

/**
 * Confirm (Needs review), M3: {needs_review:false} plus status:'open' only when
 * current status is ambiguous. Never demotes in_progress/blocked/open.
 * Returns null when disabled (no account — CHECK eos_commitments_company_or_review).
 */
export const confirmReviewPatch = (record: {
  status?: string | null;
  company_id?: unknown;
  needs_review?: boolean | null;
}): Record<string, unknown> | null => {
  if (record.company_id == null || record.company_id === "") return null;
  const patch: Record<string, unknown> = { needs_review: false };
  if (record.status === "ambiguous") patch.status = "open";
  return patch;
};

/** Status write from the tap menu / drawer. Blocker optional when moving to blocked. */
export const statusMovePatch = (
  status: string,
  blocker?: string | null,
): Record<string, unknown> => {
  if (status === "blocked" && blocker != null && blocker !== "")
    return { status, blocker };
  return { status };
};

export const laneHeaderCount = (shown: number, total: number) =>
  sectionCount(shown, total, shown);

export { sectionCount };
