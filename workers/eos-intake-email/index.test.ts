import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verify } from "./src/hmac";
import {
  buildPayload,
  handleEmail,
  isIngestRecipient,
  shouldDropForKillSwitch,
  sign,
} from "./src/index";

const SECRET = "test-hmac-secret-not-for-prod";
const env = {
  EOS_INTAKE_HMAC_SECRET: SECRET,
  INGEST_ADDRESS: "intake@actions.example.com",
  INTAKE_EDGE_URL: "https://edge.example.test/functions/v1/eos-intake-ingest",
  INTAKE_ENABLED: "1",
};
const headers = (h: Record<string, string>) => ({
  get: (n: string) => h[n.toLowerCase()] ?? null,
});
const mkMessage = (to = env.INGEST_ADDRESS) => ({
  from: "sender@example.com",
  to,
  headers: headers({ subject: "Hi", "message-id": "<id@x>" }),
  setReject: vi.fn(),
});

describe("worker helpers", () => {
  it("accepts only the exact ingest address", () => {
    expect(isIngestRecipient(env.INGEST_ADDRESS, env.INGEST_ADDRESS)).toBe(
      true,
    );
    expect(
      isIngestRecipient("other@actions.example.com", env.INGEST_ADDRESS),
    ).toBe(false);
    expect(isIngestRecipient("x@y.z", undefined)).toBe(false);
  });

  it("treats only INTAKE_ENABLED=1 as on", () => {
    expect(shouldDropForKillSwitch({ INTAKE_ENABLED: "1" })).toBe(false);
    for (const v of [undefined, "", "0", "false", "true"]) {
      expect(shouldDropForKillSwitch({ INTAKE_ENABLED: v })).toBe(true);
    }
  });

  it("builds a minimized payload with only the five fields", () => {
    const p = buildPayload(mkMessage(), new Date("2026-11-09T00:00:00Z"));
    expect(p).toEqual({
      from: "sender@example.com",
      to: env.INGEST_ADDRESS,
      subject: "Hi",
      message_id: "<id@x>",
      received_at: "2026-11-09T00:00:00.000Z",
    });
  });

  it("signs identically to node:crypto HMAC-SHA256 over timestamp.body", async () => {
    const hex = createHmac("sha256", SECRET).update("123.{}").digest("hex");
    expect(await sign(SECRET, "123", "{}")).toBe(`sha256=${hex}`);
  });
});

describe("hmac verify", () => {
  it("rejects tampering, bad format, and expired timestamps", async () => {
    const sig = await sign(SECRET, "1000", "body");
    const base = {
      secret: SECRET,
      signature: sig,
      timestamp: "1000",
      rawBody: "body",
      nowSeconds: 1000,
    };
    expect(await verify(base)).toBe(true);
    expect(await verify({ ...base, rawBody: "bodY" })).toBe(false);
    expect(await verify({ ...base, signature: "nope" })).toBe(false);
    expect(await verify({ ...base, secret: undefined })).toBe(false);
    expect(await verify({ ...base, nowSeconds: 1301 })).toBe(false);
  });
});

describe("handleEmail", () => {
  it("rejects and does not POST for a non-ingest recipient", async () => {
    const fetchImpl = vi.fn();
    const msg = mkMessage("catchall@actions.example.com");
    await handleEmail(msg, env, fetchImpl);
    expect(msg.setReject).toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("drops without POSTing when the kill switch is off", async () => {
    const fetchImpl = vi.fn();
    await handleEmail(mkMessage(), { ...env, INTAKE_ENABLED: "0" }, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs a signed minimized body that the verifier accepts", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await handleEmail(mkMessage(), env, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const h = init.headers as Record<string, string>;
    expect(url).toBe(env.INTAKE_EDGE_URL);
    expect(h["Content-Type"]).toBe("application/json");
    expect(
      await verify({
        secret: SECRET,
        signature: h["X-Eos-Intake-Signature"],
        timestamp: h["X-Eos-Intake-Timestamp"],
        rawBody: init.body as string,
      }),
    ).toBe(true);
    expect(Object.keys(JSON.parse(init.body as string)).sort()).toEqual([
      "from",
      "message_id",
      "received_at",
      "subject",
      "to",
    ]);
  });
});
