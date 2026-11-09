// v1d U4: quick-add pure helpers. Chip date math (Q7) at PT midnight, across both
// DST changes and on a Monday; the create body (spec write path, D5 forbidden keys);
// the hidden-by-filters check.
import { describe, expect, it } from "vitest";
import {
  quickAddDueDate,
  quickAddPayload,
  quickAddVisibleInList,
  ptWeekRange,
} from "./clientActions";
import { addDays } from "./constants";

const at = (iso: string) => new Date(iso);

describe("quickAddDueDate (PT)", () => {
  it("none → null (due_date omitted, never empty string)", () => {
    expect(quickAddDueDate("none", at("2026-11-11T20:00:00Z"))).toBeNull();
  });

  it("PT midnight: 07:59Z on Nov 12 is still Wed Nov 11 in PT, 08:00Z is Thu Nov 12", () => {
    const before = at("2026-11-12T07:59:59Z"); // 23:59:59 PST Wed
    const after = at("2026-11-12T08:00:00Z"); // 00:00 PST Thu
    expect(quickAddDueDate("today", before)).toBe("2026-11-11");
    expect(quickAddDueDate("tomorrow", before)).toBe("2026-11-12");
    expect(quickAddDueDate("today", after)).toBe("2026-11-12");
    expect(quickAddDueDate("tomorrow", after)).toBe("2026-11-13");
    // Next week is the following Monday from both sides of midnight.
    expect(quickAddDueDate("next_week", before)).toBe("2026-11-16");
    expect(quickAddDueDate("next_week", after)).toBe("2026-11-16");
  });

  it("Sunday 23:30 PT → next week is the very next day (Monday)", () => {
    const sun = at("2026-11-16T07:30:00Z"); // Sun Nov 15 23:30 PST
    expect(quickAddDueDate("today", sun)).toBe("2026-11-15");
    expect(quickAddDueDate("next_week", sun)).toBe("2026-11-16");
  });

  it("on a Monday, Next week is +7 (never today)", () => {
    const mon = at("2026-11-16T17:00:00Z"); // Mon Nov 16 09:00 PST
    expect(quickAddDueDate("today", mon)).toBe("2026-11-16");
    expect(quickAddDueDate("next_week", mon)).toBe("2026-11-23");
    // Monday 00:00 PST exactly
    expect(quickAddDueDate("next_week", at("2026-11-16T08:00:00Z"))).toBe(
      "2026-11-23",
    );
  });

  it("Next week is always outside Due this week (ptWeekRange().end + 1)", () => {
    for (let i = 0; i < 21; i++) {
      const now = new Date(Date.UTC(2026, 10, 1 + i, 20));
      const nw = quickAddDueDate("next_week", now)!;
      expect(nw).toBe(addDays(ptWeekRange(now).end, 1));
      expect(nw > ptWeekRange(now).end).toBe(true);
      expect(new Date(`${nw}T12:00:00Z`).getUTCDay()).toBe(1);
    }
  });

  it("across DST end (Sun Nov 1 2026, 02:00 PDT → 01:00 PST)", () => {
    // Sat Oct 31 23:30 PDT = Nov 1 06:30Z
    expect(quickAddDueDate("today", at("2026-11-01T06:30:00Z"))).toBe(
      "2026-10-31",
    );
    expect(quickAddDueDate("tomorrow", at("2026-11-01T06:30:00Z"))).toBe(
      "2026-11-01",
    );
    // Sun Nov 1 23:30 PST = Nov 2 07:30Z (25-hour day)
    expect(quickAddDueDate("today", at("2026-11-02T07:30:00Z"))).toBe(
      "2026-11-01",
    );
    expect(quickAddDueDate("tomorrow", at("2026-11-02T07:30:00Z"))).toBe(
      "2026-11-02",
    );
    expect(quickAddDueDate("next_week", at("2026-11-02T07:30:00Z"))).toBe(
      "2026-11-02",
    );
  });

  it("across DST start (Sun Mar 14 2027, 02:00 PST → 03:00 PDT)", () => {
    // Sat Mar 13 23:30 PST = Mar 14 07:30Z
    expect(quickAddDueDate("tomorrow", at("2027-03-14T07:30:00Z"))).toBe(
      "2027-03-14",
    );
    // Sun Mar 14 23:30 PDT = Mar 15 06:30Z (23-hour day)
    expect(quickAddDueDate("today", at("2027-03-15T06:30:00Z"))).toBe(
      "2027-03-14",
    );
    expect(quickAddDueDate("next_week", at("2027-03-15T06:30:00Z"))).toBe(
      "2027-03-15",
    );
    // Mon Mar 15 00:30 PDT = 07:30Z → Monday rule +7
    expect(quickAddDueDate("next_week", at("2027-03-15T07:30:00Z"))).toBe(
      "2027-03-22",
    );
  });
});

describe("quickAddPayload (write path)", () => {
  const FORBIDDEN = ["attachments", "links", "new_files", "raw", "revision"];
  it("minimal body: trimmed title, account, owner, status open; no due_date key without a chip", () => {
    const d = quickAddPayload({
      title: "  Send the deck  ",
      company_id: "8",
      owner_sales_id: 3,
      due: "none",
    });
    expect(d).toEqual({
      title: "Send the deck",
      company_id: 8,
      owner_sales_id: 3,
      status: "open",
    });
    expect("due_date" in d).toBe(false);
    for (const k of FORBIDDEN) expect(k in d).toBe(false);
  });
  it("chip sets due_date to the PT chip date", () => {
    const d = quickAddPayload({
      title: "x",
      company_id: 7,
      owner_sales_id: 3,
      due: "tomorrow",
      now: at("2026-11-12T07:59:59Z"),
    });
    expect(d.due_date).toBe("2026-11-12");
    expect(Object.keys(d).sort()).toEqual(
      ["company_id", "due_date", "owner_sales_id", "status", "title"].sort(),
    );
  });
  it("rejects a blank title and a missing account (Q4: account required)", () => {
    expect(() =>
      quickAddPayload({ title: "   ", company_id: 8, due: "none" }),
    ).toThrow(/Title/);
    expect(() =>
      quickAddPayload({ title: "x", company_id: "", due: "none" }),
    ).toThrow(/Account/);
  });
  it("never emits owner_sales_id: null or undefined", () => {
    const d = quickAddPayload({
      title: "x",
      company_id: 8,
      owner_sales_id: null,
      due: "none",
    });
    expect("owner_sales_id" in d).toBe(false);
  });
});

describe("quickAddVisibleInList", () => {
  const now = at("2026-11-11T20:00:00Z");
  const rec = {
    title: "Send the deck",
    status: "open",
    archived_at: null,
    due_date: null as string | null,
    owner_sales_id: 3,
    company_id: 8,
    direction: null,
    priority: null,
  };
  it("All open with no filters: visible", () => {
    expect(quickAddVisibleInList(rec, { tab: "all", now })).toBe(true);
  });
  it("Overdue / Due this week / Waiting / other owner's Mine: hidden", () => {
    expect(quickAddVisibleInList(rec, { tab: "overdue", now })).toBe(false);
    expect(quickAddVisibleInList(rec, { tab: "week", now })).toBe(false);
    expect(quickAddVisibleInList(rec, { tab: "waiting", now })).toBe(false);
    expect(
      quickAddVisibleInList(rec, { tab: "mine", identityId: 4, now }),
    ).toBe(false);
    expect(
      quickAddVisibleInList(
        { ...rec, due_date: "2026-11-12" },
        { tab: "week", now },
      ),
    ).toBe(true);
  });
  it("saved search / owner / priority / account filters can hide it", () => {
    expect(
      quickAddVisibleInList(rec, {
        tab: "all",
        now,
        filterValues: { q: "zzz" },
      }),
    ).toBe(false);
    expect(
      quickAddVisibleInList(rec, {
        tab: "all",
        now,
        filterValues: { q: "DECK" },
      }),
    ).toBe(true);
    expect(
      quickAddVisibleInList(rec, {
        tab: "all",
        now,
        filterValues: { priority: "high" },
      }),
    ).toBe(false);
    expect(
      quickAddVisibleInList(rec, {
        tab: "all",
        now,
        filterValues: { owner_sales_id: 5 },
      }),
    ).toBe(false);
    expect(
      quickAddVisibleInList(rec, { tab: "all", now, companyId: "9" }),
    ).toBe(false);
    expect(
      quickAddVisibleInList(rec, { tab: "all", now, status: "completed" }),
    ).toBe(false);
  });
});

describe("quickAddPayload title cap (CE nit 2)", () => {
  it("accepts 500 characters and rejects 501", () => {
    expect(
      quickAddPayload({ title: "x".repeat(500), company_id: 8, due: "none" })
        .title.length,
    ).toBe(500);
    expect(() =>
      quickAddPayload({ title: "x".repeat(501), company_id: 8, due: "none" }),
    ).toThrow(/too long/);
  });
});
