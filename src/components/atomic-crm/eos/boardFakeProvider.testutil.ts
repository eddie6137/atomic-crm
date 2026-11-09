// Test-only: an in-memory evaluator for the PostgREST-style filter objects the
// Client Actions list and board build, so list and board can be compared by ID.
import { vi } from "vitest";
import type { DataProvider } from "ra-core";
import { addDays, todayPT } from "./constants";

export type FakeRow = {
  id: string;
  title: string;
  status: string;
  needs_review: boolean;
  company_id: number | null;
  owner_sales_id: number | null;
  priority: string | null;
  direction: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

const cmp = (a: unknown, b: unknown) =>
  a == null || b == null
    ? null
    : String(a) < String(b)
      ? -1
      : String(a) > String(b)
        ? 1
        : 0;

/** Does `row` match a ra-data-postgrest filter object (plus q → title ilike)? */
export const matchesFilter = (
  row: Record<string, any>,
  filter: Record<string, unknown>,
) => {
  for (const [key, value] of Object.entries(filter)) {
    if (key === "q") {
      if (
        value != null &&
        value !== "" &&
        !String(row.title ?? "")
          .toLowerCase()
          .includes(String(value).toLowerCase())
      )
        return false;
      continue;
    }
    const [col, op = "eq"] = key.split("@");
    const v = row[col];
    switch (op) {
      case "is":
        if (value === null ? v != null : v !== value) return false;
        break;
      case "in": {
        const set = String(value)
          .replace(/^\(|\)$/g, "")
          .split(",");
        if (!set.includes(String(v))) return false;
        break;
      }
      case "eq":
        if (String(v) !== String(value)) return false;
        break;
      case "gte":
        if (cmp(v, value) == null || cmp(v, value)! < 0) return false;
        break;
      case "lte":
        if (cmp(v, value) == null || cmp(v, value)! > 0) return false;
        break;
      case "lt":
        if (cmp(v, value) == null || cmp(v, value)! >= 0) return false;
        break;
      default:
        throw new Error(`fake provider: unsupported operator ${key}`);
    }
  }
  return true;
};

/** `field` may be a composite PostgREST order string (e.g. "due_date.asc,created_at.desc,id"). */
export const sortRows = <T extends Record<string, any>>(
  rows: T[],
  sort?: { field: string; order: "ASC" | "DESC" },
) => {
  if (!sort) return rows;
  const parts = sort.field.split(",").map((p, i, all) => {
    const [col, dir] = p.split(".");
    const d = dir ?? (i === all.length - 1 ? sort.order.toLowerCase() : "asc");
    return { col, desc: d === "desc" };
  });
  return [...rows].sort((a, b) => {
    for (const { col, desc } of parts) {
      const av = a[col];
      const bv = b[col];
      if (av == bv) continue;
      // asc → nulls last; desc → nulls first (PostgreSQL defaults)
      if (av == null) return desc ? -1 : 1;
      if (bv == null) return desc ? 1 : -1;
      const c = String(av) < String(bv) ? -1 : 1;
      return desc ? -c : c;
    }
    return 0;
  });
};

export const queryRows = (
  rows: FakeRow[],
  filter: Record<string, unknown>,
  sort?: { field: string; order: "ASC" | "DESC" },
) =>
  sortRows(
    rows.filter((r) => matchesFilter(r, filter)),
    sort,
  );

export const makeFakeProvider = (
  rows: FakeRow[],
  extra: Record<string, Array<Record<string, any>>> = {},
) => {
  const getList = vi.fn(async (resource: string, p: any) => {
    const table =
      resource === "eos_commitments" ? rows : (extra[resource] ?? null);
    if (!table) return { data: [], total: 0 };
    const all = queryRows(table as FakeRow[], p.filter ?? {}, p.sort);
    const { page = 1, perPage = 25 } = p.pagination ?? {};
    return {
      data: all.slice((page - 1) * perPage, page * perPage),
      total: all.length,
    };
  });
  const dp = {
    getList,
    getOne: async (r: string, p: any) => {
      if (r !== "eos_commitments") {
        const x = (extra[r] ?? []).find((e) => String(e.id) === String(p.id));
        if (!x) throw new Error("Not found");
        return { data: x };
      }
      const hit = rows.find((r) => r.id === String(p.id));
      if (!hit) throw new Error("Not found");
      return { data: { ...hit, attachments: [], links: [], raw: null } };
    },
    getMany: async () => ({ data: [] }),
    getManyReference: async () => ({ data: [], total: 0 }),
    create: async () => ({ data: { id: "new" } }),
    update: async (_r: string, p: any) => ({ data: { id: p.id, ...p.data } }),
    updateMany: async () => ({ data: [] }),
    delete: async () => ({ data: { id: "x" } }),
    deleteMany: async () => ({ data: [] }),
  } as unknown as DataProvider;
  return { dp, getList };
};

/**
 * Deterministic mixed dataset: every lane, tabs, ties on due_date, q-matchable titles.
 * Completed `updated_at` is relative to the real PT today (CE MF4): half the completed
 * rows are 2 days old (inside the 14-day board cutoff), half 20 days old (outside),
 * so the Completed lane is non-empty and filtered on any date.
 */
export const mixedRows = (realNow: Date = new Date()): FakeRow[] => {
  const today = todayPT(realNow);
  const statuses = [
    "open",
    "in_progress",
    "blocked",
    "ambiguous",
    "open",
    "completed",
    "superseded",
    "open",
  ];
  const rows: FakeRow[] = Array.from({ length: 48 }, (_, i) => {
    const status = statuses[i % statuses.length];
    const day = (i % 20) + 1;
    return {
      id: `m${String(i).padStart(2, "0")}`,
      title: `${i % 3 === 0 ? "Deck" : "Task"} ${i}`,
      status,
      needs_review: i % 7 === 0,
      company_id: i % 4 === 0 ? null : (i % 3) + 8,
      owner_sales_id: (i % 2) + 3,
      priority: i % 5 === 0 ? "high" : "medium",
      direction: i % 6 === 0 ? "from_client" : i % 6 === 1 ? null : "to_client",
      due_date: i % 9 === 0 ? null : `2026-11-${String(day).padStart(2, "0")}`,
      created_at: `2026-10-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`,
      updated_at:
        status === "completed"
          ? `${addDays(today, i % 16 === 5 ? -2 : -20)}T18:00:00Z`
          : `${today}T18:00:00Z`,
      archived_at: i === 13 ? "2026-11-01T00:00:00Z" : null,
    };
  });
  // CE nit A: Waiting-on-client rows that match "priority medium + account 9"
  // and "q=task + owner 4", in two lanes, so no parity case is vacuous.
  const waiting = (id: string, status: string, needs_review = false) => ({
    id,
    title: `Task waiting ${id}`,
    status,
    needs_review,
    company_id: 9,
    owner_sales_id: 4,
    priority: "medium",
    direction: "from_client",
    due_date: "2026-11-05",
    created_at: "2026-10-30T12:00:00Z",
    updated_at:
      status === "completed"
        ? `${addDays(today, -1)}T18:00:00Z`
        : `${today}T18:00:00Z`,
    archived_at: null,
  });
  rows.push(
    waiting("w1", "open"),
    waiting("w2", "in_progress"),
    waiting("w3", "blocked", true),
    waiting("w4", "completed"),
  );
  return rows;
};

/**
 * Test-only mirror of the `eos_account_summary` view's commitment columns
 * (v1b migration): open set, unarchived; overdue = due_date < PT today.
 */
export const accountSummaryRows = (
  rows: FakeRow[],
  companies: Array<{ id: number; name: string }>,
  ptToday: string,
) => {
  const OPEN = ["open", "in_progress", "blocked", "ambiguous"];
  const live = (r: FakeRow, id: number) =>
    r.company_id === id && r.archived_at == null && OPEN.includes(r.status);
  return companies.map((c) => ({
    id: c.id,
    name: c.name,
    open_commitments: rows.filter((r) => live(r, c.id)).length,
    overdue_commitments: rows.filter(
      (r) => live(r, c.id) && r.due_date != null && r.due_date < ptToday,
    ).length,
    open_projects: 0,
    open_issues: 0,
    deliverables_due_7d: 0,
    stale_projects: 0,
    off_track_rocks: 0,
    missing_owner_or_date: 0,
  }));
};
