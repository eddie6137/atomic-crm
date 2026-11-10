// HMAC-SHA256 over `${timestamp}.${rawBody}`. Header: sha256=<hex>.
// Keep the algorithm identical to supabase/functions/eos-intake-ingest/hmac.ts.
export const SIGNATURE_HEADER = "X-Eos-Intake-Signature";
export const TIMESTAMP_HEADER = "X-Eos-Intake-Timestamp";
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
  timestamp: string,
  rawBody: string,
): Promise<string> {
  return `sha256=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
}

export async function verify(opts: {
  secret: string | undefined;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  rawBody: string;
  nowSeconds?: number;
}): Promise<boolean> {
  const { secret, signature, timestamp, rawBody } = opts;
  if (!secret || !signature || !timestamp) return false;
  if (!/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > MAX_SKEW_SECONDS) return false;
  const expected = await sign(secret, timestamp, rawBody);
  return constantTimeEqual(expected, signature);
}
