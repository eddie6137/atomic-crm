// DB-level proof of eos_aom_link_apply and the link guards against a LOCAL SCRATCH Postgres
// (database must be named atomic_aom_link_test). Skipped unless ATOMIC_AOM_LINK_TEST_DATABASE_URL is set;
// never point it at a Supabase project. The URL is passed to psql only and never printed.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { handleRequest } from "./handler.ts";
import { sign } from "./hmac.ts";

const URL_ = process.env.ATOMIC_AOM_LINK_TEST_DATABASE_URL;
const root = path.resolve(__dirname, "../../..");

function psql(args: string[]): { ok: boolean; out: string; err: string } {
  try {
    const out = execFileSync(
      "psql",
      [URL_!, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-At", ...args],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return { ok: true, out: out.trim(), err: "" };
  } catch (e: any) {
    return {
      ok: false,
      out: String(e.stdout ?? ""),
      err: String(e.stderr ?? ""),
    };
  }
}
const ADMIN = randomUUID();
const MEMBER = randomUUID();
/** One transaction as role/user; returns output of the LAST statement. */
function run(sql: string, o: { role?: string; uid?: string } = {}) {
  const pre = [
    "begin;",
    o.role ? `set local role ${o.role};` : "",
    o.uid ? `select set_config('request.jwt.claim.sub','${o.uid}',true);` : "",
    o.role
      ? `select set_config('request.jwt.claim.role','${o.role}',true);`
      : "",
  ].join("\n");
  return psql(["-c", `${pre}\n${sql}\ncommit;`]);
}
const q = (sql: string, o: { role?: string; uid?: string } = {}) => {
  const r = run(sql, o);
  if (!r.ok) throw new Error(r.err);
  return r.out.split("\n").filter(Boolean).pop() ?? "";
};
function event(over: Record<string, unknown> = {}) {
  const id = (over.commitment_id as string) ?? randomUUID();
  const base: any = {
    schema: 1,
    event_type: "upsert",
    namespace: "aom",
    kind: "assignment",
    commitment_id: id,
    source_key: `assignment:${id}`,
    aom_client_id: CLIENT,
    aom_revision: "2026-11-10T12:00:00.000001Z",
    title: "[SYNTHETIC-SEED] Acme Brand action",
    aom_status: "planned",
    deep_link_path: `/playbooks/assign?assignment=${id}`,
    completed_at: null,
    ...over,
  };
  if (over.kind && !over.source_key) base.source_key = `${over.kind}:${id}`;
  base.delivery = `aom:${base.source_key}:${base.event_type}:${base.aom_revision}`;
  return base;
}
const apply = (e: any, o: { role?: string } = { role: "service_role" }) =>
  JSON.parse(
    q(
      `select public.eos_aom_link_apply('${e.delivery}', $j$${JSON.stringify(e)}$j$::jsonb);`,
      o,
    ),
  );
const row = (id: string) =>
  q(
    `select coalesce(row_to_json(t)::text,'') from (select status,status_reason,company_id,needs_review,revision,title,archived_at is not null as archived from public.eos_commitments where id='${id}') t;`,
  );
const jrow = (id: string) => JSON.parse(row(id));
const count = (t: string, where = "true") =>
  Number(q(`select count(*) from public.${t} where ${where};`));
const CLIENT = randomUUID();
let COMPANY: number;

describe.skipIf(!URL_)("eos_aom_link_apply (scratch DB)", () => {
  beforeAll(() => {
    expect(psql(["-c", "select current_database();"]).out).toBe(
      "atomic_aom_link_test",
    ); // safety interlock
    for (const f of [
      "supabase/tests/aom_link_harness_stub.sql",
      "supabase/schemas/09_eos.sql",
      "supabase/schemas/10_eos_v1b.sql",
      "supabase/schemas/11_eos_v1b_projects_milestones.sql",
      "supabase/migrations/20261110120000_aom_atomic_link.sql",
    ]) {
      const r = psql(["-f", path.join(root, f)]);
      if (!r.ok) throw new Error(`${f}: ${r.err}`);
    }
    q(`insert into public.companies(name) values ('[SYNTHETIC-SEED] Acme Company');
       insert into public.sales(email, administrator, user_id) values
         ('admin@example.com', true, '${ADMIN}'), ('member@example.com', false, '${MEMBER}');`);
    COMPANY = Number(q(`select id from public.companies limit 1;`));
  });

  it("only service_role can execute the RPC", () => {
    const e = event();
    for (const role of ["authenticated", "anon"]) {
      expect(
        run(`select public.eos_aom_link_apply('${e.delivery}', '{}'::jsonb);`, {
          role,
          uid: MEMBER,
        }).ok,
      ).toBe(false);
    }
  });

  it("unmapped: holding row (needs_review, ambiguous, null company) + map row; nothing guessed; not recorded as delivered", () => {
    const e = event();
    expect(apply(e).result).toBe("unmapped");
    expect(jrow(e.commitment_id)).toMatchObject({
      status: "ambiguous",
      needs_review: true,
      company_id: null,
    });
    expect(
      count(
        "eos_action_source_map",
        `commitment_id='${e.commitment_id}' and namespace='aom'`,
      ),
    ).toBe(1);
    expect(
      count("eos_aom_link_deliveries", `delivery_id='${e.delivery}'`),
    ).toBe(0);
    expect(count("eos_aom_client_map")).toBe(0); // ingress never writes the client map
    const rev = jrow(e.commitment_id).revision;
    expect(apply(e).result).toBe("unmapped"); // repeat = idempotent upsert, no revision churn
    expect(jrow(e.commitment_id).revision).toBe(rev);
    expect(count("eos_commitments", `id='${e.commitment_id}'`)).toBe(1);
  });

  describe("client map is admin-only with no service_role / postgres-style bypass", () => {
    const ins = `insert into public.eos_aom_client_map(aom_client_id, company_id) values ('${CLIENT}', ${"%C"});`;
    it("rejects member, service_role, anon and a no-claims superuser session", () => {
      const s = ins.replace("%C", String(COMPANY));
      expect(run(s, { role: "authenticated", uid: MEMBER }).ok).toBe(false);
      expect(run(s, { role: "service_role" }).ok).toBe(false);
      expect(run(s, { role: "service_role", uid: ADMIN }).ok).toBe(true); // an admin identity is what counts, not the role
      q(`delete from public.eos_aom_client_map;`, {
        role: "authenticated",
        uid: ADMIN,
      });
      expect(run(s).ok).toBe(false); // superuser session without is_admin()
      expect(count("eos_aom_client_map")).toBe(0);
    });
  });

  it("admin maps; retry of the SAME delivery id upgrades the holding row to ordinary work", () => {
    const e = event({ aom_status: "in_progress" });
    expect(apply(e).result).toBe("unmapped");
    q(
      `insert into public.eos_aom_client_map(aom_client_id, company_id) values ('${CLIENT}', ${COMPANY});`,
      { role: "authenticated", uid: ADMIN },
    );
    expect(apply(e).result).toBe("updated");
    expect(jrow(e.commitment_id)).toMatchObject({
      status: "in_progress",
      company_id: COMPANY,
      needs_review: false,
    });
    expect(count("eos_commitments", `id='${e.commitment_id}'`)).toBe(1);
  });

  it("client map: aom_client_id and company_id are each unique", () => {
    q(
      `insert into public.companies(name) values ('[SYNTHETIC-SEED] Other Company');`,
    );
    const other = Number(q(`select max(id) from public.companies;`));
    expect(
      run(
        `insert into public.eos_aom_client_map(aom_client_id, company_id) values ('${randomUUID()}', ${COMPANY});`,
        { role: "authenticated", uid: ADMIN },
      ).ok,
    ).toBe(false);
    expect(
      run(
        `insert into public.eos_aom_client_map(aom_client_id, company_id) values ('${CLIENT}', ${other});`,
        { role: "authenticated", uid: ADMIN },
      ).ok,
    ).toBe(false);
  });

  it("create → one commitment with id = AOM uuid; replay is a no-op (revision unchanged); newer updates in place; stale ignored", () => {
    const e = event();
    expect(apply(e)).toMatchObject({
      result: "created",
      commitment_id: e.commitment_id,
    });
    const first = jrow(e.commitment_id);
    expect(first).toMatchObject({
      status: "open",
      status_reason: null,
      company_id: COMPANY,
      needs_review: false,
      revision: 1,
    });
    const again = apply(e);
    expect(again).toMatchObject({
      result: "replay",
      original_result: "created",
    });
    expect(jrow(e.commitment_id).revision).toBe(1);

    const e2 = event({
      commitment_id: e.commitment_id,
      aom_revision: "2026-11-10T12:05:00.000000Z",
      aom_status: "in_progress",
    });
    expect(apply(e2).result).toBe("updated");
    expect(jrow(e.commitment_id)).toMatchObject({
      status: "in_progress",
      revision: 2,
    });
    expect(count("eos_commitments", `id='${e.commitment_id}'`)).toBe(1);

    const old = event({
      commitment_id: e.commitment_id,
      aom_revision: "2026-11-10T12:01:00.000000Z",
      aom_status: "completed",
    });
    expect(apply(old).result).toBe("stale");
    expect(jrow(e.commitment_id)).toMatchObject({
      status: "in_progress",
      revision: 2,
    });

    const e3 = event({
      commitment_id: e.commitment_id,
      aom_revision: "2026-11-10T12:06:00.000000Z",
      aom_status: "in_progress",
    });
    expect(apply(e3).result).toBe("unchanged"); // same content, newer revision: no UPDATE, no revision bump
    expect(jrow(e.commitment_id).revision).toBe(2);
  });

  it("skipped → cancelled + status_reason skipped; archive event sets archived_at", () => {
    const e = event({ aom_status: "skipped" });
    apply(e);
    expect(jrow(e.commitment_id)).toMatchObject({
      status: "cancelled",
      status_reason: "skipped",
    });
    const a = event({
      commitment_id: e.commitment_id,
      event_type: "archive",
      aom_status: "skipped",
      aom_revision: "2026-11-10T13:00:00.000000Z",
    });
    expect(apply(a).result).toBe("updated");
    expect(jrow(e.commitment_id).archived).toBe(true);
  });

  it("ordinary writes cannot change status / company / title / blocker on an AOM row (even forging the marker)", () => {
    const e = event();
    apply(e);
    const id = e.commitment_id;
    for (const o of [
      { role: "authenticated", uid: MEMBER },
      { role: "authenticated", uid: ADMIN },
      { role: "service_role" },
    ]) {
      for (const set of [
        "status='blocked'",
        "status='completed'",
        "company_id=null, needs_review=true",
        "title='x'",
        "blocker='b'",
        "status_reason='skipped'",
      ]) {
        expect(
          run(`update public.eos_commitments set ${set} where id='${id}';`, o)
            .ok,
          `${o.role} ${set}`,
        ).toBe(false);
      }
    }
    expect(
      run(
        `select set_config('eos.aom_link_rpc','1',true); update public.eos_commitments set status='blocked' where id='${id}';`,
        { role: "authenticated", uid: MEMBER },
      ).ok,
    ).toBe(false);
    expect(jrow(id).status).toBe("open");
    expect(
      run(
        `update public.eos_commitments set priority='high' where id='${id}';`,
        { role: "authenticated", uid: MEMBER },
      ).ok,
    ).toBe(true);
    // direct writes to the source map are refused for every API role
    for (const role of ["authenticated", "service_role"]) {
      expect(
        run(
          `delete from public.eos_action_source_map where commitment_id='${id}';`,
          { role, uid: ADMIN },
        ).ok,
      ).toBe(false);
    }
  });

  it("fail closed on conflicts; nothing overwritten", () => {
    // UUID used by a plain (non-AOM) commitment, no map row
    const u1 = randomUUID();
    q(
      `insert into public.eos_commitments(id,title,status,needs_review) values ('${u1}','plain','open',true);`,
    );
    expect(apply(event({ commitment_id: u1 }))).toMatchObject({
      result: "conflict",
      reason: "uuid_without_map",
    });
    expect(jrow(u1).title).toBe("plain");
    // UUID mapped under another namespace
    const u2 = randomUUID();
    q(`select set_config('eos.aom_link_rpc','1',true);
       insert into public.eos_commitments(id,title,status,needs_review) values ('${u2}','other-ns','open',true);
       insert into public.eos_action_source_map(namespace,source_key,commitment_id,kind,aom_client_id,deep_link_path,last_aom_revision)
         values ('other','assignment:${u2}','${u2}','assignment','${CLIENT}','/x','r');`);
    expect(apply(event({ commitment_id: u2 }))).toMatchObject({
      result: "conflict",
      reason: "uuid_non_aom",
    });
    expect(jrow(u2).title).toBe("other-ns");
    // UUID mapped under a different AOM source key
    const e = event();
    apply(e);
    const swapped = event({ commitment_id: e.commitment_id, kind: "custom" });
    expect(apply(swapped)).toMatchObject({
      result: "conflict",
      reason: "map_key_mismatch",
    });
    expect(jrow(e.commitment_id).title).toBe(
      "[SYNTHETIC-SEED] Acme Brand action",
    );
    // malformed
    expect(apply({ ...e, aom_status: "blocked" }).reason).toBe("invalid_event");
  });

  it("flag off: signed request is rejected 403 and the md5 of commitments + map tables is unchanged", async () => {
    const md5 = () =>
      q(`select md5(
      coalesce((select string_agg(t::text, '|' order by t.id) from public.eos_commitments t), '') ||
      coalesce((select string_agg(t::text, '|' order by t.id) from public.eos_action_source_map t), '') ||
      coalesce((select string_agg(t::text, '|' order by t.aom_client_id) from public.eos_aom_client_map t), '') ||
      coalesce((select string_agg(t::text, '|' order by t.delivery_id) from public.eos_aom_link_deliveries t), ''));`);
    const before = md5();
    const secret = randomBytes(32).toString("hex");
    const e = event();
    const body = JSON.stringify({ ...e, delivery: undefined });
    const ts = String(Math.floor(Date.now() / 1000));
    const req = new Request("http://localhost/aom-link-ingest", {
      method: "POST",
      body,
      headers: {
        "X-Aom-Link-Timestamp": ts,
        "X-Aom-Link-Idempotency-Key": e.delivery,
        "X-Aom-Link-Audience": "aud",
        "X-Aom-Link-Signature": await sign(
          secret,
          "aom-to-atomic",
          ts,
          e.delivery,
          "aud",
          body,
        ),
      },
    });
    const res = await handleRequest(
      req,
      {
        ATOMIC_AOM_LINK_ENABLED: "false",
        ATOMIC_AOM_LINK_HMAC_SECRET: secret,
        ATOMIC_AOM_LINK_AUDIENCE: "aud",
      },
      {
        rpc: async (_fn, args) => ({
          data: apply({ ...e }),
          error: args && null,
        }),
      },
    );
    expect(res.status).toBe(403);
    expect(md5()).toBe(before);
  });
});
