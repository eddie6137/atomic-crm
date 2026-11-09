import { describe, expect, it } from "vitest";
import {
  blockedActionsLink,
  blockedPortfolioFilter,
  companyActionsPath,
  companyActionsDrilldownPath,
  companyTabPath,
  drilldownLink,
  groupCountByCompany,
  isClientActionsDrawerOpen,
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
  commitmentCreatedPath,
  commitmentEditedPath,
  clientActionsStoreKey,
} from "./clientActions";

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
      "/client-actions?tab=all&highlight=abc-1",
    );
    expect(clientActionsLink("all")).toBe("/client-actions?tab=all");
  });
});

describe("UAT 2026-11-08 review fixes", () => {
  it("bypasses the stored list params while a row is highlighted", () => {
    expect(clientActionsStoreKey("all", "abc-1")).toBe(false);
    expect(clientActionsStoreKey("all", null)).toBe("client-actions.all");
    expect(clientActionsStoreKey("week")).toBe("client-actions.week");
  });
  it("edit lands on All open with highlight only while the action is still open", () => {
    expect(commitmentEditedPath("a1", { status: "open" })).toBe(
      "/client-actions?tab=all&highlight=a1",
    );
    expect(commitmentEditedPath("a1", { status: "done" })).toBe(
      "/client-actions",
    );
    expect(
      commitmentEditedPath("a1", { status: "open", archived_at: "2026-11-08" }),
    ).toBe("/client-actions");
    expect(commitmentEditedPath("a1")).toBe(
      "/client-actions?tab=all&highlight=a1",
    );
  });
});

describe("CE nit 6: mobile nav hides only for the Client Actions drawer", () => {
  it("needs /client-actions and a non-empty ?item=", () => {
    expect(
      isClientActionsDrawerOpen("/client-actions", "?tab=all&item=r2"),
    ).toBe(true);
    expect(isClientActionsDrawerOpen("/client-actions/", "?item=r2")).toBe(
      true,
    );
    expect(isClientActionsDrawerOpen("/client-actions", "?tab=all")).toBe(
      false,
    );
    expect(isClientActionsDrawerOpen("/client-actions", "?item=")).toBe(false);
    expect(isClientActionsDrawerOpen("/contacts", "?item=r2")).toBe(false);
    expect(isClientActionsDrawerOpen("/client-actionsx", "?item=r2")).toBe(
      false,
    );
  });
});

describe("v1d U3 drilldown helpers", () => {
  it("blocked link: All open, account, list view, status=blocked", () => {
    expect(blockedActionsLink(9)).toBe(
      "/client-actions?tab=all&company_id=9&view=list&status=blocked&drill=1",
    );
  });
  it("blocked portfolio filter replaces the open set with status=blocked, unarchived, no @or", () => {
    const f = blockedPortfolioFilter();
    expect(f).toEqual({ "archived_at@is": null, status: "blocked" });
  });
  it("groups counts by account and skips rows with no account", () => {
    const m = groupCountByCompany([
      { company_id: 8 },
      { company_id: "8" },
      { company_id: 9 },
      { company_id: null },
    ]);
    expect([...m.entries()]).toEqual([
      ["8", 2],
      ["9", 1],
    ]);
  });
  it("company tab paths carry no query (leaving Actions strips item/view/highlight)", () => {
    expect(companyActionsPath(8)).toBe("/companies/8/show/actions");
    expect(companyTabPath(8, "activity")).toBe("/companies/8/show");
    expect(companyTabPath(8, "eos")).toBe("/companies/8/show/eos");
    expect(companyTabPath(8, "actions")).toBe("/companies/8/show/actions");
  });
  it("company tab has its own list store key", () => {
    expect(clientActionsStoreKey("all")).toBe("client-actions.all");
    expect(clientActionsStoreKey("all", null, "company")).toBe(
      "client-actions.company.all",
    );
    expect(clientActionsStoreKey("all", "h1", "company")).toBe(false);
  });
  it("mobile nav also hides for the drawer on the company Actions route", () => {
    expect(
      isClientActionsDrawerOpen("/companies/8/show/actions", "?item=a1"),
    ).toBe(true);
    expect(isClientActionsDrawerOpen("/companies/8/show/eos", "?item=a1")).toBe(
      false,
    );
    expect(isClientActionsDrawerOpen("/companies/8/show/actions", "")).toBe(
      false,
    );
  });
  it("CE MF1: count links carry drill=1; plain tab links do not", () => {
    expect(drilldownLink("overdue", 8)).toBe(
      "/client-actions?tab=overdue&company_id=8&drill=1",
    );
    expect(clientActionsLink("overdue", 8)).toBe(
      "/client-actions?tab=overdue&company_id=8",
    );
  });
  it("CE MF1: drill=1 means no stored params (like highlight), in both scopes", () => {
    expect(clientActionsStoreKey("overdue", null, "global", true)).toBe(false);
    expect(clientActionsStoreKey("all", null, "company", true)).toBe(false);
    expect(clientActionsStoreKey("all", null, "global", false)).toBe(
      "client-actions.all",
    );
  });
  it("pre-merge nits 1/2: company-tab and no-account drilldowns carry drill=1", () => {
    expect(companyActionsDrilldownPath(8)).toBe(
      "/companies/8/show/actions?tab=all&drill=1",
    );
    expect(drilldownLink("all")).toBe("/client-actions?tab=all&drill=1");
  });
});
