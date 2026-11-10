// Dedicated AOM→Atomic projection ingress. Kill switch + HMAC + audience are all decided BEFORE
// any database call; `deps.rpc` is only reached for a signed, in-audience, flag-on, valid request.
// Status codes: 401 bad/missing/skewed HMAC · 403 link_off / wrong_audience · 422 invalid body.
import {
  AUDIENCE_HEADER,
  IDEMPOTENCY_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verify,
} from "./hmac.ts";

export interface IngestEnv {
  ATOMIC_AOM_LINK_ENABLED?: string;
  ATOMIC_AOM_LINK_HMAC_SECRET?: string;
  ATOMIC_AOM_LINK_AUDIENCE?: string;
}
export interface IngestDeps {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
}

/** Missing / unparsable = OFF. Only an explicit truthy token turns the link on. */
export function isLinkEnabled(v: string | undefined | null): boolean {
  return ["1", "true", "on", "yes"].includes((v ?? "").trim().toLowerCase());
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "skipped",
  "cancelled",
];

export function validateEvent(p: any, idem: string): boolean {
  if (!p || typeof p !== "object") return false;
  if (p.schema !== 1 || p.namespace !== "aom") return false;
  if (!["upsert", "archive"].includes(p.event_type)) return false;
  if (!["assignment", "custom"].includes(p.kind)) return false;
  if (typeof p.commitment_id !== "string" || !UUID.test(p.commitment_id))
    return false;
  if (p.source_key !== `${p.kind}:${p.commitment_id}`) return false;
  if (typeof p.aom_client_id !== "string" || !UUID.test(p.aom_client_id))
    return false;
  if (typeof p.aom_revision !== "string" || p.aom_revision.length < 10)
    return false;
  if (
    typeof p.title !== "string" ||
    p.title.trim() === "" ||
    p.title.length > 500
  )
    return false;
  if (!STATUSES.includes(p.aom_status)) return false;
  if (
    typeof p.deep_link_path !== "string" ||
    !p.deep_link_path.startsWith("/") ||
    p.deep_link_path.startsWith("//")
  )
    return false;
  return idem === `aom:${p.source_key}:${p.event_type}:${p.aom_revision}`;
}

export async function handleRequest(
  req: Request,
  env: IngestEnv,
  deps: IngestDeps,
  nowSeconds?: number,
): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const rawBody = await req.text();
  const idem = req.headers.get(IDEMPOTENCY_HEADER);
  const audience = req.headers.get(AUDIENCE_HEADER);
  const ok = await verify({
    secret: env.ATOMIC_AOM_LINK_HMAC_SECRET,
    direction: "aom-to-atomic",
    signature: req.headers.get(SIGNATURE_HEADER),
    timestamp: req.headers.get(TIMESTAMP_HEADER),
    idempotencyKey: idem,
    audience,
    rawBody,
    nowSeconds,
  });
  if (!ok) return json({ error: "unauthorized" }, 401);

  if (!isLinkEnabled(env.ATOMIC_AOM_LINK_ENABLED)) {
    return json({ error: "link_off" }, 403);
  }
  if (
    !env.ATOMIC_AOM_LINK_AUDIENCE ||
    audience !== env.ATOMIC_AOM_LINK_AUDIENCE
  ) {
    return json({ error: "wrong_audience" }, 403);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_request" }, 422);
  }
  if (!validateEvent(event, idem!))
    return json({ error: "invalid_request" }, 422);

  const { data, error } = await deps.rpc("eos_aom_link_apply", {
    p_delivery_id: idem,
    p_event: event,
  });
  if (error || !data || typeof data !== "object") {
    return json({ error: "rpc_error" }, 502);
  }
  const result = data as { result?: string };
  return json(data, result.result === "conflict" ? 409 : 200);
}
