import { useAuthenticated } from "ra-core";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "../providers/supabase/supabase";

/**
 * Grok OS Web (Agents Team Audit · Org Chart · AI OS · Decisions Console).
 * The page HTML is NOT in public/ (that would be ungated). It lives in the
 * PRIVATE Supabase Storage bucket `grok-os` and is downloaded with the signed-in
 * user's session (RLS: authenticated read only), then rendered full-screen.
 * Built by amplify-agentic-os/tools/grok-os-web/build.mjs; uploaded by publish.mjs.
 */
export const GROK_OS_BUCKET = "grok-os";

export const GrokOsPage = () => {
  const { isPending } = useAuthenticated(); // redirects to /login when signed out
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPending) return;
    let cancelled = false;
    getSupabaseClient()
      .storage.from(GROK_OS_BUCKET)
      .download("index.html")
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error || !data) setError(error?.message ?? "Not published yet");
        else setHtml(await data.text());
      });
    return () => {
      cancelled = true;
    };
  }, [isPending]);

  if (isPending) return null;
  if (error)
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        Grok OS page unavailable: {error}. Ask HoD/CTO to run publish.mjs.
      </div>
    );
  if (!html) return <div style={{ padding: 24 }}>Loading…</div>;
  return (
    <iframe
      title="Amplify Grok OS"
      srcDoc={html}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: 0,
        background: "#0B0A1A",
      }}
    />
  );
};

GrokOsPage.path = "/grok-os";
