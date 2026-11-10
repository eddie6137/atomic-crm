// Intake P1 / U4: after a quick-add create, the audit RPC is called with the new commitment
// id; the commitment POST body keys are unchanged; an audit failure never undoes the create.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast as sonner } from "sonner";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { MemoryRouter } from "react-router";
import { CoreAdminContext } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { Notification } from "@/components/admin/notification";
import { QuickAdd } from "./QuickAdd";
import { makeFakeProvider } from "./boardFakeProvider.testutil";

const rpc = vi.fn();
vi.mock("../providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const authProvider = {
  login: async () => undefined,
  logout: async () => undefined,
  checkAuth: async () => undefined,
  checkError: async () => undefined,
  getPermissions: async () => undefined,
  getIdentity: async () => ({ id: 3, fullName: "Pat Demo" }),
};

const setup = async () => {
  const { dp } = makeFakeProvider([], {
    companies: [{ id: 8, name: "[Demo] Acme" }],
    sales: [{ id: 3, first_name: "Pat", last_name: "Demo" }],
  });
  const creates: Array<{ resource: string; data: Record<string, unknown> }> =
    [];
  (dp as any).create = async (resource: string, p: any) => {
    creates.push({ resource, data: structuredClone(p.data) });
    return { data: { id: "new-commitment-1", ...p.data } };
  };
  await render(
    <MemoryRouter>
      <CoreAdminContext
        dataProvider={dp}
        authProvider={authProvider}
        i18nProvider={testI18nProvider}
      >
        <QuickAdd lockedCompanyId={8} />
        <Notification />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return creates;
};

const save = async () => {
  await expect
    .poll(() => document.querySelector('[data-testid="quick-add-title"]'))
    .toBeTruthy();
  const input = document.querySelector<HTMLInputElement>(
    '[data-testid="quick-add-title"]',
  )!;
  await userEvent.click(input);
  await userEvent.type(input, "Send the deck");
  await userEvent.keyboard("{Enter}");
};

describe("quick-add intake audit", () => {
  beforeEach(() => {
    sonner.dismiss();
    rpc.mockReset();
  });

  it("creates the commitment with the same body keys, then audits it by id", async () => {
    rpc.mockResolvedValue({ data: "audit-1", error: null });
    const creates = await setup();
    await save();
    await expect.poll(() => rpc.mock.calls.length).toBe(1);
    expect(creates).toHaveLength(1);
    expect(creates[0].resource).toBe("eos_commitments");
    expect(Object.keys(creates[0].data).sort()).toEqual([
      "company_id",
      "owner_sales_id",
      "status",
      "title",
    ]);
    expect(rpc.mock.calls[0]).toEqual([
      "eos_intake_audit_quick_add",
      { p_commitment_id: "new-commitment-1" },
    ]);
  });

  it("keeps the commitment and warns the user when the audit RPC fails", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "EOS: audit down" },
    });
    const creates = await setup();
    await save();
    await expect
      .poll(() => document.body.textContent)
      .toContain("intake audit row failed");
    expect(creates).toHaveLength(1);
  });
});
