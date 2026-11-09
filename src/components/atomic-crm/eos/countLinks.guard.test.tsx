// U3 pre-merge guard (CE "strongest case against"): every link that renders a count into
// Client Actions must use drilldownLink / blockedActionsLink / companyActionsDrilldownPath
// (drill=1), or the badge = list guarantee silently regresses when saved filters exist.
// Two layers: a render-level check across every count-link component, and a static scan
// that forbids hand-built /client-actions query links outside clientActions.ts.
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router";
import { CoreAdminContext } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { PortfolioRollup } from "./ClientActionsPage";
import { AccountSignals } from "./EosHome";
import { CompanyEosTab } from "./CompanyEosTab";
import { OpenActionsWidget } from "./OpenActionsWidget";
import { addDays, todayPT } from "./constants";
import {
  accountSummaryRows,
  makeFakeProvider,
  type FakeRow,
} from "./boardFakeProvider.testutil";

vi.mock("../providers/supabase/supabase", () => ({
  getSupabaseClient: () => {
    throw new Error("no network in this test");
  },
}));

const COMPANIES = [
  { id: 8, name: "Acme" },
  { id: 9, name: "Northwind" },
];

/** Account 8 has > 50 open commitments so the company tab shows "View all {total}". */
const dataset = (): FakeRow[] => {
  const today = todayPT();
  const rows: FakeRow[] = [];
  const statuses = ["open", "blocked", "in_progress", "ambiguous"];
  for (const c of COMPANIES)
    for (let i = 0; i < (c.id === 8 ? 55 : 6); i++)
      rows.push({
        id: `g${c.id}-${String(i).padStart(3, "0")}`,
        title: `Action ${i}`,
        status: statuses[i % 4],
        needs_review: false,
        company_id: c.id,
        owner_sales_id: 3,
        priority: "medium",
        direction: "to_client",
        due_date: addDays(today, (i % 5) - 2),
        created_at: `${addDays(today, -10)}T12:00:00Z`,
        updated_at: `${today}T12:00:00Z`,
        archived_at: null,
      });
  return rows;
};

const isClientActionsTarget = (href: string) =>
  href.startsWith("/client-actions") ||
  /^\/companies\/[^/?]+\/show\/actions/.test(href);

/** A link "renders a count" if it carries data-count or shows a number. */
const rendersCount = (a: Element) =>
  a.hasAttribute("data-count") || /\d/.test(a.textContent ?? "");

const countLinks = () =>
  [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
    .map((a) => ({
      href: a.getAttribute("href")!.replace(/^#/, ""),
      text: (a.textContent ?? "").trim().replace(/\s+/g, " "),
      testId: a.getAttribute("data-testid") ?? "",
      count: rendersCount(a),
    }))
    .filter((l) => isClientActionsTarget(l.href) && l.count);

describe("guard: count links into Client Actions always drill", () => {
  it("render-level: Portfolio, EosHome signals, company EOS tab, dashboard widget", async () => {
    const rows = dataset();
    const summary = accountSummaryRows(rows, COMPANIES, todayPT());
    const { dp } = makeFakeProvider(rows, {
      eos_account_summary: summary,
      companies: COMPANIES,
    });
    render(
      <MemoryRouter>
        <CoreAdminContext dataProvider={dp} i18nProvider={testI18nProvider}>
          <PortfolioRollup />
          {summary.map((a) => (
            <AccountSignals key={a.id} a={a} />
          ))}
          <CompanyEosTab companyId={8} />
          <OpenActionsWidget />
        </CoreAdminContext>
      </MemoryRouter>,
    );
    // Wait until every count surface has rendered (so the guard is never vacuous).
    const required = [
      "portfolio-overdue",
      "portfolio-blocked",
      "portfolio-open",
      "signal-overdue",
      "signal-blocked",
      "signal-open",
      "company-client-actions-blocked",
      "dashboard-open-actions-total",
      "dashboard-open-actions-view-all",
    ];
    await expect
      .poll(() =>
        required.filter((t) => !document.querySelector(`[data-testid="${t}"]`)),
      )
      .toEqual([]);
    await expect
      .poll(() => countLinks().some((l) => /^View all \d+$/.test(l.text)))
      .toBe(true);
    await expect
      .poll(
        () =>
          document.querySelectorAll(
            '[data-testid="portfolio-blocked"][data-count]:not([data-count=""])',
          ).length,
      )
      .toBe(2);
    const links = countLinks();
    // 2 accounts × (portfolio 3 + signals 3) + company blocked + "Overdue (n)" chip
    // + "View all n" + widget total = at least 16 count links.
    expect(links.length).toBeGreaterThanOrEqual(16);
    const undrilled = links.filter(
      (l) =>
        new URLSearchParams(l.href.split("?")[1] ?? "").get("drill") !== "1",
    );
    expect(undrilled).toEqual([]);
    // The dashboard "View all" (next to the total) drills too, though it shows no number.
    expect(
      document
        .querySelector('[data-testid="dashboard-open-actions-view-all"]')!
        .getAttribute("href"),
    ).toContain("drill=1");
  });

  it("static: no hand-built /client-actions?… or bare clientActionsLink( outside clientActions.ts", () => {
    const files = import.meta.glob(["../**/*.tsx", "../**/*.ts"], {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const scanned = Object.entries(files).filter(
      ([p]) =>
        !/\.test\.tsx?$/.test(p) &&
        !p.endsWith(".testutil.ts") &&
        !/(^|\/)eos\/clientActions\.ts$|^\.\/clientActions\.ts$/.test(p),
    );
    expect(scanned.length).toBeGreaterThan(50);
    const offenders: string[] = [];
    for (const [p, src] of scanned) {
      src.split("\n").forEach((line, i) => {
        if (
          /\bclientActionsLink\(/.test(line) ||
          /["'`]\/client-actions\?/.test(line) ||
          /show\/actions\?/.test(line)
        )
          offenders.push(`${p}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
