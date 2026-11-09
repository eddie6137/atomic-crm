// v1d U4: inline quick-add in the Client Actions view (desktop) and on the company
// Actions tab. Enter saves through one `create` with the minimal body; double Enter
// creates exactly one row; the title keeps focus; the new row is highlighted from local
// state (no ?highlight=, saved filters untouched); a row hidden by filters gets a
// toast whose "Show" sets ?highlight=. Nit B: stored filters + ?highlight= show the row
// and leave the store unchanged. Dates are relative to the real PT today.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toast as sonner } from "sonner";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { CoreAdminContext, memoryStore, type Store } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { Notification } from "@/components/admin/notification";
import { ClientActionsPage } from "./ClientActionsPage";
import { ClientActionsView } from "./ClientActionsView";
import { addDays, todayPT } from "./constants";
import { makeFakeProvider, type FakeRow } from "./boardFakeProvider.testutil";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("../providers/supabase/supabase", () => ({
  getSupabaseClient: () => {
    throw new Error("no network in this test");
  },
}));

const COMPANIES = [
  { id: 8, name: "[Demo] Acme" },
  { id: 9, name: "[Demo] Northwind" },
];
const SALES = [{ id: 3, first_name: "Pat", last_name: "Demo" }];

const baseRows = (): FakeRow[] => {
  const today = todayPT();
  return ["a1", "a2"].map((id, i) => ({
    id,
    title: `Existing ${id}`,
    status: "open",
    needs_review: false,
    company_id: 8,
    owner_sales_id: 3,
    priority: "medium",
    direction: "to_client",
    due_date: addDays(today, 3),
    created_at: `${addDays(today, -5 - i)}T12:00:00Z`,
    updated_at: `${today}T12:00:00Z`,
    archived_at: null,
  }));
};

const authProvider = {
  login: async () => undefined,
  logout: async () => undefined,
  checkAuth: async () => undefined,
  checkError: async () => undefined,
  getPermissions: async () => undefined,
  getIdentity: async () => ({ id: 3, fullName: "Pat Demo" }),
};

const setup = (
  start: string,
  store: Store = memoryStore(),
  delayMs = 150,
  opts: { rows?: FakeRow[]; createdAt?: string } = {},
) => {
  const rows = opts.rows ?? baseRows();
  const { dp } = makeFakeProvider(rows, { companies: COMPANIES, sales: SALES });
  const creates: Array<{ resource: string; data: Record<string, unknown> }> =
    [];
  let n = 0;
  (dp as any).create = async (resource: string, p: any) => {
    creates.push({ resource, data: structuredClone(p.data) });
    await new Promise((r) => setTimeout(r, delayMs));
    const rec = {
      id: `new${++n}`,
      needs_review: false,
      priority: null,
      direction: null,
      due_date: null,
      archived_at: null,
      created_at: opts.createdAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...p.data,
    };
    rows.push(rec as FakeRow);
    return { data: rec };
  };
  render(
    <MemoryRouter initialEntries={[start]}>
      <CoreAdminContext
        dataProvider={dp}
        authProvider={authProvider}
        i18nProvider={testI18nProvider}
        store={store}
      >
        <Routes>
          <Route path="/client-actions" element={<ClientActionsPage />} />
          <Route
            path="/companies/:id/show/actions"
            element={<ClientActionsView lockedCompanyId={8} />}
          />
        </Routes>
        <Url />
        <Notification />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { rows, creates, store };
};

const Url = () => {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
};
const url = () => document.querySelector('[data-testid="url"]')?.textContent;
const titleInput = () =>
  document.querySelector<HTMLInputElement>('[data-testid="quick-add-title"]');
const listed = () =>
  [
    ...document.querySelectorAll(
      '[data-testid="client-actions-view"] [data-open-item]',
    ),
  ]
    .map((e) => e.getAttribute("data-open-item")!)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();

const FORBIDDEN = ["attachments", "links", "new_files", "raw", "revision"];

const pickAccount = async (name: string) => {
  const box = document.querySelector<HTMLElement>(
    '[data-testid="quick-add-account"] [role="combobox"]',
  )!;
  await userEvent.click(box);
  await expect
    .poll(() =>
      [...document.querySelectorAll('[role="option"]')].find((o) =>
        (o.textContent ?? "").includes(name),
      ),
    )
    .toBeTruthy();
  await userEvent.click(
    [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) =>
      (o.textContent ?? "").includes(name),
    )!,
  );
};
const pressed = (id: string) =>
  document
    .querySelector(`[data-testid="quick-add-due-${id}"]`)
    ?.getAttribute("aria-pressed");
// sonner's toast store is module-global, so earlier tests' toasts can linger: always
// read the newest one.
const toast = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      '[data-testid="quick-add-hidden-toast"]',
    ),
  ].at(-1) ?? null;
const clickShow = () =>
  toast()!
    .querySelector<HTMLElement>('[data-testid="quick-add-show"]')!
    .click();

describe("v1d U4 quick-add", () => {
  afterAll(() => localStorage.clear());
  beforeEach(async () => {
    sonner.dismiss();
    await new Promise((r) => setTimeout(r, 600));
  });

  it("company tab: Enter saves one minimal create (locked account, me as owner), focus stays, row highlighted locally", async () => {
    await page.viewport(1440, 900);
    const { creates } = setup("/companies/8/show/actions?tab=all");
    await expect.poll(listed).toEqual(["a1", "a2"]);
    expect(
      document.querySelector('[data-testid="quick-add-account"]'),
    ).toBeNull(); // locked
    const input = titleInput()!;
    await userEvent.click(input);
    await userEvent.type(input, "  Send the deck  ");
    await userEvent.click(
      document.querySelector<HTMLElement>(
        '[data-testid="quick-add-due-today"]',
      )!,
    );
    await userEvent.click(input);
    // Double Enter while the first save is pending → exactly one create.
    await userEvent.keyboard("{Enter}{Enter}");
    await expect.poll(() => creates.length).toBe(1);
    await expect.poll(listed).toEqual(["a1", "a2", "new1"]);
    await new Promise((r) => setTimeout(r, 400));
    expect(creates.length).toBe(1);
    expect(creates[0].resource).toBe("eos_commitments");
    expect(creates[0].data).toEqual({
      title: "Send the deck",
      company_id: 8,
      owner_sales_id: 3,
      status: "open",
      due_date: todayPT(),
    });
    for (const k of FORBIDDEN) expect(k in creates[0].data).toBe(false);
    // Title cleared, focus kept for the next entry.
    expect(titleInput()!.value).toBe("");
    expect(document.activeElement).toBe(titleInput());
    // Local highlight, not the URL.
    expect(url()).not.toContain("highlight");
    await expect
      .poll(() =>
        document
          .querySelector('[data-open-item="new1"]')
          ?.closest("tr")
          ?.className.includes("bg-primary/10"),
      )
      .toBe(true);
  });

  it("no chip → due_date omitted (never empty string)", async () => {
    await page.viewport(1440, 900);
    const { creates } = setup(
      "/companies/8/show/actions?tab=all",
      undefined,
      0,
    );
    await expect.poll(listed).toEqual(["a1", "a2"]);
    await userEvent.click(titleInput()!);
    await userEvent.type(titleInput()!, "No date{Enter}");
    await expect.poll(() => creates.length).toBe(1);
    expect("due_date" in creates[0].data).toBe(false);
    expect(Object.keys(creates[0].data).sort()).toEqual(
      ["company_id", "owner_sales_id", "status", "title"].sort(),
    );
  });

  it("/client-actions without an account: account is required, nothing is written", async () => {
    await page.viewport(1440, 900);
    const { creates } = setup("/client-actions?tab=all");
    await expect.poll(listed).toEqual(["a1", "a2"]);
    expect(
      document.querySelector('[data-testid="quick-add-account"]'),
    ).not.toBeNull();
    await userEvent.click(titleInput()!);
    await userEvent.type(titleInput()!, "Orphan{Enter}");
    await expect
      .poll(
        () =>
          document.querySelector('[data-testid="quick-add-error"]')
            ?.textContent,
      )
      .toMatch(/Account is required/);
    expect(creates.length).toBe(0);
    expect(document.activeElement).toBe(titleInput());
  });

  it("?company_id= preselects the account; a row hidden by the saved search gets a toast whose Show sets ?highlight=; the saved search is untouched", async () => {
    await page.viewport(1440, 900);
    const SAVED = {
      filter: { q: "Existing" },
      displayedFilters: { q: true },
      sort: "created_at",
      order: "DESC",
      page: 1,
      perPage: 25,
    };
    const store = memoryStore({ "client-actions.all": structuredClone(SAVED) });
    const { creates } = setup("/client-actions?tab=all&company_id=8", store, 0);
    await expect.poll(listed).toEqual(["a1", "a2"]);
    await userEvent.click(titleInput()!);
    await userEvent.type(titleInput()!, "Hidden one{Enter}");
    await expect.poll(() => creates.length).toBe(1);
    expect(creates[0].data.company_id).toBe(8);
    const show = await expect
      .poll(() =>
        document.querySelector<HTMLElement>('[data-testid="quick-add-show"]'),
      )
      .toBeTruthy();
    void show;
    expect(listed()).not.toContain("new1");
    expect(url()).not.toContain("highlight");
    clickShow();
    await expect.poll(url).toContain("highlight=new1");
    await expect.poll(listed).toContain("new1");
    expect(store.getItem("client-actions.all").filter).toEqual({
      q: "Existing",
    });
  });

  it("Nit B: stored filters + ?highlight= → the row is visible and the store is unchanged", async () => {
    await page.viewport(1440, 900);
    const SAVED = {
      filter: { q: "zzz", priority: "high" },
      displayedFilters: { q: true, priority: true },
      sort: "created_at",
      order: "DESC",
      page: 3,
      perPage: 5,
    };
    const store = memoryStore({ "client-actions.all": structuredClone(SAVED) });
    setup("/client-actions?tab=all&highlight=a2", store);
    await expect.poll(listed).toContain("a2");
    expect(store.getItem("client-actions.all")).toEqual(SAVED);
  });

  // ---------------- CE nits (U4 review) ----------------
  it("CE nit 1: an IME composition Enter (isComposing / keyCode 229) does not save; a real Enter then saves the full title", async () => {
    await page.viewport(1440, 900);
    const { creates } = setup(
      "/companies/8/show/actions?tab=all",
      undefined,
      0,
    );
    await expect.poll(listed).toEqual(["a1", "a2"]);
    const input = titleInput()!;
    await userEvent.click(input);
    await userEvent.type(input, "かんじ");
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        keyCode: 229,
        bubbles: true,
        cancelable: true,
      }),
    );
    await new Promise((r) => setTimeout(r, 400));
    expect(creates.length).toBe(0);
    expect(titleInput()!.value).toBe("かんじ");
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => creates.length).toBe(1);
    expect(creates[0].data.title).toBe("かんじ");
  });

  it("CE nit 2: title input is capped at 500 characters", async () => {
    await page.viewport(1440, 900);
    const { creates } = setup(
      "/companies/8/show/actions?tab=all",
      undefined,
      0,
    );
    await expect.poll(listed).toEqual(["a1", "a2"]);
    const input = titleInput()!;
    expect(input.maxLength).toBe(500);
    await userEvent.fill(input, "x".repeat(600));
    expect(titleInput()!.value.length).toBeLessThanOrEqual(500);
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => creates.length).toBe(1);
    expect(String(creates[0].data.title).length).toBeLessThanOrEqual(500);
  });

  it("CE nit 3: Show drops a conflicting URL company_id, so the row saved to another account is shown", async () => {
    await page.viewport(1440, 900);
    const { creates } = setup(
      "/client-actions?tab=all&company_id=8",
      undefined,
      0,
    );
    await expect.poll(listed).toEqual(["a1", "a2"]);
    await pickAccount("[Demo] Northwind");
    await userEvent.click(titleInput()!);
    await userEvent.type(titleInput()!, "For Northwind{Enter}");
    await expect.poll(() => creates.length).toBe(1);
    expect(creates[0].data.company_id).toBe(9);
    await expect.poll(() => toast()?.dataset.why).toBe("filters");
    clickShow();
    await expect.poll(url).toContain("highlight=new1");
    expect(url()).not.toContain("company_id");
    await expect.poll(listed).toContain("new1");
  });

  it("CE nit 4: a 'visible' row that sorts off the loaded page gets the not-on-this-page hint; Show reveals it", async () => {
    await page.viewport(1440, 900);
    const today = todayPT();
    const many: FakeRow[] = Array.from({ length: 30 }, (_, i) => ({
      id: `m${String(i).padStart(2, "0")}`,
      title: `Many ${i}`,
      status: "open",
      needs_review: false,
      company_id: 8,
      owner_sales_id: 3,
      priority: "medium",
      direction: "to_client",
      due_date: today, // My actions sorts due_date ASC: these fill page 1
      created_at: `${addDays(today, -1)}T12:00:00Z`,
      updated_at: `${today}T12:00:00Z`,
      archived_at: null,
    }));
    const { creates } = setup(
      "/companies/8/show/actions?tab=mine",
      undefined,
      0,
      { rows: many },
    );
    await expect.poll(() => listed().length).toBeGreaterThan(0);
    // Next week (always after today) sorts after all 30 rows due today → page 2.
    await userEvent.click(
      document.querySelector<HTMLElement>(
        '[data-testid="quick-add-due-next_week"]',
      )!,
    );
    await userEvent.click(titleInput()!);
    await userEvent.type(titleInput()!, "Later one{Enter}");
    await expect.poll(() => creates.length).toBe(1);
    await expect
      .poll(() => toast()?.dataset.why, { timeout: 6000 })
      .toBe("page");
    expect(listed()).not.toContain("new1");
    clickShow();
    await expect.poll(url).toContain("highlight=new1");
    await expect.poll(listed).toContain("new1");
  });

  it("CE nit 4 (control): a row that lands on the page confirms with 'Client action added' and no hint", async () => {
    await page.viewport(1440, 900);
    const { creates } = setup(
      "/companies/8/show/actions?tab=all",
      undefined,
      0,
    );
    await expect.poll(listed).toEqual(["a1", "a2"]);
    await userEvent.click(titleInput()!);
    await userEvent.type(titleInput()!, "On page{Enter}");
    await expect.poll(() => creates.length).toBe(1);
    await expect
      .poll(() => document.body.textContent?.includes("Client action added"))
      .toBe(true);
    await new Promise((r) => setTimeout(r, 3500));
    expect(toast()).toBeNull();
  });

  it("CE nit 6: changing the account clears the date chip", async () => {
    await page.viewport(1440, 900);
    const { creates } = setup(
      "/client-actions?tab=all&company_id=8",
      undefined,
      0,
    );
    await expect.poll(listed).toEqual(["a1", "a2"]);
    await userEvent.click(
      document.querySelector<HTMLElement>(
        '[data-testid="quick-add-due-today"]',
      )!,
    );
    expect(pressed("today")).toBe("true");
    await pickAccount("[Demo] Northwind");
    await expect.poll(() => pressed("today")).toBe("false");
    await userEvent.click(titleInput()!);
    await userEvent.type(titleInput()!, "Undated{Enter}");
    await expect.poll(() => creates.length).toBe(1);
    expect(creates[0].data.company_id).toBe(9);
    expect("due_date" in creates[0].data).toBe(false);
  });
});
