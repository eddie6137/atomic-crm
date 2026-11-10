// Intake & Triage P1: pure helpers + thin RPC wrappers (no network in the pure parts).
import { getSupabaseClient } from "../../providers/supabase/supabase";

/** UI-only feature flag, default OFF. Ingest still has its own server-side switch (P2). */
export const isIntakeUiEnabled = () =>
  import.meta.env.VITE_EOS_INTAKE_UI === "1";

export type IntakeItem = {
  id: string;
  source: "email" | "slack" | "fireflies" | "quick_add" | "fixture";
  subject?: string | null;
  from_addr?: string | null;
  excerpt: string;
  source_url?: string | null;
  company_id?: number | null;
  needs_client: boolean;
  suggested_title?: string | null;
  suggested_owner_sales_id?: number | null;
  suggested_due_date?: string | null;
  triage_label?: "action" | "fyi" | "noise" | null;
  triage_status: string;
  commitment_id?: string | null;
  decided_at?: string | null;
};

export type AcceptFields = {
  title: string;
  company_id: number | null;
  owner_sales_id: number | null;
  due_date: string | null;
};

/** Why Accept Action must stay disabled (mirrors the RPC); null = ready. */
export const acceptActionBlocker = (
  f: AcceptFields,
  needsClient: boolean,
): string | null => {
  if (f.company_id == null)
    return needsClient
      ? "Needs client: choose an account"
      : "Choose an account";
  if (!f.title.trim()) return "Title required";
  if (f.owner_sales_id == null) return "Owner required";
  if (!f.due_date) return "Due date required";
  return null;
};

/** Accept FYI needs an account and a 1-2000 character note. */
export const acceptFyiBlocker = (
  companyId: number | null,
  body: string,
  needsClient: boolean,
): string | null => {
  if (companyId == null)
    return needsClient
      ? "Needs client: choose an account"
      : "Choose an account";
  const n = body.trim().length;
  if (n < 1 || n > 2000) return "Note must be 1-2000 characters";
  return null;
};

/** U4 audit row for a quick-add commitment. Returns an error message or null. Never throws. */
export const auditQuickAdd = async (
  commitmentId: string | number,
): Promise<string | null> => {
  try {
    const { error } = await getSupabaseClient().rpc(
      "eos_intake_audit_quick_add",
      { p_commitment_id: commitmentId },
    );
    return error ? error.message : null;
  } catch (e) {
    return (e as Error)?.message ?? "unknown error";
  }
};
