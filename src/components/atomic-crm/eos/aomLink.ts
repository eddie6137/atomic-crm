// AOM→Atomic link (addendum Rev 0.2.1): AOM-originated commitments are projections. AOM owns status;
// Atomic only REQUESTS start / complete / skip through the signed write-back edge function and then
// waits for AOM's accept + re-projection. Title, account, SOP, comments are not editable here.

import { normalizeDeepLinkPath } from "../../../../supabase/functions/_shared/deepLink";

export type AomAction = "start" | "complete" | "skip";

export type AomMapRow = {
  id: string;
  commitment_id: string;
  namespace: string;
  source_key: string;
  kind: "assignment" | "custom";
  deep_link_path: string;
};

/**
 * Buttons offered for an AOM-originated card. Complete is offered ONLY from in_progress
 * (AOM rejects planned→completed; Start first). completed / cancelled(skipped) offer nothing:
 * no reopen, no blocked.
 */
export const offeredActions = (
  status: string | null | undefined,
): AomAction[] => {
  if (status === "open") return ["start", "skip"];
  if (status === "in_progress") return ["complete", "skip"];
  return [];
};

/** The status Atomic will show once AOM accepts and re-projects (used only for the waiting label). */
export const ACTION_RESULT_STATUS: Record<AomAction, string> = {
  start: "in_progress",
  complete: "completed",
  skip: "cancelled",
};

export const ACTION_LABEL: Record<AomAction, string> = {
  start: "Start",
  complete: "Complete",
  skip: "Skip",
};

export const statusLabel = (record: {
  status?: string | null;
  status_reason?: string | null;
}): string =>
  record.status === "cancelled" && record.status_reason === "skipped"
    ? "Skipped"
    : String(record.status ?? "").replace(/_/g, " ");

/**
 * Absolute AOM deep link, or null (the panel then shows the path as text). The path is run through
 * the shared ingest helper; the origin must be a valid http(s) URL.
 */
export const aomHref = (path: string, origin?: string | null): string | null => {
  const rel = normalizeDeepLinkPath(path);
  if (!rel || !origin) return null;
  let u: URL;
  try {
    u = new URL(origin.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  return `${origin.trim().replace(/\/+$/, "")}${rel}`;
};

export type WriteBackResult =
  | { ok: true; result?: string; aom_status?: string | null }
  | { ok: false; error: string; aom_status?: string | null };

const ERROR_TEXT: Record<string, string> = {
  invalid_transition:
    "AOM did not accept that change for its current state. Start the item first, then Complete.",
  link_off: "The AOM link is switched off.",
  aom_unreachable: "AOM could not be reached.",
  rejected_signature: "AOM rejected the request.",
  not_found: "AOM could not find this item.",
  archived: "This item is archived.",
};
export const errorText = (code: string): string =>
  ERROR_TEXT[code] ?? "AOM did not accept that change.";

/** Calls the write-back edge function. Never throws: every failure is a typed {ok:false}. */
export async function requestWriteBack(
  invoke: (
    commitmentId: string,
    action: AomAction,
  ) => Promise<{ data: any; error: any }>,
  commitmentId: string,
  action: AomAction,
): Promise<WriteBackResult> {
  try {
    const { data, error } = await invoke(commitmentId, action);
    if (data && typeof data === "object" && typeof data.ok === "boolean")
      return data as WriteBackResult;
    // supabase-js surfaces non-2xx as `error` with the response in context
    const body = await error?.context?.json?.().catch(() => null);
    if (body && typeof body.error === "string")
      return { ok: false, error: body.error };
    return { ok: false, error: "aom_unreachable" };
  } catch {
    return { ok: false, error: "aom_unreachable" };
  }
}
