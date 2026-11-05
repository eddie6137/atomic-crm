import { describe, expect, it } from "vitest";
import { fixtureCommitments, fixtureIssues } from "./fixture";
import {
  applyImport,
  buildReport,
  parseDate,
  parseTab,
  type Lookup,
} from "./sheetImport";
import { linkKind, validateHttpsUrl, isBlockedFile } from "../links";
import { todayPT } from "../constants";

const lookup: Lookup = {
  companies: [
    { id: 2, name: "Acme Widgets (Synthetic)" },
    { id: 3, name: "Northwind Demo Co" },
  ],
  sales: [
    {
      id: 1,
      first_name: "EOS",
      last_name: "Tester",
      email: "eos-test@example.invalid",
    },
    {
      id: 2,
      first_name: "Pat",
      last_name: "Demo",
      email: "pat.demo@example.invalid",
    },
  ],
};

describe("EOS lossless import", () => {
  it("keeps every non-empty row and every column", () => {
    const p = parseTab(fixtureCommitments, "eos_commitments", lookup);
    expect(p.positions).toBe(8);
    expect(p.rows).toHaveLength(7); // 1 structurally blank row skipped, formula row kept
    expect(p.width).toBe(12);
    p.rows.forEach((r) => expect(r.cells).toHaveLength(12));
    const unmapped = p.columns.filter((c) => !c.mapped_to).map((c) => c.label);
    expect(unmapped).toEqual(["Notes", "Zone", "Notes", ""]);
  });

  it("flags unknowns as needs_review, never guesses", () => {
    const p = parseTab(fixtureCommitments, "eos_commitments", lookup);
    const c3 = p.rows.find((r) => r.record.legacy_id === "C-003")!;
    expect(c3.record.company_id).toBeNull();
    expect(c3.record.owner_sales_id).toBeNull();
    expect(c3.record.owner_text).toBe("Someone Else");
    expect(c3.record.due_date).toBeNull();
    expect(c3.record.due_text).toBe("next Tuesday");
    expect(c3.record.status).toBe("ambiguous");
    expect(c3.record.priority).toBeNull();
    expect(c3.needs_review).toBe(true);
    const c4 = p.rows.find((r) => r.record.legacy_id === "C-004")!;
    expect(c4.record.company_id).toBe(2); // exact match after trim/case-fold only
    expect(c4.record.owner_sales_id).toBe(1); // email match
    expect(c4.record.status).toBe("completed");
    const dup = p.rows.filter((r) => r.record.legacy_id === "C-002");
    expect(dup[1].reasons.join()).toMatch(/duplicate legacy ID/);
    const hidden = p.rows.find((r) => r.record.legacy_id === "C-005")!;
    expect(hidden.hidden).toBe(true);
    const formula = p.rows.find((r) => r.cells.some((c) => c.formula))!;
    expect(formula.cells[8].formula).toBe("=SUM(1,2)");
    expect(formula.needs_review).toBe(true);
  });

  it("checksums are deterministic and order-sensitive only for raw", async () => {
    const p = parseTab(fixtureIssues, "eos_issues", lookup);
    const a = await buildReport(fixtureIssues, "eos_issues", p);
    const b = await buildReport(
      fixtureIssues,
      "eos_issues",
      parseTab(fixtureIssues, "eos_issues", lookup),
    );
    expect(a.raw_checksum).toBe(b.raw_checksum);
    expect(a.semantic_checksum).toBe(b.semantic_checksum);
    const reordered = {
      ...fixtureIssues,
      values: [
        fixtureIssues.values[0],
        ...fixtureIssues.values.slice(1).reverse(),
      ],
    };
    const c = await buildReport(
      reordered,
      "eos_issues",
      parseTab(reordered, "eos_issues", lookup),
    );
    expect(c.semantic_checksum).toBe(a.semantic_checksum);
    expect(c.raw_checksum).not.toBe(a.raw_checksum);
    expect(a.nonempty_rows).toBe(4);
    expect(a.needs_review_records).toBe(1);
  });

  it("applyImport reconciles against stored records and is idempotent", async () => {
    const db: Record<string, any[]> = {};
    const dp = {
      create: async (res: string, { data }: any) => {
        const rec = {
          id: data.id ?? crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...data,
        };
        (db[res] ??= []).push(rec);
        return { data: rec };
      },
      getMany: async (res: string, { ids }: any) => ({
        data: (db[res] ?? []).filter((r) => ids.includes(r.id)),
      }),
      getList: async (res: string, { filter }: any) => {
        const rows = (db[res] ?? []).filter((r) =>
          Object.entries(filter).every(([k, v]) => r[k] === v),
        );
        return { data: rows, total: rows.length };
      },
    };
    const r1 = await applyImport(
      dp,
      fixtureCommitments,
      "eos_commitments",
      lookup,
    );
    expect(r1.reconciliation.ok).toBe(true);
    expect(db.eos_commitments).toHaveLength(7);
    const r2 = await applyImport(
      dp,
      fixtureCommitments,
      "eos_commitments",
      lookup,
    );
    expect(r2.skipped).toBe(true);
    expect(db.eos_commitments).toHaveLength(7);
  });
});

describe("EOS helpers", () => {
  it("parses only unambiguous dates", () => {
    expect(parseDate("2026-11-07")).toBe("2026-11-07");
    expect(parseDate("11/2/2026")).toBe("2026-11-02");
    expect(parseDate("next Tuesday")).toBeNull();
  });
  it("classifies and validates links", () => {
    expect(linkKind("https://drive.google.com/file/d/x")).toBe("drive");
    expect(linkKind("https://amplify.slack.com/archives/C1/p1")).toBe("slack");
    expect(validateHttpsUrl("http://x.com")).toBeTruthy();
    expect(validateHttpsUrl("https://x.com")).toBeUndefined();
    expect(isBlockedFile("a.exe")).toBe(true);
    expect(isBlockedFile("a.pdf", "application/pdf")).toBe(false);
  });
  it("todayPT uses America/Los_Angeles", () => {
    expect(todayPT(new Date("2026-11-06T07:30:00Z"))).toBe("2026-11-05");
  });
});
