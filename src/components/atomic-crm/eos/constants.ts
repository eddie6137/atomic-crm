// EOS Light v1a constants. Spec: status/specs/eos-light-web-2026-11-05.md §2.
export const EOS_BUCKET = "eos-attachments";
/** Private (Joe/Eddie-only) bucket for contract files. */
export const EOS_CONTRACT_BUCKET = "eos-contract-files";
export const EOS_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MiB default (§6)

export const choices = (ids: string[]) =>
  ids.map((id) => ({ id, name: id.replace(/_/g, " ") }));

export const PROJECT_STATUSES = [
  "planned",
  "active",
  "on_hold",
  "done",
  "cancelled",
];
export const COMMITMENT_STATUSES = [
  "open",
  "in_progress",
  "blocked",
  "completed",
  "superseded",
  "cancelled",
  "ambiguous",
  "lapsed",
];
export const COMMITMENT_OPEN = ["open", "in_progress", "blocked", "ambiguous"];
export const ISSUE_STATUSES = ["open", "ids", "solved", "dropped"];
export const ISSUE_OPEN = ["open", "ids"];
export const DIRECTIONS = ["to_client", "from_client", "internal"];
export const PRIORITIES = ["high", "medium", "low"];

/** Today as YYYY-MM-DD in America/Los_Angeles (date-only overdue rule, §3). */
export const todayPT = (now: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

export const inFilter = (values: string[]) => `(${values.join(",")})`;

export const DELIVERABLE_STATUSES = [
  "planned",
  "in_progress",
  "ready",
  "delivered",
  "accepted",
  "cancelled",
];
export const DELIVERABLE_OPEN = ["planned", "in_progress", "ready"];
export const ROCK_STATUSES = ["on_track", "off_track", "done", "cancelled"];

/** Monday (ISO week start) of the PT calendar week containing `d` (YYYY-MM-DD). */
export const weekStart = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Mon=0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
};
export const addDays = (isoDate: string, n: number) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};
export const currentQuarter = (isoDate: string) => {
  const [y, m] = isoDate.split("-").map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
};
/** Scorecard hit/miss; null actual = missing (never treated as zero). */
export const metricHit = (
  actual: number | null | undefined,
  comparator: string,
  target: number | null | undefined,
) => {
  if (actual == null || target == null) return null;
  if (comparator === ">=") return actual >= target;
  if (comparator === "<=") return actual <= target;
  return actual === target;
};
