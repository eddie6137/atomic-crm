import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleRequest, isLinkEnabled } from "./handler.ts";
import { sign, type LinkDirection } from "./hmac.ts";

// Ephemeral secret: generated at runtime inside the test process, never printed or committed.
const SECRET = randomBytes(32).toString("hex");
const AUD = `aud-${randomBytes(4).toString("hex")}`;
const ON = {
  ATOMIC_AOM_LINK_ENABLED: "true",
  ATOMIC_AOM_LINK_HMAC_SECRET: SECRET,
  ATOMIC_AOM_LINK_AUDIENCE: AUD,
};

function event(over: Record<string, unknown> = {}) {
  const id = randomUUID();
  return {
    schema: 1, event_type: "upsert", namespace: "aom", source_key: `assignment:${id}`,
    kind: "assignment", commitment_id: id, aom_client_id: randomUUID(),
    aom_revision: "2026-11-10T12:00:00.123456Z", title: "[SYNTHETIC-SEED] Acme Brand action",
    aom_status: "planned", deep_link_path: `/playbooks/assign?assignment=${id}`,
    completed_at: null, ...over,
  };
}
const deliveryId = (e: any) => `aom:${e.source_key}:${e.event_type}:${e.aom_revision}`;

async function req(e: any, o: {
  secret?: string; ts?: number; audience?: string; direction?: LinkDirection; idem?: string;
  unsigned?: boolean; method?: string;
} = {}) {
  const body = JSON.stringify(e);
  const ts = String(o.ts ?? Math.floor(Date.now() / 1000));
  const idem = o.idem ?? deliveryId(e);
  const aud = o.audience ?? AUD;
  const headers: Record<string, string> = {
    "X-Aom-Link-Timestamp": ts, "X-Aom-Link-Idempotency-Key": idem, "X-Aom-Link-Audience": aud,
  };
  if (!o.unsigned) {
    headers["X-Aom-Link-Signature"] = await sign(o.secret ?? SECRET, o.direction ?? "aom-to-atomic", ts, idem, aud, body);
  }
  return new Request("http://localhost/aom-link-ingest", {
    method: o.method ?? "POST", headers, body: o.method === "GET" ? undefined : body,
  });
}
const mkDeps = (data: unknown = { result: "created" }) => ({
  rpc: vi.fn(async () => ({ data, error: null })),
});

describe("aom-link-ingest handler", () => {
  it("flag parsing: missing / junk = off", () => {
    expect(isLinkEnabled(undefined)).toBe(false);
    expect(isLinkEnabled("")).toBe(false);
    expect(isLinkEnabled("maybe")).toBe(false);
    expect(isLinkEnabled("true")).toBe(true);
  });

  it("405 on GET with zero rpc calls", async () => {
    const d = mkDeps();
    expect((await handleRequest(await req(event(), { method: "GET" }), ON, d)).status).toBe(405);
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["unsigned", { unsigned: true }],
    ["bad signature", { secret: randomBytes(16).toString("hex") }],
    ["skewed (old)", { ts: Math.floor(Date.now() / 1000) - 301 }],
    ["skewed (future)", { ts: Math.floor(Date.now() / 1000) + 301 }],
    ["wrong direction (write-back signature on a projection)", { direction: "atomic-to-aom" as const }],
  ])("401 %s: zero rpc calls", async (_n, o) => {
    const d = mkDeps();
    const res = await handleRequest(await req(event(), o), ON, d);
    expect(res.status).toBe(401);
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("401 when the server secret is missing (even with flag on)", async () => {
    const d = mkDeps();
    const res = await handleRequest(await req(event()), { ...ON, ATOMIC_AOM_LINK_HMAC_SECRET: undefined }, d);
    expect(res.status).toBe(401);
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("signature covers the idempotency key and audience (tampering = 401)", async () => {
    const e = event();
    const d = mkDeps();
    const r1 = await req(e);
    const h = new Headers(r1.headers);
    h.set("X-Aom-Link-Idempotency-Key", "aom:other");
    const tampered = new Request(r1.url, { method: "POST", headers: h, body: await r1.text() });
    expect((await handleRequest(tampered, ON, d)).status).toBe(401);
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "false", "0", "garbage"])("signed but flag %j => 403 link_off, zero rpc calls", async (flag) => {
    const d = mkDeps();
    const res = await handleRequest(await req(event()), { ...ON, ATOMIC_AOM_LINK_ENABLED: flag }, d);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "link_off" });
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("signed, flag on, wrong audience => 403, zero rpc calls", async () => {
    const d = mkDeps();
    const res = await handleRequest(await req(event(), { audience: "prod-audience" }), ON, d);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "wrong_audience" });
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("flag is read per call: same handler, off then on", async () => {
    const d = mkDeps();
    const e = event();
    expect((await handleRequest(await req(e), { ...ON, ATOMIC_AOM_LINK_ENABLED: "false" }, d)).status).toBe(403);
    expect((await handleRequest(await req(e), ON, d)).status).toBe(200);
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["status not in vocabulary", { aom_status: "blocked" }],
    ["source_key/commitment mismatch", { commitment_id: randomUUID() }],
    ["absolute deep link", { deep_link_path: "https://evil.example/x" }],
    ["protocol-relative deep link", { deep_link_path: "//evil.example/x" }],
    ["wrong namespace", { namespace: "other" }],
  ])("422 invalid body (%s): zero rpc calls", async (_n, over) => {
    const d = mkDeps();
    const res = await handleRequest(await req(event(over)), ON, d);
    expect(res.status).toBe(422);
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("422 when the idempotency key is not the delivery id", async () => {
    const d = mkDeps();
    const res = await handleRequest(await req(event(), { idem: "aom:wrong" }), ON, d);
    expect(res.status).toBe(422);
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("valid request reaches the rpc with delivery id; replay yields the same id (rpc dedupes)", async () => {
    const e = event();
    const d = mkDeps({ result: "created", commitment_id: e.commitment_id });
    const r1 = await handleRequest(await req(e), ON, d);
    const r2 = await handleRequest(await req(e), ON, d);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const calls = d.rpc.mock.calls as unknown as [string, any][];
    expect(calls[0][0]).toBe("eos_aom_link_apply");
    expect(calls[0][1].p_delivery_id).toBe(deliveryId(e));
    expect(calls[1][1].p_delivery_id).toBe(calls[0][1].p_delivery_id);
  });

  it("conflict result => 409; rpc failure => 502 without detail", async () => {
    const e = event();
    const r = await handleRequest(await req(e), ON, mkDeps({ result: "conflict", reason: "uuid_non_aom" }));
    expect(r.status).toBe(409);
    const bad = { rpc: vi.fn(async () => ({ data: null, error: { message: "secret internals" } })) };
    const r2 = await handleRequest(await req(e), ON, bad);
    expect(r2.status).toBe(502);
    expect(JSON.stringify(await r2.json())).not.toContain("secret internals");
  });
});
