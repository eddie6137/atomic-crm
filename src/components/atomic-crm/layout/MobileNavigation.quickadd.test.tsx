// v1d U4 phone: + → "Client action" opens the quick-add drawer (not the full create
// page). On an account page the account is locked; Enter writes the minimal body.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast as sonner } from "sonner";
import { Notification } from "@/components/admin/notification";
import { ClientActionsPage } from "../eos/ClientActionsPage";
import { addDays, todayPT } from "../eos/constants";
import type { FakeRow } from "../eos/boardFakeProvider.testutil";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { CoreAdminContext, memoryStore } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { MobileNavigation } from "./MobileNavigation";
import { makeFakeProvider } from "../eos/boardFakeProvider.testutil";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("../providers/supabase/supabase", () => ({
  getSupabaseClient: () => {
    throw new Error("no network in this test");
  },
}));

const authProvider = {
  login: async () => undefined,
  logout: async () => undefined,
  checkAuth: async () => undefined,
  checkError: async () => undefined,
  getPermissions: async () => undefined,
  getIdentity: async () => ({ id: 3, fullName: "Pat Demo" }),
};

const Url = () => {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
};

const existing = (): FakeRow[] => {
  const today = todayPT();
  return [
    {
      id: "a1",
      title: "Existing a1",
      status: "open",
      needs_review: false,
      company_id: 8,
      owner_sales_id: 3,
      priority: "medium",
      direction: "to_client",
      due_date: addDays(today, 3),
      created_at: `${addDays(today, -5)}T12:00:00Z`,
      updated_at: `${today}T12:00:00Z`,
      archived_at: null,
    },
  ];
};

const setup = (path: string) => {
  const rows = existing();
  const { dp } = makeFakeProvider(rows, {
    companies: [{ id: 8, name: "[Demo] Acme" }],
    sales: [{ id: 3, first_name: "Pat", last_name: "Demo" }],
  });
  const creates: any[] = [];
  (dp as any).create = async (_r: string, p: any) => {
    creates.push(structuredClone(p.data));
    const rec = {
      id: "n1",
      needs_review: false,
      priority: null,
      direction: null,
      due_date: null,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...p.data,
    };
    rows.push(rec as FakeRow);
    return { data: rec };
  };
  render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext
        dataProvider={dp}
        authProvider={authProvider}
        i18nProvider={testI18nProvider}
        store={memoryStore()}
      >
        <Routes>
          <Route
            path="/client-actions"
            element={
              <>
                <ClientActionsPage />
                <MobileNavigation />
              </>
            }
          />
          <Route path="*" element={<MobileNavigation />} />
        </Routes>
        <Url />
        <Notification />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { creates };
};

const openQuickAdd = async () => {
  const sel =
    '[data-testid="mobile-navigation"] button[aria-haspopup], [data-testid="mobile-navigation"] button[aria-label="Create"]';
  await expect.poll(() => document.querySelector(sel)).toBeTruthy();
  const trigger = document.querySelector<HTMLElement>(sel)!;
  await userEvent.click(trigger);
  const item = await expect
    .poll(() =>
      document.querySelector<HTMLElement>(
        '[data-testid="mobile-create-client-action"]',
      ),
    )
    .toBeTruthy();
  void item;
  await userEvent.click(
    document.querySelector<HTMLElement>(
      '[data-testid="mobile-create-client-action"]',
    )!,
  );
  await expect
    .poll(() => document.querySelector('[data-testid="quick-add-sheet"]'))
    .toBeTruthy();
};

describe("U4 phone quick-add drawer", () => {
  beforeEach(async () => {
    sonner.dismiss();
    await new Promise((r) => setTimeout(r, 600));
  });
  it("on /companies/8/show: drawer opens, account locked, Enter writes the minimal body, stays on the page", async () => {
    await page.viewport(390, 844);
    const { creates } = setup("/companies/8/show");
    await openQuickAdd();
    await expect
      .poll(
        () =>
          document.querySelector('[data-testid="quick-add-locked-account"]')
            ?.textContent,
      )
      .toContain("[Demo] Acme");
    expect(
      document.querySelector('[data-testid="quick-add-account"]'),
    ).toBeNull();
    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="quick-add-title"]',
    )!;
    expect(input.closest('[data-variant="drawer"]')).not.toBeNull();
    await userEvent.click(input);
    await userEvent.type(input, "Call back{Enter}");
    await expect.poll(() => creates.length).toBe(1);
    expect(creates[0]).toEqual({
      title: "Call back",
      company_id: 8,
      owner_sales_id: 3,
      status: "open",
    });
    expect(document.querySelector('[data-testid="url"]')?.textContent).toBe(
      "/companies/8/show",
    );
  });

  it("More fields opens the full create form with ?source= (title + account)", async () => {
    await page.viewport(390, 844);
    setup("/companies/8/show");
    await openQuickAdd();
    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="quick-add-title"]',
    )!;
    await userEvent.click(input);
    await userEvent.type(input, "Long one");
    await userEvent.click(
      document.querySelector<HTMLElement>('[data-testid="quick-add-more"]')!,
    );
    await expect
      .poll(() => document.querySelector('[data-testid="url"]')?.textContent)
      .toMatch(/^\/eos_commitments\/create\?source=/);
    const src = decodeURIComponent(
      document
        .querySelector('[data-testid="url"]')!
        .textContent!.split("source=")[1],
    );
    expect(JSON.parse(src)).toEqual({
      title: "Long one",
      company_id: 8,
      owner_sales_id: 3,
    });
  });

  // CE nit 5: phone saves get the same highlight / hidden hint as desktop.
  const typeAndSave = async (t: string) => {
    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="quick-add-title"]',
    )!;
    await userEvent.click(input);
    await userEvent.type(input, `${t}{Enter}`);
  };
  const lastToast = (tid: string) =>
    [...document.querySelectorAll<HTMLElement>(`[data-testid="${tid}"]`)].at(
      -1,
    ) ?? null;

  it("CE nit 5: on /client-actions the list behind the sheet highlights the new card", async () => {
    await page.viewport(390, 844);
    const { creates } = setup("/client-actions?tab=all&company_id=8");
    await expect
      .poll(() => document.querySelector('[data-open-item="a1"]'))
      .toBeTruthy();
    await openQuickAdd();
    await typeAndSave("Phone row");
    await expect.poll(() => creates.length).toBe(1);
    await expect
      .poll(() =>
        document
          .querySelector('[data-open-item="n1"]')
          ?.closest('[data-testid="eos-card"]')
          ?.getAttribute("data-highlighted"),
      )
      .toBe("true");
    expect(
      document.querySelector('[data-testid="url"]')?.textContent,
    ).not.toContain("highlight");
  });

  it("CE nit 5: a phone save hidden by the tab gets the hidden hint; Show reveals it", async () => {
    await page.viewport(390, 844);
    const { creates } = setup("/client-actions?tab=overdue&company_id=8");
    await expect
      .poll(() => document.querySelector('[data-testid="client-actions-view"]'))
      .toBeTruthy();
    await openQuickAdd();
    await typeAndSave("Not overdue");
    await expect.poll(() => creates.length).toBe(1);
    await expect
      .poll(() => lastToast("quick-add-hidden-toast")?.dataset.why)
      .toBe("filters");
    lastToast("quick-add-hidden-toast")!
      .querySelector<HTMLElement>('[data-testid="quick-add-show"]')!
      .click();
    await expect
      .poll(() => document.querySelector('[data-testid="url"]')?.textContent)
      .toContain("highlight=n1");
  });

  it("CE nit 5: with no list on screen, the confirmation links to the highlighted row", async () => {
    await page.viewport(390, 844);
    const { creates } = setup("/companies/8/show");
    await openQuickAdd();
    await typeAndSave("From account page");
    await expect.poll(() => creates.length).toBe(1);
    await expect.poll(() => lastToast("quick-add-added-toast")).toBeTruthy();
    lastToast("quick-add-added-toast")!
      .querySelector<HTMLElement>('[data-testid="quick-add-show"]')!
      .click();
    await expect
      .poll(() => document.querySelector('[data-testid="url"]')?.textContent)
      .toBe("/companies/8/show/actions?tab=all&highlight=n1");
  });
});
