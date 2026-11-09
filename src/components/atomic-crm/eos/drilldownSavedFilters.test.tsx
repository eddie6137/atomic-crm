// U3 CE MF1: a count badge's target list must equal the badge even when the user has
// saved filters on that tab. Page-level, with the REAL ra store keys
// (`client-actions.<tab>`) preset with conflicting filters. Dates are relative to the
// real PT today (clock-safe).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { CoreAdminContext, memoryStore, type Store } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { ClientActionsPage } from "./ClientActionsPage";
import { AccountSignals } from "./EosHome";
import { addDays, todayPT } from "./constants";
import {
  accountSummaryRows,
  makeFakeProvider,
  type FakeRow,
} from "./boardFakeProvider.testutil";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("../providers/supabase/supabase", () => ({
  getSupabaseClient: () => {
    throw new Error("no network in this test");
  },
}));

const COMPANIES = [
  { id: 8, name: "[Demo] Acme" },
  { id: 9, name: "[Demo] Northwind" },
  { id: 10, name: "[Demo] Globex" },
];

/** Per account c: (c-6) blocked, (c-7) overdue open, plus noise that must never count. */
const dataset = (): FakeRow[] => {
  const today = todayPT();
  const rows: FakeRow[] = [];
  let k = 0;
  const r = (
    company_id: number | null,
    status: string,
    due: string | null,
    extra: Partial<FakeRow> = {},
  ): FakeRow => ({
    id: `d${String(k++).padStart(3, "0")}`,
    title: `Action ${company_id}-${k}`,
    status,
    needs_review: k % 3 === 0,
    company_id,
    owner_sales_id: 3,
    priority: "medium",
    direction: "to_client",
    due_date: due,
    created_at: `${addDays(today, -10)}T12:00:00Z`,
    updated_at: `${today}T12:00:00Z`,
    archived_at: null,
    ...extra,
  });
  for (const c of COMPANIES) {
    for (let i = 0; i < c.id - 6; i++) rows.push(r(c.id, "blocked", null));
    for (let i = 0; i < c.id - 7; i++)
      rows.push(r(c.id, "open", addDays(today, -1 - i)));
    rows.push(r(c.id, "open", addDays(today, 3))); // open, not overdue
    rows.push(r(c.id, "completed", addDays(today, -2))); // done: never overdue
    rows.push(
      r(c.id, "blocked", null, { archived_at: `${today}T00:00:00Z` }), // archived
    );
  }
  return rows;
};

/** Conflicting saved params, in ra-core's stored-params shape. */
const SAVED = {
  filter: { q: "zzz", priority: "high" },
  displayedFilters: { q: true, priority: true },
  sort: "created_at",
  order: "DESC",
  page: 2,
  perPage: 5,
};
const presetStore = () =>
  memoryStore({
    "client-actions.all": structuredClone(SAVED),
    "client-actions.overdue": structuredClone(SAVED),
  });

const Url = () => {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
};
const url = () => document.querySelector('[data-testid="url"]')?.textContent;

const EosSignals = ({ summary }: { summary: any[] }) => (
  <div>
    {summary.map((a) => (
      <div key={a.id} data-testid="eos-card" data-company-id={String(a.id)}>
        <AccountSignals a={a} />
      </div>
    ))}
  </div>
);

const renderApp = (start: string, store: Store) => {
  const rows = dataset();
  const summary = accountSummaryRows(rows, COMPANIES, todayPT());
  const { dp, getList } = makeFakeProvider(rows, {
    eos_account_summary: summary,
  });
  render(
    <MemoryRouter initialEntries={[start]}>
      <CoreAdminContext
        dataProvider={dp}
        i18nProvider={testI18nProvider}
        store={store}
      >
        <Routes>
          <Route path="/client-actions" element={<ClientActionsPage />} />
          <Route path="/eos" element={<EosSignals summary={summary} />} />
        </Routes>
        <Url />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { rows, getList };
};

const listedIds = () =>
  [
    ...document.querySelectorAll(
      '[data-testid="client-actions-view"] [data-open-item]',
    ),
  ]
    .map((e) => e.getAttribute("data-open-item")!)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();

const expected = (rows: FakeRow[], id: number, kind: "overdue" | "blocked") =>
  rows
    .filter(
      (r) =>
        r.company_id === id &&
        r.archived_at == null &&
        (kind === "blocked"
          ? r.status === "blocked"
          : ["open", "in_progress", "blocked", "ambiguous"].includes(
              r.status,
            ) &&
            r.due_date != null &&
            r.due_date < todayPT()),
    )
    .map((r) => r.id)
    .sort();

/** The List's own query for the drilled account (not the 500-row blocked count). */
const lastListFilter = (getList: any, companyId: number) =>
  getList.mock.calls
    .filter(
      (c: any) =>
        c[0] === "eos_commitments" &&
        String(c[1]?.filter?.company_id) === String(companyId) &&
        c[1]?.pagination?.perPage !== 500,
    )
    .at(-1)?.[1];

const snapshot = (store: Store) =>
  structuredClone({
    all: store.getItem("client-actions.all"),
    overdue: store.getItem("client-actions.overdue"),
  });

const click = async (sel: string) => {
  const el = await expect
    .poll(() => document.querySelector<HTMLElement>(sel))
    .not.toBeNull()
    .then(() => document.querySelector<HTMLElement>(sel)!);
  const n = Number(el.getAttribute("data-count"));
  await userEvent.click(el);
  return n;
};

/** Badge → list: rendered IDs = expected, count = badge, no saved q/priority/page, store untouched. */
const assertDrilled = async (
  store: Store,
  getList: any,
  rows: FakeRow[],
  id: number,
  kind: "overdue" | "blocked",
  badge: number,
  before: ReturnType<typeof snapshot>,
) => {
  await expect.poll(url).toContain("drill=1");
  await expect.poll(url).toContain(`company_id=${id}`);
  const want = expected(rows, id, kind);
  expect(want.length).toBeGreaterThan(0);
  expect(badge).toBe(want.length);
  await expect.poll(listedIds).toEqual(want);
  const p = lastListFilter(getList, id);
  expect(p.filter.q).toBeUndefined();
  expect(p.filter.priority).toBeUndefined();
  expect(p.pagination.page).toBe(1);
  // Saved params are neither applied nor clobbered: the drilldown writes nothing to
  // the store (exactly what was there just before the click), and the saved filter
  // itself is still the user's.
  expect(snapshot(store)).toEqual(before);
  expect(store.getItem("client-actions.all").filter).toEqual(SAVED.filter);
  expect(store.getItem("client-actions.overdue").filter).toEqual(SAVED.filter);
};

describe("U3 CE MF1: drilldown ignores saved list params (badge = list)", () => {
  beforeAll(async () => {
    await page.viewport(1440, 900);
  });
  afterAll(async () => {
    await page.viewport(1280, 800);
  });

  it("control: without drill=1 the saved filters on client-actions.all DO apply (0 rows)", async () => {
    const store = presetStore();
    const { getList } = renderApp(
      "/client-actions?tab=all&company_id=8",
      store,
    );
    await expect.poll(() => lastListFilter(getList, 8)?.filter?.q).toBe("zzz");
    expect(lastListFilter(getList, 8).filter.priority).toBe("high");
    await expect.poll(listedIds).toEqual([]);
  });

  for (const c of COMPANIES) {
    for (const kind of ["blocked", "overdue"] as const) {
      it(`PortfolioRollup ${kind} badge, account ${c.id}: list = badge despite saved filters`, async () => {
        const store = presetStore();
        const { rows, getList } = renderApp("/client-actions?tab=all", store);
        await expect
          .poll(
            () =>
              document.querySelectorAll(
                '[data-testid="portfolio-blocked"][data-count]:not([data-count=""])',
              ).length,
          )
          .toBe(3);
        const before = snapshot(store);
        const badge = await click(
          `[data-testid="portfolio-account"][data-company-id="${c.id}"] [data-testid="portfolio-${kind}"]`,
        );
        await assertDrilled(store, getList, rows, c.id, kind, badge, before);
      });

      it(`EosHome ${kind} signal, account ${c.id}: list = badge despite saved filters`, async () => {
        const store = presetStore();
        const { rows, getList } = renderApp("/eos", store);
        await expect
          .poll(
            () =>
              document.querySelector(
                `[data-company-id="${c.id}"] [data-testid="signal-blocked"]`,
              )?.textContent,
          )
          .not.toContain("…");
        const before = snapshot(store);
        const badge = await click(
          `[data-testid="eos-card"][data-company-id="${c.id}"] [data-testid="signal-${kind}"]`,
        );
        await assertDrilled(store, getList, rows, c.id, kind, badge, before);
      });
    }
  }

  it("the first list change ends the drilldown: saved filters come back", async () => {
    const store = presetStore();
    const { getList } = renderApp(
      "/client-actions?tab=all&company_id=8&view=list&status=blocked&drill=1",
      store,
    );
    await expect.poll(() => listedIds().length).toBe(2);
    // Clear the status chip (single writer): drill is dropped with it.
    const chip = document.querySelector<HTMLElement>(
      '[data-testid="client-actions-status"] button',
    );
    expect(chip).not.toBeNull();
    await userEvent.click(chip!);
    await expect.poll(url).not.toContain("drill=1");
    await expect.poll(() => lastListFilter(getList, 8)?.filter?.q).toBe("zzz");
    await expect.poll(listedIds).toEqual([]);
  });
});
