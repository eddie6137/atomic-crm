import { describe, expect, it, vi } from "vitest";
import { withLifecycleCallbacks, type DataProvider } from "ra-core";
import { eosBeforeSave } from "./attachments";
import {
  accountEditable,
  FORBIDDEN_WRITE_KEYS,
  inlinePatch,
  INLINE_FIELDS,
} from "./actionDrawerWrites";

vi.mock("../providers/supabase/supabase", () => ({
  getSupabaseClient: () => {
    throw new Error("no network in this test");
  },
}));

const rec = {
  id: "c1",
  title: "Send deck",
  status: "open",
  owner_sales_id: 3,
  due_date: "2026-11-20",
  priority: "medium",
  direction: null,
  company_id: 8,
  project_id: null,
  raw: { a: 1 },
  revision: 4,
  attachments: [
    {
      path: "u/brief.pdf",
      title: "brief.pdf",
      uploaded_at: "2026-11-01T00:00:00Z",
    },
  ],
  links: [{ url: "https://example.invalid/brief", label: "Brief" }],
};

describe("D5 changed-fields-only inline writes", () => {
  it.each([
    ["title", "  New title  ", { title: "New title" }],
    ["status", "in_progress", { status: "in_progress" }],
    ["owner_sales_id", 4, { owner_sales_id: 4 }],
    ["due_date", "2026-11-21", { due_date: "2026-11-21" }],
    ["due_date", "", { due_date: null }],
    ["priority", "high", { priority: "high" }],
    ["priority", "", { priority: null }],
    ["direction", "from_client", { direction: "from_client" }],
    ["company_id", 9, { company_id: 9 }],
  ] as const)("%s=%j sends exactly %j", (field, value, expected) => {
    const p = inlinePatch(rec, field, value)!;
    expect(p).toEqual(expected);
    expect(Object.keys(p)).toHaveLength(1);
    for (const k of FORBIDDEN_WRITE_KEYS) expect(p).not.toHaveProperty(k);
  });
  it("unchanged values write nothing", () => {
    expect(inlinePatch(rec, "status", "open")).toBeNull();
    expect(inlinePatch(rec, "owner_sales_id", "3")).toBeNull();
    expect(inlinePatch(rec, "direction", "")).toBeNull();
    expect(inlinePatch(rec, "title", " Send deck ")).toBeNull();
  });
  it("guards: blank title, cleared account, non-inline fields", () => {
    expect(() => inlinePatch(rec, "title", "   ")).toThrow(/required/);
    expect(() => inlinePatch(rec, "company_id", null)).toThrow(/account/);
    expect(() => inlinePatch(rec, "company_id", "")).toThrow(/account/);
    expect(() => inlinePatch(rec, "attachments" as any, [])).toThrow(/inline/);
    expect(() => inlinePatch(rec, "links" as any, [])).toThrow(/inline/);
  });
  it("account is locked while a project is set (v1a project/company trigger)", () => {
    expect(accountEditable(rec)).toBe(true);
    expect(accountEditable({ ...rec, project_id: "p1" })).toBe(false);
  });
  it("INLINE_FIELDS never overlaps the forbidden keys", () => {
    for (const k of FORBIDDEN_WRITE_KEYS)
      expect(INLINE_FIELDS as readonly string[]).not.toContain(k);
  });
});

describe("Sibling write paths through eosBeforeSave keep attachments/links (D5 audit)", () => {
  const setup = () => {
    const update = vi.fn(async (_r: string, p: any) => ({
      data: { ...p.previousData, ...p.data },
    }));
    const updateMany = vi.fn(async (_r: string, p: any) => ({ data: p.ids }));
    const create = vi.fn(async (_r: string, p: any) => ({
      data: { id: "n1", ...p.data },
    }));
    const dp = withLifecycleCallbacks(
      { update, updateMany, create } as unknown as DataProvider,
      [
        {
          resource: "eos_commitments",
          beforeSave: async (d: any) => eosBeforeSave(d),
        },
      ],
    );
    return { dp, update, updateMany, create };
  };
  it.each([
    ["title", "x"],
    ["status", "completed"],
    ["owner_sales_id", 4],
    ["due_date", "2026-12-01"],
    ["priority", "low"],
    ["direction", "internal"],
  ] as const)("drawer update %s goes out alone", async (field, value) => {
    const { dp, update } = setup();
    const data = inlinePatch(rec, field, value)!;
    const res = await dp.update("eos_commitments", {
      id: rec.id,
      data,
      previousData: rec,
    });
    expect(update.mock.calls[0][1].data).toEqual(data);
    expect(res.data.attachments).toEqual(rec.attachments);
    expect(res.data.links).toEqual(rec.links);
  });
  it("updateMany (EosBulkActions) and Archive stay partial", async () => {
    const { dp, update, updateMany } = setup();
    await dp.updateMany("eos_commitments", {
      ids: ["c1"],
      data: { status: "completed" },
    });
    expect(updateMany.mock.calls[0][1].data).toEqual({ status: "completed" });
    await dp.update("eos_commitments", {
      id: "c1",
      data: { archived_at: "2026-11-08T00:00:00Z" },
      previousData: rec,
    });
    expect(update.mock.calls[0][1].data).toEqual({
      archived_at: "2026-11-08T00:00:00Z",
    });
  });
  it("create without files/links keys sends no attachments key (DB default [] applies)", async () => {
    const { dp, create } = setup();
    await dp.create("eos_commitments", { data: { title: "t", company_id: 8 } });
    expect(create.mock.calls[0][1].data).toEqual({ title: "t", company_id: 8 });
  });
});
