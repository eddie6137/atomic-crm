import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptActionBlocker,
  acceptFyiBlocker,
  isIntakeUiEnabled,
} from "./intake";

const ready = {
  title: "Send deck",
  company_id: 8,
  owner_sales_id: 3,
  due_date: "2026-11-20",
};

describe("acceptActionBlocker", () => {
  it("is null when account, title, owner and due date are all set", () => {
    expect(acceptActionBlocker(ready, false)).toBeNull();
  });

  it("names Needs client when the account is missing on a Needs-client item", () => {
    expect(acceptActionBlocker({ ...ready, company_id: null }, true)).toMatch(
      /^Needs client/,
    );
  });

  it("blocks on a blank title, missing owner, or missing due date", () => {
    expect(acceptActionBlocker({ ...ready, title: "  " }, false)).toBe(
      "Title required",
    );
    expect(acceptActionBlocker({ ...ready, owner_sales_id: null }, false)).toBe(
      "Owner required",
    );
    expect(acceptActionBlocker({ ...ready, due_date: null }, false)).toBe(
      "Due date required",
    );
  });
});

describe("acceptFyiBlocker", () => {
  it("requires an account and a 1-2000 character note", () => {
    expect(acceptFyiBlocker(null, "note", true)).toMatch(/^Needs client/);
    expect(acceptFyiBlocker(8, "   ", false)).toBe(
      "Note must be 1-2000 characters",
    );
    expect(acceptFyiBlocker(8, "x".repeat(2001), false)).toBe(
      "Note must be 1-2000 characters",
    );
    expect(acceptFyiBlocker(8, "x".repeat(2000), false)).toBeNull();
  });
});

describe("isIntakeUiEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off by default and only on for VITE_EOS_INTAKE_UI=1", () => {
    vi.stubEnv("VITE_EOS_INTAKE_UI", "");
    expect(isIntakeUiEnabled()).toBe(false);
    vi.stubEnv("VITE_EOS_INTAKE_UI", "true");
    expect(isIntakeUiEnabled()).toBe(false);
    vi.stubEnv("VITE_EOS_INTAKE_UI", "1");
    expect(isIntakeUiEnabled()).toBe(true);
  });
});
