// v1d §4: render eos_activity entries from NEW values only (the trigger keeps no old value).
// Display hygiene, not a security boundary (RLS is): never print raw, storage paths or URLs.

export type ActivityEntry = {
  id: number | string;
  action: string;
  actor_sales_id?: number | string | null;
  changes?: Record<string, unknown> | null;
  created_at: string;
};

export type ActivityNames = {
  sales?: Record<string, string>;
  companies?: Record<string, string>;
  projects?: Record<string, string>;
};

/** Allowlisted keys, in display order, with their labels. */
export const ACTIVITY_ALLOWLIST: Record<string, string> = {
  title: "title",
  status: "status",
  owner_sales_id: "owner",
  due_date: "due date",
  priority: "priority",
  direction: "direction",
  company_id: "account",
  project_id: "project",
  needs_review: "review",
  archived_at: "archived",
  blocker: "blocker",
};
const COUNTED: Record<string, string> = {
  attachments: "Files updated",
  links: "Links updated",
};

const human = (v: unknown) => String(v).replace(/_/g, " ");
const lookup = (map: Record<string, string> | undefined, id: unknown) =>
  map?.[String(id)] ?? `#${String(id)}`;

const valueText = (key: string, v: unknown, names: ActivityNames) => {
  switch (key) {
    case "owner_sales_id":
      return lookup(names.sales, v);
    case "company_id":
      return lookup(names.companies, v);
    case "project_id":
      return lookup(names.projects, v);
    case "status":
    case "priority":
    case "direction":
      return human(v);
    case "title":
    case "blocker":
      return `“${String(v)}”`;
    default:
      return String(v);
  }
};

/** IDs to resolve for a loaded page of entries (one getMany per resource; never per entry). */
export const activityLookupIds = (entries: ActivityEntry[]) => {
  const sales = new Set<string>();
  const companies = new Set<string>();
  const projects = new Set<string>();
  for (const e of entries) {
    if (e.actor_sales_id != null) sales.add(String(e.actor_sales_id));
    const c = e.changes ?? {};
    if (c.owner_sales_id != null) sales.add(String(c.owner_sales_id));
    if (c.company_id != null) companies.add(String(c.company_id));
    if (c.project_id != null) projects.add(String(c.project_id));
  }
  return {
    sales: [...sales],
    companies: [...companies],
    projects: [...projects],
  };
};

/** Lines for one entry. Never empty. Never includes values of non-allowlisted keys. */
export const describeActivity = (
  e: ActivityEntry,
  names: ActivityNames = {},
): string[] => {
  if (e.action === "insert") return ["Created"];
  const changes =
    e.changes && typeof e.changes === "object" && !Array.isArray(e.changes)
      ? e.changes
      : {};
  const lines: string[] = [];
  for (const key of Object.keys(ACTIVITY_ALLOWLIST)) {
    if (!(key in changes)) continue;
    const v = changes[key];
    if (key === "archived_at") {
      lines.push(v == null ? "Unarchived" : "Archived");
    } else if (key === "needs_review") {
      lines.push(v === false ? "Review confirmed" : "Marked for review");
    } else if (v == null || v === "") {
      lines.push(`cleared ${ACTIVITY_ALLOWLIST[key]}`);
    } else {
      lines.push(
        `set ${ACTIVITY_ALLOWLIST[key]} to ${valueText(key, v, names)}`,
      );
    }
  }
  for (const key of Object.keys(COUNTED)) {
    if (!(key in changes)) continue;
    const v = changes[key];
    lines.push(`${COUNTED[key]} (${Array.isArray(v) ? v.length : 0})`);
  }
  const other = Object.keys(changes).some(
    (k) => !(k in ACTIVITY_ALLOWLIST) && !(k in COUNTED),
  );
  if (other) lines.push("Other fields updated");
  if (!lines.length) lines.push("Saved (no field changes)");
  return lines;
};

/** Actor label: null actor (service-role imports etc.) is "System". */
export const activityActor = (
  e: ActivityEntry,
  names: ActivityNames = {},
): string =>
  e.actor_sales_id == null
    ? "System"
    : (names.sales?.[String(e.actor_sales_id)] ?? "Team member");

/** "Nov 8, 10:15 PM PT" */
export const formatPT = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d)} PT`;
};
