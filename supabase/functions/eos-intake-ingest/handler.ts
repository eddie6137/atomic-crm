import { verify } from "./hmac.ts";

export interface IngestEnv {
  EOS_INTAKE_HMAC_SECRET?: string;
  INTAKE_ENABLED?: string;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function handleRequest(
  req: Request,
  env: IngestEnv,
  nowSeconds?: number,
): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const rawBody = await req.text();
  const ok = await verify({
    secret: env.EOS_INTAKE_HMAC_SECRET,
    signature: req.headers.get("X-Eos-Intake-Signature"),
    timestamp: req.headers.get("X-Eos-Intake-Timestamp"),
    rawBody,
    nowSeconds,
  });
  if (!ok) return json({ error: "unauthorized" }, 401);

  if (env.INTAKE_ENABLED !== "1") {
    return json({ accepted: false, reason: "intake_disabled" }, 200);
  }

  // Structural check only. P2 prep: no database writes, no storage, no OpenAI.
  try {
    const p = JSON.parse(rawBody);
    const strings = ["from", "to", "subject", "received_at"];
    const valid =
      strings.every((k) => typeof p?.[k] === "string") &&
      (p.message_id === null || typeof p.message_id === "string");
    if (!valid) return json({ error: "invalid_payload" }, 400);
  } catch {
    return json({ error: "invalid_payload" }, 400);
  }
  return json({ accepted: true }, 200);
}
