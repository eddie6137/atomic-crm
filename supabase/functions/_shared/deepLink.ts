// Shared deep_link_path rules. Imported by the aom-link-ingest edge function AND the UI (aomHref),
// so it must stay dependency-free. Keep in sync with AOM server/services/atomicLink/outbox.ts
// (toRelativeDeepLink) and with the SQL CHECK in migrations/20261110130000_aom_link_deep_link_check.sql.

/** Max length of the normalized (stored) deep_link_path. */
export const MAX_DEEP_LINK_LENGTH = 2048;

// C0 controls + DEL (includes CR/LF/tab).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const EDGE_WS = /^\s|\s$/;
const badText = (s: string) => CONTROL.test(s) || EDGE_WS.test(s);

/**
 * Reduce a deep link to an app-relative path. Relative `/…` (not `//…` or `/\…`) passes through
 * unchanged; absolute http(s) URLs become pathname+search+hash. Anything else returns null:
 * other schemes, protocol-relative, non-strings, C0/DEL controls, leading/trailing whitespace
 * (rejected, never trimmed), and a normalized result longer than 2048 chars.
 */
export function normalizeDeepLinkPath(v: unknown): string | null {
  if (typeof v !== "string" || badText(v)) return null;
  let out: string;
  if (/^https?:\/\//i.test(v)) {
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      return null;
    }
    out = u.pathname + u.search + u.hash;
  } else {
    out = v;
  }
  if (!out.startsWith("/") || out.startsWith("//") || out.startsWith("/\\")) {
    return null;
  }
  if (out.length > MAX_DEEP_LINK_LENGTH || badText(out)) return null;
  return out;
}
