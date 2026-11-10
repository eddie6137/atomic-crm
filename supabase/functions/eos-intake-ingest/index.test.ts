import { describe, expect, it } from "vitest";
import { handleRequest } from "./handler.ts";
import { sign } from "./hmac.ts";

const SECRET = "test-hmac-secret-not-for-prod";
const payload = {
  from: "a@example.com",
  to: "intake@example.com",
  subject: "Hello",
  message_id: null,
  received_at: "2026-11-09T00:00:00.000Z",
};

async function signed(
  body: string,
  opts: { ts?: number; method?: string; secret?: string } = {},
) {
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  return new Request("http://localhost/eos-intake-ingest", {
    method: opts.method ?? "POST",
    headers: {
      "X-Eos-Intake-Signature": await sign(opts.secret ?? SECRET, ts, body),
      "X-Eos-Intake-Timestamp": ts,
    },
    body: opts.method === "GET" ? undefined : body,
  });
}

describe("eos-intake-ingest handler", () => {
  const body = JSON.stringify(payload);

  it("returns 405 for GET", async () => {
    const res = await handleRequest(await signed(body, { method: "GET" }), {
      EOS_INTAKE_HMAC_SECRET: SECRET,
      INTAKE_ENABLED: "1",
    });
    expect(res.status).toBe(405);
  });

  it("returns 401 for a bad signature, even when intake is disabled", async () => {
    const res = await handleRequest(await signed(body, { secret: "wrong" }), {
      EOS_INTAKE_HMAC_SECRET: SECRET,
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired timestamp", async () => {
    const old = Math.floor(Date.now() / 1000) - 301;
    const res = await handleRequest(await signed(body, { ts: old }), {
      EOS_INTAKE_HMAC_SECRET: SECRET,
      INTAKE_ENABLED: "1",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when the server secret is missing", async () => {
    const res = await handleRequest(await signed(body), {
      INTAKE_ENABLED: "1",
    });
    expect(res.status).toBe(401);
  });

  it.each([undefined, "", "0", "false", "true", "yes"])(
    "reports intake_disabled when INTAKE_ENABLED is %j",
    async (flag) => {
      const res = await handleRequest(await signed(body), {
        EOS_INTAKE_HMAC_SECRET: SECRET,
        INTAKE_ENABLED: flag,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        accepted: false,
        reason: "intake_disabled",
      });
    },
  );

  it("accepts a valid signed payload when INTAKE_ENABLED is exactly 1", async () => {
    const res = await handleRequest(await signed(body), {
      EOS_INTAKE_HMAC_SECRET: SECRET,
      INTAKE_ENABLED: "1",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: true });
  });

  it("returns 400 for a validly signed but malformed payload when enabled", async () => {
    const res = await handleRequest(await signed('{"from":1}'), {
      EOS_INTAKE_HMAC_SECRET: SECRET,
      INTAKE_ENABLED: "1",
    });
    expect(res.status).toBe(400);
  });
});
