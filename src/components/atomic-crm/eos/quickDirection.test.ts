import { describe, expect, it } from "vitest";
import {
  clientActionFilter,
  DIRECTION_OPTIONS,
  isUnclassified,
  matchesClientActionTab,
  toDirectionValue,
} from "./clientActions";

const now = new Date("2026-11-09T04:00:00Z"); // Sun Nov 8 2026 20:00 PT
const open = { status: "open", archived_at: null, due_date: "2026-11-05" };
// Synthetic fixture (no client data): 5 open rows, 3 blank direction.
const rows = [
  { id: 1, ...open, direction: null },
  { id: 2, ...open, direction: "" },
  { id: 3, ...open, direction: undefined },
  { id: 4, ...open, direction: "to_client" },
  { id: 5, ...open, direction: "from_client" },
  { id: 6, ...open, status: "completed", direction: null },
];
const count = (rs: typeof rows, tab: "overdue" | "waiting", u = false) =>
  rs.filter((r) =>
    matchesClientActionTab(r as any, tab, { now, unclassified: u }),
  ).length;

describe("Quick-classify direction", () => {
  it("offers exactly the three values the DB check constraint allows", () => {
    expect(DIRECTION_OPTIONS.map((o) => o.id)).toEqual([
      "from_client",
      "to_client",
      "internal",
    ]);
  });
  it("treats null, undefined and blank as unclassified", () => {
    expect(isUnclassified(null)).toBe(true);
    expect(isUnclassified(undefined)).toBe(true);
    expect(isUnclassified("  ")).toBe(true);
    expect(isUnclassified("internal")).toBe(false);
  });
  it("maps the select value to a DB value and rejects anything else", () => {
    expect(toDirectionValue("")).toBeNull();
    expect(toDirectionValue("from_client")).toBe("from_client");
    expect(() => toDirectionValue("waiting")).toThrow();
  });
  it("adds direction@is null only when unclassified is on and tab is not Waiting", () => {
    expect(
      clientActionFilter("overdue", { now, unclassified: true }),
    ).toMatchObject({ "direction@is": null });
    expect(clientActionFilter("overdue", { now })).not.toHaveProperty(
      "direction@is",
    );
    const w = clientActionFilter("waiting", { now, unclassified: true })!;
    expect(w).not.toHaveProperty("direction@is");
    expect(w.direction).toBe("from_client");
  });
  it("Waiting on client stays from_client only", () => {
    expect(count(rows, "waiting")).toBe(1);
  });
  it("classifying a row moves it out of Unclassified and into Waiting", () => {
    expect(count(rows, "overdue", true)).toBe(3);
    const after = rows.map((r) =>
      r.id === 1 ? { ...r, direction: toDirectionValue("from_client") } : r,
    );
    expect(count(after, "overdue", true)).toBe(2);
    expect(count(after, "waiting")).toBe(2);
    // Internal / to_client never count as waiting.
    const after2 = after.map((r) =>
      r.id === 2 ? { ...r, direction: toDirectionValue("internal") } : r,
    );
    expect(count(after2, "overdue", true)).toBe(1);
    expect(count(after2, "waiting")).toBe(2);
  });
});
