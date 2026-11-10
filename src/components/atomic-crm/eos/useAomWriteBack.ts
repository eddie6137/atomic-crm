import { useCallback, useEffect, useRef, useState } from "react";
import { useGetList, useNotify, useRefresh } from "ra-core";
import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  ACTION_RESULT_STATUS,
  errorText,
  requestWriteBack,
  type AomAction,
  type AomMapRow,
  type WriteBackResult,
} from "./aomLink";

export type Invoke = (
  commitmentId: string,
  action: AomAction,
) => Promise<{ data: any; error: any }>;
const defaultInvoke: Invoke = (commitment_id, action) =>
  getSupabaseClient().functions.invoke("aom-link-writeback", {
    body: { commitment_id, action },
  });

/** The link row for one commitment (null = ordinary Atomic work). RLS: Team members read. */
export const useAomMap = (commitmentId: string | number | undefined) => {
  const { data, isPending } = useGetList<AomMapRow>(
    "eos_action_source_map",
    {
      pagination: { page: 1, perPage: 1 },
      filter: { commitment_id: commitmentId, namespace: "aom" },
    },
    { enabled: commitmentId != null, retry: false },
  );
  return { aom: data?.[0] ?? null, isPending };
};

/**
 * Write-back state for one AOM-originated card. The shown status is optimistic ("waiting for AOM")
 * only while a request is in flight or accepted-but-not-yet-re-projected; ANY failure restores the
 * last projected status (record.status) and surfaces the error. Atomic never writes status itself.
 */
export const useAomWriteBack = (
  record:
    | { id: string | number; status: string; revision?: number }
    | null
    | undefined,
  opts: { invoke?: Invoke } = {},
) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const invoke = opts.invoke ?? defaultInvoke;
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // AOM's re-projection arrived (status/revision moved): stop waiting.
  useEffect(() => setWaitingFor(null), [record?.status, record?.revision]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const send = useCallback(
    async (action: AomAction): Promise<WriteBackResult | undefined> => {
      if (!record || pending) return;
      setError(null);
      setPending(true);
      setWaitingFor(ACTION_RESULT_STATUS[action]);
      const res = await requestWriteBack(invoke, String(record.id), action);
      setPending(false);
      if (!res.ok) {
        setWaitingFor(null); // restore the last projected status
        const msg = errorText(res.error);
        setError(msg);
        notify(msg, { type: "error" });
        return res;
      }
      notify("Sent to AOM — waiting for it to confirm", { type: "info" });
      refresh();
      timers.current.push(setTimeout(refresh, 2500), setTimeout(refresh, 6000));
      return res;
    },
    [record, pending, invoke, notify, refresh],
  );

  return {
    send,
    pending,
    waitingFor,
    error,
    shownStatus: waitingFor ?? record?.status,
  };
};
