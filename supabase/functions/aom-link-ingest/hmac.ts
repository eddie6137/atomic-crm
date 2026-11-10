// HMAC helpers shared (by copy) between aom-link-ingest and aom-link-writeback.
// Direction-bound so a captured projection cannot be replayed as a write-back
// (and vice versa). Method + path bind the MAC to the intended verb and route.
// Keep identical to aom-link-writeback/hmac.ts and the AOM side.
const SKEW_SECONDS = 300;

export const SIGNATURE_HEADER = "X-Aom-Link-Signature";
export const TIMESTAMP_HEADER = "X-Aom-Link-Timestamp";
export const IDEMPOTENCY_HEADER = "X-Aom-Link-Idempotency-Key";
export const AUDIENCE_HEADER = "X-Aom-Link-Audience";

export type LinkDirection = "aom-to-atomic" | "atomic-to-aom";

export interface SignParams {
  direction: LinkDirection;
  method: string;
  path: string;
  timestamp: string;
  idempotencyKey: string;
  audience: string;
  rawBody: string;
}

export function requestMethod(m: string | undefined | null): string {
  return (m ?? "").trim().toUpperCase();
}

/** Pathname of a URL or path. Query string stripped. Empty / unparseable → "". */
export function requestPath(urlOrPath: string | undefined | null): string {
  if (!urlOrPath) return "";
  try {
    const u = urlOrPath.includes("://")
      ? new URL(urlOrPath)
      : new URL(urlOrPath, "http://hmac.invalid");
    return u.pathname;
  } catch {
    return "";
  }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sign(secret: string, p: SignParams): Promise<string> {
  const method = requestMethod(p.method);
  const path = requestPath(p.path);
  const msg = [
    p.direction,
    method,
    path,
    p.timestamp,
    p.idempotencyKey,
    p.audience,
    p.rawBody,
  ].join("\n");
  return `sha256=${await hmacHex(secret, msg)}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export async function verify(
  p: {
    secret?: string | null;
    signature?: string | null;
    nowSeconds?: number;
  } & SignParams,
): Promise<boolean> {
  if (!p.secret || !p.signature || !p.timestamp || !p.idempotencyKey || !p.audience)
    return false;
  if (!requestMethod(p.method) || !requestPath(p.path)) return false;
  const ts = Number(p.timestamp);
  const now = p.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > SKEW_SECONDS) return false;
  const expected = await sign(p.secret, p);
  return timingSafeEqual(expected, p.signature);
}
