import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { handleRequest, type Target } from "./handler.ts";

// The caller's own JWT scopes every read (RLS: Team members only); no service-role key is used here.
const userClient = (req: Request) =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const res = await handleRequest(
    req,
    {
      ATOMIC_AOM_LINK_ENABLED: Deno.env.get("ATOMIC_AOM_LINK_ENABLED"),
      ATOMIC_AOM_LINK_HMAC_SECRET: Deno.env.get("ATOMIC_AOM_LINK_HMAC_SECRET"),
      ATOMIC_AOM_LINK_AUDIENCE: Deno.env.get("ATOMIC_AOM_LINK_AUDIENCE"),
      ATOMIC_AOM_LINK_AOM_URL: Deno.env.get("ATOMIC_AOM_LINK_AOM_URL"),
    },
    {
      authenticate: async (r) => {
        const token = (r.headers.get("Authorization") ?? "").replace(
          /^Bearer\s+/i,
          "",
        );
        if (!token) return false;
        const { data, error } = await userClient(r).auth.getUser(token);
        return !error && !!data.user;
      },
      loadTarget: async (r, id): Promise<Target | null> => {
        const c = userClient(r);
        const { data: row } = await c
          .from("eos_commitments")
          .select("id,revision,status,archived_at")
          .eq("id", id)
          .maybeSingle();
        if (!row) return null;
        const { data: map } = await c
          .from("eos_action_source_map")
          .select("namespace,source_key")
          .eq("commitment_id", id)
          .maybeSingle();
        if (!map) return null;
        return {
          commitment_id: row.id,
          revision: row.revision,
          status: row.status,
          archived_at: row.archived_at,
          ...map,
        };
      },
      fetch,
    },
  );
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) h.set(k, v as string);
  return new Response(res.body, { status: res.status, headers: h });
});
