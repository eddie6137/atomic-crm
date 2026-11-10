import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleRequest } from "./handler.ts";

// Service-role client is built lazily and only after the handler has accepted the request;
// the key is read from the Deno env and never logged. Flag/secret/audience are read per request.
Deno.serve((req: Request) =>
  handleRequest(
    req,
    {
      ATOMIC_AOM_LINK_ENABLED: Deno.env.get("ATOMIC_AOM_LINK_ENABLED"),
      ATOMIC_AOM_LINK_HMAC_SECRET: Deno.env.get("ATOMIC_AOM_LINK_HMAC_SECRET"),
      ATOMIC_AOM_LINK_AUDIENCE: Deno.env.get("ATOMIC_AOM_LINK_AUDIENCE"),
    },
    {
      rpc: (fn, args) =>
        createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          { auth: { autoRefreshToken: false, persistSession: false } },
        ).rpc(fn, args) as unknown as Promise<{ data: unknown; error: unknown }>,
    },
  ),
);
