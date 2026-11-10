// Atomic → AOM write-back sender (start / complete / skip). Atomic NEVER writes AOM-owned status here:
// AOM is the source of truth; it accepts or rejects, then re-projects through its outbox.
// Order: method → authenticated member (401) → kill switch (403 link_off, BEFORE any table read) →
// body (422) → load commitment + map via the caller's RLS-scoped client (404) → signed POST to AOM.
// Domain failures return HTTP 200 {ok:false,error} so the browser can restore its prior state.
import {
  AUDIENCE_HEADER,
  IDEMPOTENCY_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  sign,
} from "./hmac.ts";

export interface WritebackEnv {
  ATOMIC_AOM_LINK_ENABLED?: string;
  ATOMIC_AOM_LINK_HMAC_SECRET?: string;
  ATOMIC_AOM_LINK_AUDIENCE?: string;
  ATOMIC_AOM_LINK_AOM_URL?: string;
}
export interface Target {
  commitment_id: string;
  revision: number;
  status: string;
  archived_at: string | null;
  namespace: string;
  source_key: string;
}
export interface WritebackDeps {
  authenticate: (req: Request) => Promise<boolean>;
  loadTarget: (req: Request, commitmentId: string) => Promise<Target | null>;
  fetch: typeof fetch;
}

export const ACTIONS = {
  start: "in_progress",
  complete: "completed",
  skip: "skipped",
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLinkEnabled(v: string | undefined | null): boolean {
  return ["1", "true", "on", "yes"].includes((v ?? "").trim().toLowerCase());
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function handleRequest(
  req: Request,
  env: WritebackEnv,
  deps: WritebackDeps,
): Promise<Response> {
  if (req.method !== "POST")
    return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!(await deps.authenticate(req)))
    return json({ ok: false, error: "unauthorized" }, 401);
  if (!isLinkEnabled(env.ATOMIC_AOM_LINK_ENABLED))
    return json({ ok: false, error: "link_off" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_request" }, 422);
  }
  const requested = (ACTIONS as Record<string, string>)[body?.action];
  if (
    !requested ||
    typeof body?.commitment_id !== "string" ||
    !UUID.test(body.commitment_id)
  ) {
    return json({ ok: false, error: "invalid_request" }, 422);
  }
  const secret = env.ATOMIC_AOM_LINK_HMAC_SECRET;
  const audience = env.ATOMIC_AOM_LINK_AUDIENCE;
  const aomUrl = env.ATOMIC_AOM_LINK_AOM_URL;
  if (!secret || !audience || !aomUrl)
    return json({ ok: false, error: "link_not_configured" });

  const t = await deps.loadTarget(req, body.commitment_id);
  if (!t || t.namespace !== "aom")
    return json({ ok: false, error: "not_aom_item" }, 404);
  if (t.archived_at) return json({ ok: false, error: "archived" });

  const payload = JSON.stringify({
    schema: 1,
    namespace: "aom",
    source_key: t.source_key,
    commitment_id: t.commitment_id,
    revision: t.revision,
    requested_status: requested,
  });
  const idem = `atomic:${t.commitment_id}:${t.revision}:${requested}`;
  const ts = String(Math.floor(Date.now() / 1000));
  let res: Response;
  try {
    res = await deps.fetch(
      `${aomUrl.replace(/\/+$/, "")}/api/atomic-link/write-back`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TIMESTAMP_HEADER]: ts,
          [IDEMPOTENCY_HEADER]: idem,
          [AUDIENCE_HEADER]: audience,
          [SIGNATURE_HEADER]: await sign(secret, {
            direction: "atomic-to-aom",
            method: "POST",
            path: "/api/atomic-link/write-back",
            timestamp: ts,
            idempotencyKey: idem,
            audience,
            rawBody: payload,
          }),
        },
        body: payload,
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    return json({ ok: false, error: "aom_unreachable" });
  }
  let out: any = null;
  try {
    out = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (res.status === 200 && out?.ok === true) {
    return json({
      ok: true,
      result: out.result ?? "applied",
      aom_status: out.aom_status ?? null,
      requested_status: requested,
    });
  }
  const error =
    typeof out?.error === "string"
      ? out.error
      : res.status === 401
        ? "rejected_signature"
        : res.status === 403
          ? "link_off"
          : "aom_rejected";
  return json({
    ok: false,
    error,
    aom_status: out?.aom_status ?? null,
    http_status: res.status,
  });
}
