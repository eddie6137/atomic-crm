import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleRequest } from "./handler.ts";

Deno.serve((req: Request) =>
  handleRequest(req, {
    EOS_INTAKE_HMAC_SECRET: Deno.env.get("EOS_INTAKE_HMAC_SECRET"),
    INTAKE_ENABLED: Deno.env.get("INTAKE_ENABLED"),
  }),
);
