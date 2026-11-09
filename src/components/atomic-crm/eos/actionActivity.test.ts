import { describe, expect, it } from "vitest";
import {
  activityActor,
  activityLookupIds,
  describeActivity,
  formatPT,
  type ActivityEntry,
} from "./actionActivity";

export const SENTINEL_RAW = "SENTINEL-RAW-7f3a-do-not-render";
export const SENTINEL_PATH =
  "sentinel-uuid-9c1e/SENTINEL-PATH-secret-brief.pdf";
export const SENTINEL_URL = "https://sentinel.invalid/SENTINEL-URL-private-doc";

const e = (
  changes: Record<string, unknown> | null,
  extra: Partial<ActivityEntry> = {},
): ActivityEntry => ({
  id: 1,
  action: "update",
  actor_sales_id: 3,
  changes,
  created_at: "2026-11-09T06:15:00Z",
  ...extra,
});

describe("§4 activity rendering (new values only)", () => {
  const names = {
    sales: { "3": "Pat Demo", "4": "Terry Team" },
    companies: { "8": "[Demo] Acme Widgets" },
    projects: { p1: "Launch" },
  };
  it("insert = Created", () => {
    expect(describeActivity(e(null, { action: "insert" }))).toEqual([
      "Created",
    ]);
  });
  it("allowlisted keys say 'set X to Y' with ids resolved", () => {
    expect(
      describeActivity(
        e({
          status: "in_progress",
          owner_sales_id: 4,
          company_id: 8,
          project_id: "p1",
          due_date: "2026-11-20",
          priority: "high",
          direction: "from_client",
          title: "Send deck",
        }),
        names,
      ),
    ).toEqual([
      "set title to “Send deck”",
      "set status to in progress",
      "set owner to Terry Team",
      "set due date to 2026-11-20",
      "set priority to high",
      "set direction to from client",
      "set account to [Demo] Acme Widgets",
      "set project to Launch",
    ]);
  });
  it("null clears; archive, unarchive, review confirmed and marked for review", () => {
    expect(
      describeActivity(e({ due_date: null, owner_sales_id: null })),
    ).toEqual(["cleared owner", "cleared due date"]);
    expect(
      describeActivity(e({ archived_at: "2026-11-08T00:00:00Z" })),
    ).toEqual(["Archived"]);
    expect(describeActivity(e({ archived_at: null }))).toEqual(["Unarchived"]);
    expect(describeActivity(e({ needs_review: false }))).toEqual([
      "Review confirmed",
    ]);
    expect(describeActivity(e({ needs_review: true }))).toEqual([
      "Marked for review",
    ]);
  });
  it("PRIVACY: raw, attachment paths and link URLs are never rendered (sentinels)", () => {
    const lines = describeActivity(
      e({
        raw: { note: SENTINEL_RAW },
        attachments: [{ path: SENTINEL_PATH, title: "brief.pdf" }],
        links: [{ url: SENTINEL_URL, label: "Doc" }],
        definition_of_done: SENTINEL_RAW,
        status_reason: SENTINEL_RAW,
      }),
    );
    const text = lines.join("\n");
    for (const s of [
      SENTINEL_RAW,
      SENTINEL_PATH,
      SENTINEL_URL,
      "brief.pdf",
      "sentinel",
    ])
      expect(text).not.toContain(s);
    expect(lines).toEqual([
      "Files updated (1)",
      "Links updated (1)",
      "Other fields updated",
    ]);
  });
  it("never empty; one 'Other fields updated' per entry", () => {
    expect(describeActivity(e({}))).toEqual(["Saved (no field changes)"]);
    expect(describeActivity(e(null))).toEqual(["Saved (no field changes)"]);
    expect(
      describeActivity(e({ raw: 1, speaker: "x", due_text: "y" })),
    ).toEqual(["Other fields updated"]);
  });
  it("null actor = System; unknown actor = Team member", () => {
    expect(activityActor(e({}, { actor_sales_id: null }))).toBe("System");
    expect(activityActor(e({}), { sales: { "3": "Pat Demo" } })).toBe(
      "Pat Demo",
    );
    expect(activityActor(e({}, { actor_sales_id: 99 }))).toBe("Team member");
  });
  it("batches lookup ids per resource across a page of entries", () => {
    const ids = activityLookupIds([
      e({ owner_sales_id: 4, company_id: 8 }),
      e({ owner_sales_id: 4, project_id: "p1" }, { actor_sales_id: 4 }),
      e(null, { action: "insert", actor_sales_id: null }),
    ]);
    expect(ids.sales.sort()).toEqual(["3", "4"]);
    expect(ids.companies).toEqual(["8"]);
    expect(ids.projects).toEqual(["p1"]);
  });
  it("formats PT time", () => {
    expect(formatPT("2026-11-09T06:15:00Z")).toBe("Nov 8, 10:15 PM PT");
  });
});
