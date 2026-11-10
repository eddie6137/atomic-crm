import { describe, expect, it } from "vitest";
import { permissionsFromSale } from "./authProvider";

describe("permissionsFromSale", () => {
  it("returns admin when sales.administrator is true", () => {
    expect(permissionsFromSale({ administrator: true })).toBe("admin");
  });

  it("returns user when sales.administrator is false", () => {
    expect(permissionsFromSale({ administrator: false })).toBe("user");
  });

  it("returns undefined when the sales row is missing", () => {
    expect(permissionsFromSale(null)).toBeUndefined();
  });
});
