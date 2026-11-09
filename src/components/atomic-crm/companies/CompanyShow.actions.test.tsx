// v1d U3 (Q5): company page Actions tab. Path-routed, company locked, own store key,
// 4 or 5 tabs incl. Actions (Deals conditional) at 1440 and the phone route at 390, and leaving
// the tab strips the drawer params.
import { afterAll, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import {
  CoreAdminContext,
  memoryStore,
  ResourceContextProvider,
} from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { CompanyShow } from "./CompanyShow";
import { addDays, todayPT } from "../eos/constants";
import {
  makeFakeProvider,
  type FakeRow,
} from "../eos/boardFakeProvider.testutil";

vi.mock("../providers/supabase/supabase", () => ({
  getSupabaseClient: () => {
    throw new Error("no network in this test");
  },
}));

const company = (nb_deals: number) => ({
  id: 8,
  name: "[Demo] Acme",
  nb_contacts: 0,
  nb_deals,
  relationship: "client",
});

const rows = (): FakeRow[] => {
  const today = todayPT();
  const r = (id: string, company_id: number, status = "open"): FakeRow => ({
    id,
    title: `Action ${id}`,
    status,
    needs_review: false,
    company_id,
    owner_sales_id: 3,
    priority: "medium",
    direction: "to_client",
    due_date: addDays(today, 3),
    created_at: `${addDays(today, -5)}T12:00:00Z`,
    updated_at: `${today}T12:00:00Z`,
    archived_at: null,
  });
  return [
    r("a1", 8),
    r("a2", 8, "blocked"),
    r("a3", 8),
    r("z1", 9),
    r("z2", 9),
  ];
};

const Url = () => {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
};
const url = () => document.querySelector('[data-testid="url"]')?.textContent;

const renderAt = (path: string, nbDeals = 0, store = memoryStore()) => {
  const { dp, getList } = makeFakeProvider(rows(), {
    companies: [company(nbDeals)],
    eos_account_summary: [],
  });
  const screen = render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext
        dataProvider={dp}
        i18nProvider={testI18nProvider}
        store={store}
      >
        <Routes>
          <Route
            path="/companies/:id/show/*"
            element={
              <ResourceContextProvider value="companies">
                <CompanyShow />
              </ResourceContextProvider>
            }
          />
          <Route path="*" element={null} />
        </Routes>
        <Url />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { screen, getList };
};

const listIds = () =>
  [
    ...document.querySelectorAll(
      '[data-testid="company-actions-tab"] [data-open-item]',
    ),
  ]
    .map((e) => e.getAttribute("data-open-item"))
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();

describe("Company page Actions tab (U3)", () => {
  afterAll(async () => {
    await page.viewport(1280, 800);
  });

  for (const nbDeals of [0, 3]) {
    it(`1440, Deals ${nbDeals ? "present" : "absent"}: ${nbDeals ? 5 : 4} tabs incl. Actions; company locked`, async () => {
      await page.viewport(1440, 900);
      // URL company_id=9 must lose to the locked company 8.
      renderAt("/companies/8/show/actions?tab=all&company_id=9", nbDeals);
      await expect.poll(listIds).toEqual(["a1", "a2", "a3"]);
      const tabs = [
        ...document.querySelectorAll(
          '[data-testid="company-tabs"] [role="tab"]',
        ),
      ];
      expect(tabs.length).toBe(nbDeals ? 5 : 4); // Activity, Contacts, [Deals], EOS, Actions
      expect(tabs.at(-1)?.textContent).toBe("Actions");
      expect(tabs.at(-1)?.getAttribute("aria-selected")).toBe("true");
      // One row: the tab strip scrolls rather than wrapping into a grid.
      const tops = new Set(
        tabs.map((t) => Math.round(t.getBoundingClientRect().top)),
      );
      expect(tops.size).toBe(1);
      // Locked account: no account chip/filter, no legacy-tasks link.
      expect(
        document.querySelector('[data-testid="client-actions-company"]'),
      ).toBeNull();
      expect(
        document.querySelector('[data-testid="client-actions-tasks-link"]'),
      ).toBeNull();
      // CTO nit: Priority filter placeholder.
      expect(document.body.textContent).toContain("All priorities");
    });
  }

  it("narrow desktop (800px) with 5 tabs: strip scrolls on one row", async () => {
    await page.viewport(800, 900);
    renderAt("/companies/8/show/actions?tab=all", 3);
    await expect.poll(listIds).toEqual(["a1", "a2", "a3"]);
    const list = document.querySelector<HTMLElement>(
      '[data-testid="company-tabs"]',
    )!;
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    expect(
      new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top))).size,
    ).toBe(1);
    expect(getComputedStyle(list).overflowX).toBe("auto");
  });

  for (const nbDeals of [0, 3]) {
    it(`390, Deals ${nbDeals ? "present" : "absent"}: phone route renders the locked view; rollup links to it`, async () => {
      await page.viewport(390, 844);
      renderAt("/companies/8/show", nbDeals);
      const open = await expect
        .poll(() =>
          document.querySelector<HTMLAnchorElement>(
            '[data-testid="company-client-actions-open-tab"]',
          ),
        )
        .not.toBeNull();
      void open;
      await userEvent.click(
        document.querySelector<HTMLElement>(
          '[data-testid="company-client-actions-open-tab"]',
        )!,
      );
      await expect.poll(url).toBe("/companies/8/show/actions");
      await expect.poll(listIds).toEqual(["a1", "a2", "a3"]);
    });
  }

  it("leaving the Actions tab strips item/view/highlight (and every list param)", async () => {
    await page.viewport(1440, 900);
    renderAt(
      "/companies/8/show/actions?tab=all&view=board&item=a1&highlight=a2",
      0,
    );
    await expect
      .poll(() => document.querySelector('[data-testid="action-drawer"]'))
      .not.toBeNull();
    await userEvent.keyboard("{Escape}");
    await expect.poll(url).not.toContain("item=");
    // Re-open via URL state then leave via the tab strip.
    const eos = [
      ...document.querySelectorAll('[data-testid="company-tabs"] [role="tab"]'),
    ].find((t) => t.textContent === "EOS") as HTMLElement;
    await userEvent.click(eos);
    await expect.poll(url).toBe("/companies/8/show/eos");
  });

  it("own store key: saved global q does not carry into the company tab", async () => {
    await page.viewport(1440, 900);
    const store = memoryStore({
      "client-actions.all.listParams": {
        filter: { q: "zzz-global-only" },
        sort: "created_at",
        order: "DESC",
        page: 1,
        perPage: 25,
      },
    });
    const { getList } = renderAt("/companies/8/show/actions?tab=all", 0, store);
    await expect.poll(listIds).toEqual(["a1", "a2", "a3"]);
    const listCalls = getList.mock.calls.filter(
      (c) => c[0] === "eos_commitments" && c[1]?.filter?.company_id != null,
    );
    expect(listCalls.length).toBeGreaterThan(0);
    for (const c of listCalls) {
      expect(c[1].filter.q).toBeUndefined();
      expect(String(c[1].filter.company_id)).toBe("8");
    }
  });
});
