// AOM⇄Atomic link HMAC (pattern of eos-intake-ingest/hmac.ts; different secret, headers and message).
// signature = HMAC-SHA256(secret, direction \n timestamp \n idempotencyKey \n audience \n rawBody)
// Header value: sha256=<hex>. The direction prefix keeps a captured projection from being replayed
// as a write-back (and vice versa). Keep identical to aom-link-writeback/hmac.ts and the AOM side.
export type LinkDirection = "aom-to-atomic" | "atomic-to-aom";
export const SIGNATURE_HEADER = "X-Aom-Link-Signature";
export const TIMESTAMP_HEADER = "X-Aom-Link-Timestamp";
export const IDEMPOTENCY_HEADER = "X-Aom-Link-Idempotency-Key";
export const AUDIENCE_HEADER = "X-Aom-Link-Audience";
export const MAX_SKEW_SECONDS = 300;

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(mac), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function sign(
  secret: string,
  direction: LinkDirection,
  timestamp: string,
  idempotencyKey: string,
  audience: string,
  rawBody: string,
): Promise<string> {
  const msg = [direction, timestamp, idempotencyKey, audience, rawBody].join(
    "\n",
  );
  return `sha256=${await hmacHex(secret, msg)}`;
}

export async function verify(opts: {
  secret: string | undefined;
  direction: LinkDirection;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  idempotencyKey: string | null | undefined;
  audience: string | null | undefined;
  rawBody: string;
  nowSeconds?: number;
}): Promise<boolean> {
  const { secret, signature, timestamp, idempotencyKey, audience } = opts;
  if (!secret || !signature || !timestamp || !idempotencyKey || !audience) {
    return false;
  }
  if (!/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > MAX_SKEW_SECONDS) return false;
  const expected = await sign(
    secret,
    opts.direction,
    timestamp,
    idempotencyKey,
    audience,
    opts.rawBody,
  );
  return constantTimeEqual(expected, signature);
}
