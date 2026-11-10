// Intake P1: the fixture-loader stub is admin-only (the RPC also enforces it server-side).
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router";
import { CoreAdminContext } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { InboxPage } from "./InboxPage";

vi.mock("../../providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc: vi.fn() }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const dp: any = {
  getList: async () => ({ data: [], total: 0 }),
};
const authFor = (permissions: string) => ({
  login: async () => undefined,
  logout: async () => undefined,
  checkAuth: async () => undefined,
  checkError: async () => undefined,
  getPermissions: async () => permissions,
  getIdentity: async () => ({ id: 3, fullName: "Pat Demo" }),
});
const renderAs = async (permissions: string) => {
  await render(
    <MemoryRouter>
      <CoreAdminContext
        dataProvider={dp}
        authProvider={authFor(permissions)}
        i18nProvider={testI18nProvider}
      >
        <InboxPage />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .poll(() => document.querySelector("h2")?.textContent)
    .toBe("Inbox");
};
const fixtureButton = () =>
  document.querySelector('[data-testid="inbox-load-fixture"]');

describe("Inbox fixture button", () => {
  it("is shown to admins", async () => {
    await renderAs("admin");
    await expect.poll(fixtureButton).not.toBeNull();
  });

  it("is hidden from non-admin users", async () => {
    await renderAs("user");
    // Let getPermissions settle before asserting absence.
    await new Promise((r) => setTimeout(r, 100));
    expect(fixtureButton()).toBeNull();
  });
});
