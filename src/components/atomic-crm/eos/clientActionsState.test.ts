import { describe, expect, it } from "vitest";
import {
  clientActionsListKey,
  neighbourIds,
  parseClientActionsParams,
  patchClientActionsParams,
} from "./clientActionsState";
import { CLIENT_ACTION_TABS, clientActionFilter } from "./clientActions";

const q = (s: string) => new URLSearchParams(s);
const obj = (p: URLSearchParams) => Object.fromEntries(p.entries());

describe("v1d D1 URL state", () => {
  it("parses the full shape with safe defaults", () => {
    expect(
      parseClientActionsParams(
        q(
          "tab=overdue&company_id=8&unclassified=1&status=blocked&item=a&highlight=b",
        ),
      ),
    ).toEqual({
      tab: "overdue",
      companyId: "8",
      unclassified: true,
      status: "blocked",
      view: "list",
      item: "a",
      highlight: "b",
    });
    const d = parseClientActionsParams(q("tab=nope&status=done&view=x"));
    expect(d.tab).toBe("all");
    expect(d.status).toBeNull(); // not a commitment status
    expect(d.view).toBe("list");
    // unclassified is ignored on Waiting
    expect(
      parseClientActionsParams(q("tab=waiting&unclassified=1")).unclassified,
    ).toBe(false);
    // the board ignores status (N2)
    expect(
      parseClientActionsParams(q("view=board&status=blocked")).status,
    ).toBeNull();
  });
});

describe("nit A: the single writer drops highlight on list changes", () => {
  const base = "tab=all&highlight=h1";
  it.each([
    ["tab", { tab: "overdue" as const }],
    ["unclassified", { unclassified: true }],
    ["clear company", { company_id: null }],
    ["status", { status: "blocked" }],
    ["view", { view: "board" as const }],
  ])("%s change drops highlight", (_n, patch) => {
    const start = _n === "clear company" ? `${base}&company_id=9` : base;
    const out = patchClientActionsParams(q(start), patch);
    expect(out.get("highlight")).toBeNull();
  });
  it("a no-op change (same tab) keeps highlight", () => {
    expect(
      patchClientActionsParams(q(base), { tab: "all" }).get("highlight"),
    ).toBe("h1");
  });
  it("opening, swapping or closing the drawer never drops highlight or other params", () => {
    const s = `${base}&company_id=9&unclassified=1&status=blocked`;
    const opened = patchClientActionsParams(q(s), { item: "x" });
    expect(obj(opened)).toEqual({ ...obj(q(s)), item: "x" });
    const closed = patchClientActionsParams(opened, { item: null });
    expect(obj(closed)).toEqual(obj(q(s)));
  });
  it("switching to board drops status and highlight; back to list does not restore status (N2)", () => {
    const board = patchClientActionsParams(
      q("tab=all&status=blocked&highlight=h"),
      { view: "board" },
    );
    expect(obj(board)).toEqual({ tab: "all", view: "board" });
    const list = patchClientActionsParams(board, { view: "list" });
    expect(list.get("status")).toBeNull();
    expect(list.get("view")).toBe("list");
  });
  it("an explicit highlight in the same patch wins", () => {
    expect(
      patchClientActionsParams(q("tab=all"), {
        tab: "mine",
        highlight: "n",
      }).get("highlight"),
    ).toBe("n");
  });
});

describe("List remount key (D1)", () => {
  it("never includes item or view", () => {
    const a = parseClientActionsParams(
      q("tab=all&highlight=h&item=1&view=list"),
    );
    const b = parseClientActionsParams(
      q("tab=all&highlight=h&item=2&view=board"),
    );
    expect(clientActionsListKey(a, "2026-11-08")).toBe(
      clientActionsListKey(b, "2026-11-08"),
    );
    const c = parseClientActionsParams(q("tab=all&highlight=h&status=blocked"));
    expect(clientActionsListKey(c, "2026-11-08")).not.toBe(
      clientActionsListKey(a, "2026-11-08"),
    );
  });
});

describe("Prev/Next neighbours", () => {
  it("uses the loaded page; disabled when the item is not on it", () => {
    expect(neighbourIds(["a", "b", "c"], "b")).toEqual({
      prev: "a",
      next: "c",
      index: 1,
    });
    expect(neighbourIds(["a", "b", "c"], "a")).toMatchObject({
      prev: null,
      next: "b",
    });
    expect(neighbourIds(["a", "b", "c"], "c")).toMatchObject({
      prev: "b",
      next: null,
    });
    expect(neighbourIds(["a"], "zzz")).toEqual({
      prev: null,
      next: null,
      index: -1,
    });
    expect(neighbourIds([1, 2], "2")).toMatchObject({ prev: "1" });
  });
});

describe("D2 status filter replaces the open set (list view)", () => {
  const now = new Date("2026-11-08T18:00:00Z");
  it.each(CLIENT_ACTION_TABS.map((t) => t.id))(
    "tab %s: status=completed and status=blocked use eq, keep archived + tab predicates",
    (tab) => {
      for (const status of ["completed", "blocked"]) {
        const f = clientActionFilter(tab, { now, identityId: 7, status })!;
        const plain = clientActionFilter(tab, { now, identityId: 7 })!;
        expect(f).not.toHaveProperty("status@in");
        expect(f.status).toBe(status);
        expect(f["archived_at@is"]).toBeNull();
        const { ["status@in"]: _ignored, ...rest } = plain;
        expect(f).toEqual({ ...rest, status });
      }
    },
  );
  it("an unknown status is ignored (open set kept)", () => {
    expect(clientActionFilter("all", { status: "done" })).toHaveProperty(
      "status@in",
    );
  });
});
