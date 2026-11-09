import { describe, expect, it } from "vitest";
import {
  clientActionFilter,
  matchesClientActionTab,
  normalizeCommitment,
  normalizeCommitmentStatus,
  ptWeekRange,
  sectionCount,
  msUntilNextPTMidnight,
  CLIENT_ACTION_TABS,
  DEFAULT_CLIENT_ACTION_TAB,
  clientActionsLink,
} from "./clientActions";
import { commitmentCreatedPath } from "./EosResources";

// Instants given in UTC; expectations are PT calendar dates.
const at = (iso: string) => new Date(iso);

describe("Client Actions predicates", () => {
  it("week is Mon–Sun PT: Sunday evening PT still belongs to the prior week", () => {
    // Sun Nov 8 2026 23:30 PST = Mon Nov 9 07:30 UTC
    expect(ptWeekRange(at("2026-11-09T07:30:00Z"))).toEqual({
      start: "2026-11-02",
      end: "2026-11-08",
    });
  });
  it("Monday 00:30 PT starts a new week", () => {
    // Mon Nov 9 00:30 PST = 08:30 UTC
    expect(ptWeekRange(at("2026-11-09T08:30:00Z"))).toEqual({
      start: "2026-11-09",
      end: "2026-11-15",
    });
  });
  it("DST end (Sun Nov 1 2026) and DST start (Sun Mar 8 2026) weeks", () => {
    expect(ptWeekRange(at("2026-11-01T09:30:00Z"))).toEqual({
      start: "2026-10-26",
      end: "2026-11-01",
    });
    expect(ptWeekRange(at("2026-11-02T08:00:00Z"))).toEqual({
      start: "2026-11-02",
      end: "2026-11-08",
    });
    expect(ptWeekRange(at("2026-03-08T10:30:00Z"))).toEqual({
      start: "2026-03-02",
      end: "2026-03-08",
    });
    expect(ptWeekRange(at("2026-03-09T07:30:00Z"))).toEqual({
      start: "2026-03-09",
      end: "2026-03-15",
    });
  });
  it("week filter is inclusive and carries the shared active predicate", () => {
    const now = at("2026-11-08T18:00:00Z");
    expect(clientActionFilter("week", { now })).toEqual({
      "archived_at@is": null,
      "status@in": "(open,in_progress,blocked,ambiguous)",
      "due_date@gte": "2026-11-02",
      "due_date@lte": "2026-11-08",
    });
    const r = { status: "open", archived_at: null };
    expect(
      matchesClientActionTab({ ...r, due_date: "2026-11-02" }, "week", { now }),
    ).toBe(true);
    expect(
      matchesClientActionTab({ ...r, due_date: "2026-11-08" }, "week", { now }),
    ).toBe(true);
    expect(
      matchesClientActionTab({ ...r, due_date: "2026-11-09" }, "week", { now }),
    ).toBe(false);
    expect(
      matchesClientActionTab({ ...r, due_date: null }, "week", { now }),
    ).toBe(false);
  });
  it("overdue uses today PT; null due date is not overdue", () => {
    // 2026-11-09T06:00Z is still Sun Nov 8 in PT
    const now = at("2026-11-09T06:00:00Z");
    expect(clientActionFilter("overdue", { now })?.["due_date@lt"]).toBe(
      "2026-11-08",
    );
    const r = { status: "in_progress", archived_at: null };
    expect(
      matchesClientActionTab({ ...r, due_date: "2026-11-07" }, "overdue", {
        now,
      }),
    ).toBe(true);
    expect(
      matchesClientActionTab({ ...r, due_date: "2026-11-08" }, "overdue", {
        now,
      }),
    ).toBe(false);
    expect(
      matchesClientActionTab({ ...r, due_date: null }, "overdue", { now }),
    ).toBe(false);
    expect(
      matchesClientActionTab(
        { status: "completed", archived_at: null, due_date: "2026-01-01" },
        "overdue",
        { now },
      ),
    ).toBe(false);
    expect(
      matchesClientActionTab(
        { ...r, archived_at: "2026-11-01T00:00:00Z", due_date: "2026-01-01" },
        "overdue",
        { now },
      ),
    ).toBe(false);
  });
  it("my actions waits for identity (never all owners)", () => {
    expect(clientActionFilter("mine", { identityId: undefined })).toBeNull();
    expect(clientActionFilter("mine", { identityId: 5 })?.owner_sales_id).toBe(
      5,
    );
    expect(
      matchesClientActionTab({ status: "blocked", owner_sales_id: 5 }, "mine", {
        identityId: 5,
      }),
    ).toBe(true);
    expect(
      matchesClientActionTab({ status: "blocked", owner_sales_id: 6 }, "mine", {
        identityId: 5,
      }),
    ).toBe(false);
  });
  it("waiting on client = direction from_client; company scope is additive", () => {
    expect(clientActionFilter("waiting", { companyId: 7 })).toMatchObject({
      direction: "from_client",
      company_id: 7,
    });
    expect(
      matchesClientActionTab(
        { status: "ambiguous", direction: "from_client" },
        "waiting",
      ),
    ).toBe(true);
    expect(
      matchesClientActionTab(
        { status: "open", direction: "to_client" },
        "waiting",
      ),
    ).toBe(false);
  });
  it("done maps to completed", () => {
    expect(normalizeCommitmentStatus("done")).toBe("completed");
    expect(normalizeCommitmentStatus(" Done ")).toBe("completed");
    expect(normalizeCommitmentStatus("open")).toBe("open");
    expect(normalizeCommitment({ title: "x", status: "done" })).toEqual({
      title: "x",
      status: "completed",
    });
    expect(normalizeCommitment({ title: "x" })).toEqual({ title: "x" });
  });
  it("capped section labels are honest", () => {
    expect(sectionCount(3, 3)).toBe("3");
    expect(sectionCount(50, 72)).toBe("first 50 of 72");
    expect(sectionCount(50, undefined)).toBe("first 50");
  });
  it("next PT midnight: crosses into the next PT date, DST-safe", () => {
    const cases = [
      "2026-11-09T07:30:00Z", // Sun 23:30 PST -> ~30 min
      "2026-11-08T18:00:00Z", // Sun 10:00 PST
      "2026-11-01T06:30:00Z", // Sat 23:30 PDT before fall-back
      "2026-11-01T08:30:00Z", // Sun 01:30 PDT (25h day)
      "2026-03-08T09:30:00Z", // Sun 01:30 PST (23h day)
    ];
    for (const iso of cases) {
      const now = new Date(iso);
      const ms = msUntilNextPTMidnight(now);
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
      }).format(now);
      const at = (t: number) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Los_Angeles",
        }).format(new Date(t));
      expect(at(now.getTime() + ms)).not.toBe(today);
      expect(at(now.getTime() + ms - 2000)).toBe(today); // fires within ~1s after midnight
    }
    expect(msUntilNextPTMidnight(new Date("2026-11-09T07:30:00Z"))).toBe(
      30 * 60e3 + 1000,
    );
  });
});

describe("UAT 2026-11-08: a newly created action is always visible", () => {
  it("All open is the first and default tab", () => {
    expect(CLIENT_ACTION_TABS[0]).toEqual({ id: "all", label: "All open" });
    expect(DEFAULT_CLIENT_ACTION_TAB).toBe("all");
  });
  it("All open = active filter only (any owner, any direction, no due date needed)", () => {
    expect(clientActionFilter("all", { identityId: 5 })).toEqual({
      "archived_at@is": null,
      "status@in": expect.any(String),
    });
    expect(clientActionFilter("all", { companyId: 8 })?.company_id).toBe(8);
  });
  it("matches Eddie's UAT row shape (other owner, from_client, no due date)", () => {
    const row = {
      status: "open",
      archived_at: null,
      due_date: null,
      owner_sales_id: 6,
      direction: "from_client",
    };
    expect(matchesClientActionTab(row, "all", { identityId: 5 })).toBe(true);
    expect(matchesClientActionTab(row, "mine", { identityId: 5 })).toBe(false);
    expect(matchesClientActionTab(row, "week", { identityId: 5 })).toBe(false);
    expect(matchesClientActionTab({ ...row, status: "completed" }, "all")).toBe(
      false,
    );
    expect(
      matchesClientActionTab({ ...row, archived_at: "2026-11-08" }, "all"),
    ).toBe(false);
  });
  it("create lands on All open with the new row id", () => {
    expect(commitmentCreatedPath("abc-1")).toBe(
      "/client-actions?tab=all&new=abc-1",
    );
    expect(clientActionsLink("all")).toBe("/client-actions?tab=all");
  });
});
