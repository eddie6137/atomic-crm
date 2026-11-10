// Intake P1: Inbox card behavior. Needs client blocks Accept Action until an account is
// chosen; Accept / Reject call the server RPCs (mocked here, no network).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { MemoryRouter } from "react-router";
import { CoreAdminContext } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { Notification } from "@/components/admin/notification";
import { InboxCard, InboxPage } from "./InboxPage";
import type { IntakeItem } from "./intake";

const rpc = vi.fn();
vi.mock("../../providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const COMPANIES = [
  { id: 8, name: "[Demo] Acme" },
  { id: 9, name: "[Demo] Northwind" },
];
const SALES = [{ id: 3, first_name: "Pat", last_name: "Demo" }];

const item = (over: Partial<IntakeItem> = {}): IntakeItem => ({
  id: "i1",
  source: "fixture",
  subject: "Re: copy",
  excerpt: "Please send the copy",
  needs_client: true,
  company_id: null,
  suggested_title: "Send copy",
  suggested_owner_sales_id: 3,
  suggested_due_date: "2026-11-20",
  triage_label: "action",
  triage_status: "triaged",
  ...over,
});

const dp: any = {
  getList: async (resource: string) => {
    const data =
      resource === "companies"
        ? COMPANIES
        : resource === "sales"
          ? SALES
          : [item()];
    return { data, total: data.length };
  },
};
const wrap = async (ui: React.ReactNode) => {
  await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={dp} i18nProvider={testI18nProvider}>
        {ui}
        <Notification />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .poll(() => document.querySelector('[data-testid="inbox-item"]'))
    .toBeTruthy();
};
const btn = (id: string) =>
  document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
const pickAccount = async (id: string) => {
  await userEvent.selectOptions(
    document.querySelector<HTMLSelectElement>('select[aria-label="Account"]')!,
    id,
  );
};

describe("Inbox card", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: "ok", error: null });
  });

  it("flags Needs client and disables Accept Action until an account is chosen", async () => {
    await page.viewport(1440, 900);
    await wrap(
      <InboxCard
        item={item()}
        companies={COMPANIES}
        sales={SALES}
        onDone={vi.fn()}
      />,
    );
    expect(
      document.querySelector('[data-testid="inbox-needs-client"]'),
    ).not.toBeNull();
    expect(btn("inbox-accept-action").disabled).toBe(true);
    expect(btn("inbox-accept-fyi").disabled).toBe(true);
    expect(
      document.querySelector('[data-testid="inbox-blocker"]')?.textContent,
    ).toMatch(/Needs client/);

    await pickAccount("9");
    await expect.poll(() => btn("inbox-accept-action").disabled).toBe(false);
    expect(btn("inbox-accept-fyi").disabled).toBe(false);
  });

  it("Accept Action sends the edited fields to the RPC and calls onDone", async () => {
    await page.viewport(1440, 900);
    const onDone = vi.fn();
    await wrap(
      <InboxCard
        item={item()}
        companies={COMPANIES}
        sales={SALES}
        onDone={onDone}
      />,
    );
    await pickAccount("9");
    await userEvent.click(btn("inbox-accept-action"));
    await expect.poll(() => rpc.mock.calls.length).toBe(1);
    expect(rpc.mock.calls[0]).toEqual([
      "eos_intake_accept_action",
      {
        p_id: "i1",
        p_fields: {
          title: "Send copy",
          company_id: 9,
          owner_sales_id: 3,
          due_date: "2026-11-20",
        },
      },
    ]);
    await expect.poll(() => onDone.mock.calls.length).toBe(1);
  });

  it("Accept FYI and Reject call their RPCs; a server error is shown and onDone is skipped", async () => {
    await page.viewport(1440, 900);
    const onDone = vi.fn();
    await wrap(
      <InboxCard
        item={item({ needs_client: false, company_id: 8 })}
        companies={COMPANIES}
        sales={SALES}
        onDone={onDone}
      />,
    );
    expect(
      document.querySelector('[data-testid="inbox-needs-client"]'),
    ).toBeNull();
    await userEvent.click(btn("inbox-accept-fyi"));
    await expect.poll(() => rpc.mock.calls.length).toBe(1);
    expect(rpc.mock.calls[0][0]).toBe("eos_intake_accept_fyi");
    expect(rpc.mock.calls[0][1]).toEqual({
      p_id: "i1",
      p_fields: { company_id: 8 },
    });

    rpc.mockResolvedValueOnce({ data: null, error: { message: "EOS: boom" } });
    const done = onDone.mock.calls.length;
    await userEvent.click(btn("inbox-reject"));
    await expect.poll(() => rpc.mock.calls.length).toBe(2);
    expect(rpc.mock.calls[1]).toEqual(["eos_intake_reject", { p_id: "i1" }]);
    await expect.poll(() => document.body.textContent).toContain("EOS: boom");
    expect(onDone.mock.calls.length).toBe(done);
  });
});

describe("Inbox page", () => {
  it("lists open intake items with the Needs client flag", async () => {
    await page.viewport(1440, 900);
    await wrap(<InboxPage />);
    await expect
      .poll(
        () => document.querySelectorAll('[data-testid="inbox-item"]').length,
      )
      .toBe(1);
    expect(
      document.querySelector('[data-testid="inbox-needs-client"]'),
    ).not.toBeNull();
  });
});
