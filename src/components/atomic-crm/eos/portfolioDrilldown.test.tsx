// v1d U3 acceptance: every Portfolio badge (overdue, blocked) equals the total and the
// ID set of the Client Actions list it links to. Dates are relative to the real PT
// today, so the test is clock-safe.
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router";
import { CoreAdminContext } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { PortfolioRollup } from "./ClientActionsPage";
import { AccountSignals } from "./EosHome";
import { addDays, todayPT } from "./constants";
import { clientActionFilter } from "./clientActions";
import { parseClientActionsParams } from "./clientActionsState";
import {
  accountSummaryRows,
  makeFakeProvider,
  queryRows,
  type FakeRow,
} from "./boardFakeProvider.testutil";

const COMPANIES = [
  { id: 8, name: "[Demo] Acme" },
  { id: 9, name: "[Demo] Northwind" },
  { id: 10, name: "[Demo] Globex" },
];

const dataset = (n: Date = new Date()): FakeRow[] => {
  const today = todayPT(n);
  const statuses = [
    "open",
    "blocked",
    "in_progress",
    "ambiguous",
    "blocked",
    "completed",
    "cancelled",
  ];
  const rows: FakeRow[] = [];
  let k = 0;
  for (const c of COMPANIES) {
    for (let i = 0; i < 9 + c.id; i++) {
      const status = statuses[(i + c.id) % statuses.length];
      const dueOff = [-3, -1, 0, 2, null][(i + k) % 5];
      rows.push({
        id: `p${String(k++).padStart(3, "0")}`,
        title: `Action ${c.id}-${i}`,
        status,
        needs_review: i % 4 === 0,
        company_id: c.id,
        owner_sales_id: (i % 2) + 3,
        priority: "medium",
        direction: i % 3 ? "to_client" : "from_client",
        due_date: dueOff == null ? null : addDays(today, dueOff),
        created_at: `${addDays(today, -10)}T12:00:00Z`,
        updated_at: `${today}T12:00:00Z`,
        // archived blocked/overdue rows must never count
        archived_at: i === 2 ? `${today}T00:00:00Z` : null,
      });
    }
  }
  // a blocked, overdue row with no account (Needs review) counts nowhere
  rows.push({
    ...rows[1],
    id: "nocompany",
    company_id: null,
    status: "blocked",
  });
  return rows;
};

const ids = (rows: FakeRow[]) => rows.map((r) => r.id).sort();

/** The list a badge links to: same parser + filter builder the page uses. */
const targetOf = (href: string, rows: FakeRow[]) => {
  const p = new URLSearchParams(href.split("?")[1]);
  const s = parseClientActionsParams(p);
  const f = clientActionFilter(s.tab, {
    companyId: s.companyId,
    status: s.status,
    unclassified: s.unclassified,
    now: new Date(),
  })!;
  return { state: s, rows: queryRows(rows, f) };
};

/** Independent expectations (SQL-view mirror and the blocked predicate). */
const expectedOverdue = (rows: FakeRow[], id: number) =>
  rows.filter(
    (r) =>
      r.company_id === id &&
      r.archived_at == null &&
      ["open", "in_progress", "blocked", "ambiguous"].includes(r.status) &&
      r.due_date != null &&
      r.due_date < todayPT(),
  );
const expectedBlocked = (rows: FakeRow[], id: number) =>
  rows.filter(
    (r) =>
      r.company_id === id && r.archived_at == null && r.status === "blocked",
  );

const renderWith = (rows: FakeRow[], ui: React.ReactNode) => {
  const summary = accountSummaryRows(rows, COMPANIES, todayPT());
  const { dp, getList } = makeFakeProvider(rows, {
    eos_account_summary: summary,
  });
  return {
    getList,
    screen: render(
      <MemoryRouter>
        <CoreAdminContext dataProvider={dp} i18nProvider={testI18nProvider}>
          {ui}
        </CoreAdminContext>
      </MemoryRouter>,
    ),
    summary,
  };
};

const linkIn = (root: ParentNode, testId: string) =>
  root.querySelector<HTMLAnchorElement>(`[data-testid="${testId}"]`);

const checkBadge = (
  a: HTMLAnchorElement | null,
  rows: FakeRow[],
  expected: FakeRow[],
  kind: "overdue" | "blocked",
) => {
  expect(a).not.toBeNull();
  const href = a!.getAttribute("href")!;
  const target = targetOf(href, rows);
  const n = Number(a!.getAttribute("data-count"));
  // badge = target list total = independent expectation, and the same IDs
  expect(n).toBe(target.rows.length);
  expect(ids(target.rows)).toEqual(ids(expected));
  if (kind === "overdue") expect(target.state.tab).toBe("overdue");
  if (kind === "blocked") {
    expect(target.state.status).toBe("blocked");
    expect(target.state.view).toBe("list"); // N2: the status chip is list-only
    expect(target.state.tab).toBe("all");
  }
  return n;
};

describe("U3 Portfolio drilldown: count ↔ rows (0 mismatches)", () => {
  it("dataset is non-trivial for all 3 accounts", () => {
    const rows = dataset();
    for (const c of COMPANIES) {
      expect(expectedOverdue(rows, c.id).length).toBeGreaterThan(0);
      expect(expectedBlocked(rows, c.id).length).toBeGreaterThan(0);
    }
  });

  it("PortfolioRollup (/client-actions): overdue, blocked and open badges per account", async () => {
    const rows = dataset();
    const { getList } = renderWith(rows, <PortfolioRollup />);
    await expect
      .poll(
        () =>
          document.querySelectorAll(
            '[data-testid="portfolio-blocked"][data-count]:not([data-count=""])',
          ).length,
      )
      .toBe(3);
    let mismatches = 0;
    for (const c of COMPANIES) {
      const li = document.querySelector(
        `[data-testid="portfolio-account"][data-company-id="${c.id}"]`,
      )!;
      try {
        checkBadge(
          linkIn(li, "portfolio-overdue"),
          rows,
          expectedOverdue(rows, c.id),
          "overdue",
        );
        checkBadge(
          linkIn(li, "portfolio-blocked"),
          rows,
          expectedBlocked(rows, c.id),
          "blocked",
        );
        const open = linkIn(li, "portfolio-open")!;
        const t = targetOf(open.getAttribute("href")!, rows);
        expect(Number(open.getAttribute("data-count"))).toBe(t.rows.length);
      } catch (e) {
        mismatches++;
        throw e;
      }
    }
    expect(mismatches).toBe(0);
    // No legacy /eos_commitments links left on the rollup
    expect(
      document.querySelector(
        '[data-testid="client-actions-portfolio"] a[href^="/eos_commitments"]',
      ),
    ).toBeNull();
    // Blocked counts: exactly one eos_commitments query (no N+1)
    const blockedCalls = getList.mock.calls.filter(
      (c) => c[0] === "eos_commitments" && c[1]?.filter?.status === "blocked",
    );
    expect(blockedCalls).toHaveLength(1);
    expect(blockedCalls[0][1].pagination.perPage).toBe(500);
  });

  it("EosHome AccountSignals: overdue, blocked and open stats per account", async () => {
    const rows = dataset();
    const summary = accountSummaryRows(rows, COMPANIES, todayPT());
    renderWith(
      rows,
      <div>
        {summary.map((a) => (
          <div key={a.id} data-account={a.id}>
            <AccountSignals a={a} />
          </div>
        ))}
      </div>,
    );
    await expect
      .poll(() =>
        [...document.querySelectorAll('[data-testid="signal-blocked"]')].every(
          (el) => !/…/.test(el.textContent ?? ""),
        ),
      )
      .toBe(true);
    for (const c of COMPANIES) {
      const box = document.querySelector(`[data-account="${c.id}"]`)!;
      checkBadge(
        linkIn(box, "signal-overdue"),
        rows,
        expectedOverdue(rows, c.id),
        "overdue",
      );
      checkBadge(
        linkIn(box, "signal-blocked"),
        rows,
        expectedBlocked(rows, c.id),
        "blocked",
      );
      const open = linkIn(box, "signal-open")!;
      expect(Number(open.getAttribute("data-count"))).toBe(
        targetOf(open.getAttribute("href")!, rows).rows.length,
      );
    }
    // Missing owner/date stays on the legacy @or list (out of v1d scope, spec U3)
    expect(
      document.querySelectorAll('a[href^="/eos_commitments?filter="]').length,
    ).toBe(COMPANIES.length);
  });

  it("blocked cap: > 500 blocked rows shows an honest label", async () => {
    const today = todayPT();
    const many: FakeRow[] = Array.from({ length: 505 }, (_, i) => ({
      id: `b${String(i).padStart(4, "0")}`,
      title: `Blocked ${i}`,
      status: "blocked",
      needs_review: false,
      company_id: 8,
      owner_sales_id: 3,
      priority: null,
      direction: null,
      due_date: addDays(today, 5),
      created_at: `${today}T00:00:00Z`,
      updated_at: `${today}T00:00:00Z`,
      archived_at: null,
    }));
    renderWith(many, <PortfolioRollup />);
    await expect
      .poll(
        () =>
          document.querySelector('[data-testid="portfolio-blocked-total"]')
            ?.textContent,
      )
      .toBe("500+");
    expect(
      document.querySelector('[data-testid="client-actions-portfolio"]')
        ?.textContent,
    ).toContain("blocked from first 500 of 505");
  });

  it("blocked cap ordered by company_id,id: accounts before the cut are exact (CE nit 1)", async () => {
    const today = todayPT();
    const b = (i: number, company_id: number): FakeRow => ({
      id: `c${String(i).padStart(4, "0")}`,
      title: `Blocked ${i}`,
      status: "blocked",
      needs_review: false,
      company_id,
      owner_sales_id: 3,
      priority: null,
      direction: null,
      due_date: addDays(today, 5),
      created_at: `${today}T00:00:00Z`,
      updated_at: `${today}T00:00:00Z`,
      archived_at: null,
    });
    // ids interleave accounts, so an id-only order would undercount account 8.
    const many: FakeRow[] = [];
    for (let i = 0; i < 600; i++) many.push(b(i * 3 + 1, 9));
    for (let i = 0; i < 3; i++) many.push(b(i * 3 + 2, 8));
    for (let i = 0; i < 2; i++) many.push(b(i * 3 + 3, 10));
    const { getList } = renderWith(many, <PortfolioRollup />);
    const label = (id: number) =>
      document
        .querySelector(
          `[data-testid="portfolio-account"][data-company-id="${id}"] [data-testid="portfolio-blocked"]`,
        )
        ?.textContent?.replace(/\s+blocked$/, "");
    await expect.poll(() => label(8)).toBe("3");
    expect(label(9)).toBe("497+"); // the account at the cut: lower bound
    expect(label(10)).toBe("0+"); // after the cut: unknown, honest lower bound
    const call = getList.mock.calls.find(
      (c) => c[0] === "eos_commitments" && c[1]?.filter?.status === "blocked",
    )!;
    expect(call[1].sort).toEqual({ field: "company_id.asc,id", order: "ASC" });
  });
});
