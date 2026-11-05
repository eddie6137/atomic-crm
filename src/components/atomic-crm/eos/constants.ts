// EOS Light v1a constants. Spec: status/specs/eos-light-web-2026-11-05.md §2.
export const EOS_BUCKET = "eos-attachments";
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
