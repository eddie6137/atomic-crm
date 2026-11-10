import { SIGNATURE_HEADER, TIMESTAMP_HEADER, sign } from "./hmac";

export { sign };

export interface Env {
  EOS_INTAKE_HMAC_SECRET?: string;
  INGEST_ADDRESS?: string;
  INTAKE_EDGE_URL?: string;
  INTAKE_ENABLED?: string;
}

export interface MinimizedPayload {
  from: string;
  to: string;
  subject: string;
  message_id: string | null;
  received_at: string;
}

interface EmailLike {
  from: string;
  to: string;
  headers: { get(name: string): string | null };
  setReject(reason: string): void;
}

export function isIngestRecipient(to: string, ingestAddress?: string) {
  return !!ingestAddress && to === ingestAddress;
}

export function shouldDropForKillSwitch(env: Pick<Env, "INTAKE_ENABLED">) {
  return env.INTAKE_ENABLED !== "1";
}

export function buildPayload(
  message: Pick<EmailLike, "from" | "to" | "headers">,
  now: Date = new Date(),
): MinimizedPayload {
  return {
    from: message.from,
    to: message.to,
    subject: message.headers.get("subject") ?? "",
    message_id: message.headers.get("message-id"),
    received_at: now.toISOString(),
  };
}

export async function postSigned(
  payload: MinimizedPayload,
  env: Env,
  fetchImpl: typeof fetch = fetch,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<Response> {
  if (!env.EOS_INTAKE_HMAC_SECRET || !env.INTAKE_EDGE_URL) {
    throw new Error("worker not configured");
  }
  const rawBody = JSON.stringify(payload);
  const timestamp = String(nowSeconds);
  const signature = await sign(env.EOS_INTAKE_HMAC_SECRET, timestamp, rawBody);
  return fetchImpl(env.INTAKE_EDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [SIGNATURE_HEADER]: signature,
      [TIMESTAMP_HEADER]: timestamp,
    },
    body: rawBody,
  });
}

export async function handleEmail(
  message: EmailLike,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!isIngestRecipient(message.to, env.INGEST_ADDRESS)) {
    message.setReject("Unknown recipient");
    return;
  }
  if (shouldDropForKillSwitch(env)) return; // ack and drop
  const res = await postSigned(buildPayload(message), env, fetchImpl);
  if (!res.ok) throw new Error(`edge responded ${res.status}`);
}

export default {
  async email(message: EmailLike, env: Env, _ctx?: unknown) {
    await handleEmail(message, env);
  },
  async fetch(_request: Request, _env: Env) {
    return new Response("Not found", { status: 404 });
  },
};
