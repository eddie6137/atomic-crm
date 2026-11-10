// Intake P1: email attribution inputs are admin-only; non-admin saves never carry the columns.
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router";
import { CoreAdminContext, Form } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { CompanyInputs } from "./CompanyInputs";
import { stripAttributionUnlessAdmin } from "./attribution";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const dp: any = {
  getList: async () => ({ data: [], total: 0 }),
  getMany: async () => ({ data: [] }),
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
        <Form>
          <CompanyInputs />
        </Form>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .poll(() => document.querySelector('input[name="name"]'))
    .toBeTruthy();
};
const section = () =>
  document.querySelector('[data-testid="company-attribution-fields"]');

describe("Company attribution inputs", () => {
  it("shows the attribution section to admins", async () => {
    await renderAs("admin");
    await expect.poll(section).not.toBeNull();
    expect(section()?.textContent).toMatch(/Email attribution \(admin\)/);
    expect(section()?.querySelector('input[name="plus_slug"]')).not.toBeNull();
  });

  it("hides the attribution section from non-admin users", async () => {
    await renderAs("user");
    await new Promise((r) => setTimeout(r, 100));
    expect(section()).toBeNull();
  });
});

describe("stripAttributionUnlessAdmin", () => {
  const values = {
    name: "Acme",
    domains: ["a.test"],
    aliases: ["A"],
    plus_slug: "acme",
  };

  it("removes the attribution fields for non-admins and keeps the rest", () => {
    expect(stripAttributionUnlessAdmin(values, "user")).toEqual({
      name: "Acme",
    });
    expect(values.domains).toEqual(["a.test"]);
  });

  it("keeps every field for admins", () => {
    expect(stripAttributionUnlessAdmin(values, "admin")).toEqual(values);
  });
});
