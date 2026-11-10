import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleRequest, type Target } from "./handler.ts";
import { sign as signWb } from "./hmac.ts";
import {
  sign as signIngest,
  verify as verifyIngest,
} from "../aom-link-ingest/hmac.ts";

const SECRET = randomBytes(32).toString("hex"); // ephemeral, test-process only
const AUD = `aud-${randomBytes(4).toString("hex")}`;
const ON = {
  ATOMIC_AOM_LINK_ENABLED: "true",
  ATOMIC_AOM_LINK_HMAC_SECRET: SECRET,
  ATOMIC_AOM_LINK_AUDIENCE: AUD,
  ATOMIC_AOM_LINK_AOM_URL: "http://aom.invalid/",
};
const id = randomUUID();
const target = (over: Partial<Target> = {}): Target => ({
  commitment_id: id,
  revision: 3,
  status: "open",
  archived_at: null,
  namespace: "aom",
  source_key: `assignment:${id}`,
  ...over,
});
const mk = (
  o: { auth?: boolean; target?: Target | null; aom?: Response | Error } = {},
) => {
  const fetchFn = vi.fn(async () => {
    if (o.aom instanceof Error) throw o.aom;
    return (
      o.aom ??
      new Response(
        JSON.stringify({
          ok: true,
          result: "applied",
          aom_status: "in_progress",
        }),
        { status: 200 },
      )
    );
  });
  const deps = {
    authenticate: vi.fn(async () => o.auth ?? true),
    loadTarget: vi.fn(async () =>
      o.target === undefined ? target() : o.target,
    ),
    fetch: fetchFn as unknown as typeof fetch,
  };
  return { deps, fetchFn };
};
const post = (body: unknown, method = "POST") =>
  new Request("http://localhost/aom-link-writeback", {
    method,
    body: method === "GET" ? undefined : JSON.stringify(body),
    headers: { Authorization: "Bearer x" },
  });

describe("aom-link-writeback handler", () => {
  it("flag off: no table read, no AOM call", async () => {
    for (const flag of [undefined, "false", "junk"]) {
      const { deps, fetchFn } = mk();
      const res = await handleRequest(
        post({ commitment_id: id, action: "start" }),
        { ...ON, ATOMIC_AOM_LINK_ENABLED: flag },
        deps,
      );
      expect(await res.json()).toEqual({ ok: false, error: "link_off" });
      expect(deps.loadTarget).not.toHaveBeenCalled();
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });

  it("unauthenticated => 401 and nothing else runs", async () => {
    const { deps, fetchFn } = mk({ auth: false });
    const res = await handleRequest(
      post({ commitment_id: id, action: "start" }),
      ON,
      deps,
    );
    expect(res.status).toBe(401);
    expect(deps.loadTarget).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects blocked / reopen / unknown actions (only start, complete, skip)", async () => {
    for (const action of ["blocked", "reopen", "cancel", undefined]) {
      const { deps, fetchFn } = mk();
      const res = await handleRequest(
        post({ commitment_id: id, action }),
        ON,
        deps,
      );
      expect(res.status).toBe(422);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });

  it("404 for a non-AOM commitment", async () => {
    const { deps, fetchFn } = mk({ target: null });
    expect(
      (
        await handleRequest(
          post({ commitment_id: id, action: "start" }),
          ON,
          deps,
        )
      ).status,
    ).toBe(404);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ["start", "in_progress"],
    ["complete", "completed"],
    ["skip", "skipped"],
  ])(
    "%s sends a correctly signed atomic-to-aom request with key atomic:<id>:<rev>:<status>",
    async (action, status) => {
      const { deps, fetchFn } = mk();
      const res = await handleRequest(
        post({ commitment_id: id, action }),
        ON,
        deps,
      );
      expect(await res.json()).toMatchObject({
        ok: true,
        requested_status: status,
      });
      const [url, init] = fetchFn.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe("http://aom.invalid/api/atomic-link/write-back");
      const h = init.headers as Record<string, string>;
      const idem = `atomic:${id}:3:${status}`;
      expect(h["X-Aom-Link-Idempotency-Key"]).toBe(idem);
      expect(JSON.parse(init.body as string)).toEqual({
        schema: 1,
        namespace: "aom",
        source_key: `assignment:${id}`,
        commitment_id: id,
        revision: 3,
        requested_status: status,
      });
      // verifies as atomic-to-aom, and NOT as a projection (direction-bound)
      const common = {
        secret: SECRET,
        signature: h["X-Aom-Link-Signature"],
        timestamp: h["X-Aom-Link-Timestamp"],
        idempotencyKey: idem,
        audience: AUD,
        rawBody: init.body as string,
      };
      expect(
        await verifyIngest({ ...common, direction: "atomic-to-aom" }),
      ).toBe(true);
      expect(
        await verifyIngest({ ...common, direction: "aom-to-atomic" }),
      ).toBe(false);
    },
  );

  it("both hmac copies agree", async () => {
    expect(await signWb(SECRET, "atomic-to-aom", "1", "k", "a", "b")).toBe(
      await signIngest(SECRET, "atomic-to-aom", "1", "k", "a", "b"),
    );
  });

  it("AOM 409 invalid_transition => typed ok:false (UI restores); nothing else attempted", async () => {
    const { deps } = mk({
      aom: new Response(
        JSON.stringify({ error: "invalid_transition", aom_status: "planned" }),
        { status: 409 },
      ),
    });
    const res = await handleRequest(
      post({ commitment_id: id, action: "complete" }),
      ON,
      deps,
    );
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "invalid_transition",
      aom_status: "planned",
    });
    expect(deps.fetch).toHaveBeenCalledTimes(1); // no Start+Complete chain
  });

  it("maps 401/403/network failures to typed errors", async () => {
    const r401 = await handleRequest(
      post({ commitment_id: id, action: "start" }),
      ON,
      mk({ aom: new Response("{}", { status: 401 }) }).deps,
    );
    expect((await r401.json()).error).toBe("rejected_signature");
    const r403 = await handleRequest(
      post({ commitment_id: id, action: "start" }),
      ON,
      mk({ aom: new Response("{}", { status: 403 }) }).deps,
    );
    expect((await r403.json()).error).toBe("link_off");
    const net = await handleRequest(
      post({ commitment_id: id, action: "start" }),
      ON,
      mk({ aom: new Error("down") }).deps,
    );
    expect((await net.json()).error).toBe("aom_unreachable");
  });

  it("archived item is not sent", async () => {
    const { deps, fetchFn } = mk({
      target: target({ archived_at: "2026-11-10T00:00:00Z" }),
    });
    expect(
      (
        await (
          await handleRequest(
            post({ commitment_id: id, action: "start" }),
            ON,
            deps,
          )
        ).json()
      ).error,
    ).toBe("archived");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
