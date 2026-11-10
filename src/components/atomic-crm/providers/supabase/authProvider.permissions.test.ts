import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = { userId: "user-member" };
const sales: Record<
  string,
  {
    id: number;
    first_name: string;
    last_name: string;
    administrator: boolean | null;
  }
> = {
  "user-admin": {
    id: 1,
    first_name: "Ada",
    last_name: "Admin",
    administrator: true,
  },
  "user-member": {
    id: 2,
    first_name: "Mo",
    last_name: "Member",
    administrator: false,
  },
  "user-null-admin": {
    id: 3,
    first_name: "Na",
    last_name: "Null",
    administrator: null,
  },
};

vi.mock("./supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: session.userId } } },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        match: ({ user_id }: { user_id: string }) => ({
          single: async () => {
            const row = sales[user_id];
            return row
              ? { data: row, error: null }
              : { data: null, error: { message: "not found" } };
          },
        }),
      }),
    }),
  }),
}));

import {
  CURRENT_SALE_CACHE_KEY,
  clearAuthCaches,
  getSale,
  parseSaleCache,
  permissionsFromSale,
  resolvePermissions,
  saleCacheKey,
} from "./authProvider";

describe("permissionsFromSale", () => {
  it("returns admin when sales.administrator is true", () => {
    expect(permissionsFromSale({ administrator: true })).toBe("admin");
  });

  it("returns user when sales.administrator is false", () => {
    expect(permissionsFromSale({ administrator: false })).toBe("user");
  });

  it("returns user (not-admin) when administrator is null on an existing sale row", () => {
    expect(permissionsFromSale({ administrator: null })).toBe("user");
  });

  it("returns undefined when the sales row is missing", () => {
    expect(permissionsFromSale(null)).toBeUndefined();
  });
});

describe("resolvePermissions fail-closed", () => {
  it("returns undefined on a cache parse error instead of throwing", async () => {
    await expect(
      resolvePermissions(async () => JSON.parse("not-json")),
    ).resolves.toBeUndefined();
  });

  it("returns undefined when getSale throws", async () => {
    await expect(
      resolvePermissions(async () => {
        throw new Error("getSale failed");
      }),
    ).resolves.toBeUndefined();
  });
});

describe("parseSaleCache", () => {
  it("returns undefined on corrupt JSON instead of throwing", () => {
    expect(() => parseSaleCache("{not json")).not.toThrow();
    expect(parseSaleCache("{not json")).toBeUndefined();
  });
});

describe("sale cache keyed by user id", () => {
  beforeEach(() => {
    localStorage.clear();
    session.userId = "user-member";
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("does not show admin UI after a user switch without logout", async () => {
    localStorage.setItem(
      saleCacheKey("user-admin"),
      JSON.stringify(sales["user-admin"]),
    );
    // Leftover unkeyed cache from before this fix must not leak either.
    localStorage.setItem(
      CURRENT_SALE_CACHE_KEY,
      JSON.stringify(sales["user-admin"]),
    );
    session.userId = "user-member";
    await expect(resolvePermissions()).resolves.toBe("user");
    const sale = await getSale();
    expect(sale).toMatchObject({ administrator: false });
  });

  it("treats a null administrator on the signed-in sale row as not-admin", async () => {
    session.userId = "user-null-admin";
    await expect(resolvePermissions()).resolves.toBe("user");
  });

  it("ignores a corrupt per-user cache and does not treat the user as admin", async () => {
    localStorage.setItem(saleCacheKey("user-member"), "{not-json");
    session.userId = "user-member";
    await expect(resolvePermissions()).resolves.toBe("user");
  });

  it("clearAuthCaches removes keyed and legacy sale entries", () => {
    localStorage.setItem(saleCacheKey("user-admin"), "x");
    localStorage.setItem(CURRENT_SALE_CACHE_KEY, "y");
    clearAuthCaches();
    expect(localStorage.getItem(saleCacheKey("user-admin"))).toBeNull();
    expect(localStorage.getItem(CURRENT_SALE_CACHE_KEY)).toBeNull();
  });
});
