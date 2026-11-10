import { describe, expect, it } from "vitest";
import { sign, verify } from "./hmac.ts";

const SECRET = "test-hmac-secret-not-for-prod";
const NOW = 1_700_000_000;
const BODY = '{"from":"a@b.c"}';

describe("edge hmac", () => {
  it("accepts a signature it produced", async () => {
    const signature = await sign(SECRET, String(NOW), BODY);
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(
      await verify({
        secret: SECRET,
        signature,
        timestamp: String(NOW),
        rawBody: BODY,
        nowSeconds: NOW,
      }),
    ).toBe(true);
  });

  it("matches a known HMAC-SHA256 vector from node:crypto", async () => {
    const { createHmac } = await import("node:crypto");
    const hex = createHmac("sha256", SECRET)
      .update(`${NOW}.${BODY}`)
      .digest("hex");
    expect(await sign(SECRET, String(NOW), BODY)).toBe(`sha256=${hex}`);
  });

  it("rejects a tampered body, wrong secret, missing or malformed input", async () => {
    const signature = await sign(SECRET, String(NOW), BODY);
    const base = {
      secret: SECRET,
      signature,
      timestamp: String(NOW),
      rawBody: BODY,
      nowSeconds: NOW,
    };
    expect(await verify({ ...base, rawBody: BODY + " " })).toBe(false);
    expect(await verify({ ...base, secret: "other" })).toBe(false);
    expect(await verify({ ...base, secret: undefined })).toBe(false);
    expect(await verify({ ...base, signature: null })).toBe(false);
    expect(await verify({ ...base, signature: "sha256=zz" })).toBe(false);
    expect(await verify({ ...base, signature: signature.slice(7) })).toBe(
      false,
    );
    expect(await verify({ ...base, timestamp: "abc" })).toBe(false);
  });

  it("rejects timestamps more than 300 seconds off, accepts exactly 300", async () => {
    const at = async (ts: number) =>
      verify({
        secret: SECRET,
        signature: await sign(SECRET, String(ts), BODY),
        timestamp: String(ts),
        rawBody: BODY,
        nowSeconds: NOW,
      });
    expect(await at(NOW - 301)).toBe(false);
    expect(await at(NOW + 301)).toBe(false);
    expect(await at(NOW - 300)).toBe(true);
  });
});
