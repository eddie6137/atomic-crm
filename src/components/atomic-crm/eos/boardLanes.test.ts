import { describe, expect, it } from "vitest";
import {
  BOARD_LANES,
  bucketOpenCards,
  completedBoardFilter,
  completedSincePT,
  confirmReviewPatch,
  laneCountFilter,
  laneOf,
  OPEN_BOARD_SORT,
  COMPLETED_BOARD_SORT,
  ptMidnightUtcIso,
  sortOpenBoardCards,
  statusMovePatch,
  STATUS_MORE,
  STATUS_PRIMARY,
} from "./boardLanes";

describe("laneOf (spec §3)", () => {
  it("partitions the open set: needs_review exclusive", () => {
    expect(laneOf({ status: "open", needs_review: false })).toBe("open");
    expect(laneOf({ status: "in_progress", needs_review: false })).toBe(
      "in_progress",
    );
    expect(laneOf({ status: "blocked", needs_review: false })).toBe("blocked");
    expect(laneOf({ status: "ambiguous", needs_review: false })).toBe(
      "needs_review",
    );
    expect(laneOf({ status: "open", needs_review: true })).toBe("needs_review");
    expect(laneOf({ status: "in_progress", needs_review: true })).toBe(
      "needs_review",
    );
    expect(laneOf({ status: "completed", needs_review: false })).toBe(
      "completed",
    );
    expect(laneOf({ status: "superseded", needs_review: false })).toBeNull();
    expect(
      laneOf({ status: "open", needs_review: false, archived_at: "x" }),
    ).toBeNull();
  });
});

describe("bucketOpenCards + sort", () => {
  it("buckets and keeps fixed sort (due asc nulls last, created desc, id)", () => {
    const rows = [
      {
        id: "a",
        status: "open",
        needs_review: false,
        due_date: "2026-11-20",
        created_at: "2026-11-01T00:00:00Z",
      },
      {
        id: "b",
        status: "open",
        needs_review: false,
        due_date: null,
        created_at: "2026-11-02T00:00:00Z",
      },
      {
        id: "c",
        status: "open",
        needs_review: false,
        due_date: "2026-11-10",
        created_at: "2026-11-03T00:00:00Z",
      },
      {
        id: "d",
        status: "ambiguous",
        needs_review: false,
        due_date: "2026-11-05",
        created_at: "2026-11-01T00:00:00Z",
      },
      {
        id: "e",
        status: "blocked",
        needs_review: false,
        due_date: "2026-11-12",
        created_at: "2026-11-01T00:00:00Z",
      },
    ];
    const sorted = sortOpenBoardCards(rows);
    expect(sorted.map((r) => r.id)).toEqual(["d", "c", "e", "a", "b"]);
    const b = bucketOpenCards(sorted);
    expect(b.open.map((r) => r.id)).toEqual(["c", "a", "b"]); // due order among open
    expect(b.needs_review.map((r) => r.id)).toEqual(["d"]);
    expect(b.blocked.map((r) => r.id)).toEqual(["e"]);
    expect(b.in_progress).toEqual([]);
  });
});

describe("filters (no @or)", () => {
  const base = {
    "archived_at@is": null,
    "status@in": "(open,in_progress,blocked,ambiguous)",
    q: "deck",
  };
  it("lane counts are plain AND", () => {
    const f = laneCountFilter(base, "open");
    expect(f).toEqual({
      "archived_at@is": null,
      status: "open",
      needs_review: false,
      q: "deck",
    });
    expect(JSON.stringify(f)).not.toMatch(/@or/);
  });
  it("completed board filter drops open set and adds 14-day bound", () => {
    const f = completedBoardFilter(base, new Date("2026-11-08T20:00:00Z"));
    expect(f.status).toBe("completed");
    expect(f).not.toHaveProperty("status@in");
    expect(f["updated_at@gte"]).toContain(
      completedSincePT(new Date("2026-11-08T20:00:00Z")),
    );
    expect(JSON.stringify(f)).not.toMatch(/@or/);
  });
});

describe("Confirm + status patches (M3, D5)", () => {
  it("Confirm keeps in_progress; ambiguous → open; no account → null", () => {
    expect(
      confirmReviewPatch({
        status: "in_progress",
        needs_review: true,
        company_id: 8,
      }),
    ).toEqual({ needs_review: false });
    expect(
      confirmReviewPatch({
        status: "ambiguous",
        needs_review: true,
        company_id: 8,
      }),
    ).toEqual({ needs_review: false, status: "open" });
    expect(
      confirmReviewPatch({
        status: "open",
        needs_review: true,
        company_id: null,
      }),
    ).toBeNull();
  });
  it("status move sends only status, or status+blocker", () => {
    expect(statusMovePatch("completed")).toEqual({ status: "completed" });
    expect(statusMovePatch("blocked", "waiting on PO")).toEqual({
      status: "blocked",
      blocker: "waiting on PO",
    });
    expect(statusMovePatch("blocked", "")).toEqual({ status: "blocked" });
  });
  it("More… grouping lists", () => {
    expect([...STATUS_PRIMARY, ...STATUS_MORE]).toEqual([
      "open",
      "in_progress",
      "blocked",
      "completed",
      "superseded",
      "cancelled",
      "ambiguous",
    ]);
    expect(BOARD_LANES).toHaveLength(5);
  });
});

describe("CE revise nits (PT cutoff, sort tie-break)", () => {
  it("PT midnight is 07:00Z in PDT and 08:00Z in PST, incl. DST days", () => {
    expect(ptMidnightUtcIso("2026-10-25")).toBe("2026-10-25T07:00:00.000Z"); // PDT
    expect(ptMidnightUtcIso("2026-11-01")).toBe("2026-11-01T07:00:00.000Z"); // fall-back day, still PDT at 00:00
    expect(ptMidnightUtcIso("2026-11-02")).toBe("2026-11-02T08:00:00.000Z"); // PST
    expect(ptMidnightUtcIso("2026-03-08")).toBe("2026-03-08T08:00:00.000Z"); // spring-forward day, PST at 00:00
    expect(ptMidnightUtcIso("2026-03-09")).toBe("2026-03-09T07:00:00.000Z");
  });
  it("completed cutoff on 2026-11-08 is 2026-10-25 00:00 PDT", () => {
    const f = completedBoardFilter({}, new Date("2026-11-08T20:00:00Z"));
    expect(f["updated_at@gte"]).toBe("2026-10-25T07:00:00.000Z");
  });
  it("server sorts carry an id tie-break (postgrest order string)", () => {
    // ra-data-postgrest getOrderBy → `${field}.asc` for ASC
    expect(`${OPEN_BOARD_SORT.field}.asc`).toBe(
      "due_date.asc,created_at.desc,id.asc",
    );
    expect(OPEN_BOARD_SORT.order).toBe("ASC");
    expect(`${COMPLETED_BOARD_SORT.field}.asc`).toBe("updated_at.desc,id.asc");
    expect(COMPLETED_BOARD_SORT.order).toBe("ASC");
  });
});
