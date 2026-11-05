import { useEffect, useState } from "react";
import { getSupabaseClient } from "../providers/supabase/supabase";

export const OBLIGATION_TYPES = [
  "fee_step_up",
  "review",
  "renewal",
  "notice",
  "threshold",
  "scope_addendum",
];
export const OBLIGATION_STATUSES = [
  "proposed",
  "open",
  "upcoming",
  "fulfilled",
  "missed",
  "waived",
  "not_applicable",
];
export const ANCHORS = [
  "contract_start",
  "contract_end",
  "period_start",
  "period_end",
  "invoice_date",
  "scope_event",
];
export const CONTRACT_STATUSES = ["draft", "active", "expired", "terminated"];
export const OFFSET_UNITS = ["day", "business_day", "month", "year"];

/** Server-side check (RLS is the real gate; this only decides what to render). */
export const usePrivateMember = () => {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    getSupabaseClient()
      .rpc("eos_is_private_member")
      .then(({ data, error }) => setOk(!error && data === true));
  }, []);
  return ok;
};
