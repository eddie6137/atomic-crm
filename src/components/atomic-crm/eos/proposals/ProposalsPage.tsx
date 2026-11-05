import { useState } from "react";
import { useDataProvider, useGetList, useNotify, useRefresh } from "ra-core";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSupabaseClient } from "../../providers/supabase/supabase";
import { EosNav } from "../EosNav";
import { fingerprintOf, fixtureProposals } from "./fixtureProposals";

const norm = (s?: string) => (s ?? "").trim().toLowerCase();

/** Bot proposes -> human confirms (spec §5). Confirm/Reject go through atomic, idempotent RPCs. */
export const ProposalsPage = () => {
  const dp = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [status, setStatus] = useState("pending");
  const { data: proposals = [], isPending } = useGetList("eos_proposals", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "created_at", order: "DESC" },
    filter: { status },
  });
  const { data: companies = [] } = useGetList("companies", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "name", order: "ASC" },
    filter: {},
  });
  const { data: sales = [] } = useGetList("sales", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "id", order: "ASC" },
    filter: {},
  });

  const loadFixture = async () => {
    let added = 0,
      dup = 0;
    for (const f of fixtureProposals) {
      const company = companies.find(
        (c: any) => norm(c.name) === norm(f.account),
      );
      const owner = sales.find(
        (s: any) => norm(`${s.first_name} ${s.last_name}`) === norm(f.owner),
      );
      const fingerprint = fingerprintOf(f);
      const existing = await dp.getList("eos_proposals", {
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
        filter: { fingerprint },
      });
      if (existing.total) {
        dup++;
        continue;
      }
      await dp.create("eos_proposals", {
        data: {
          source: f.source,
          source_ref: f.source_ref,
          source_url: f.source_url,
          excerpt: f.excerpt,
          target_table: f.target_table,
          confidence: f.confidence,
          extraction_version: "fixture-v1",
          fingerprint,
          payload: {
            title: f.title,
            company_id: company?.id ?? null,
            owner_sales_id: owner?.id ?? null,
            due_date: f.due_date ?? null,
            priority: f.priority ?? null,
            speaker: f.speaker ?? null,
            candidate_account_text: f.account ?? null,
            candidate_owner_text: f.owner ?? null,
            ...(f.target_table === "eos_commitments"
              ? { is_verbatim: true }
              : {}),
          },
        },
      });
      added++;
    }
    notify(`Fixture proposals: ${added} added, ${dup} duplicates skipped`);
    refresh();
  };

  return (
    <div className="flex flex-col gap-3 p-2 min-w-0">
      <EosNav />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">
          EOS · Proposals (bot → human confirm)
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={loadFixture}
          data-testid="eos-load-proposals"
        >
          Load fixture proposals (stub)
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Live Slack/Fireflies ingestion is OFF (needs CTO OK). Proposals never
        count as confirmed work.
      </p>
      <div className="flex gap-2">
        {["pending", "confirmed", "rejected"].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === status ? "default" : "outline"}
            onClick={() => setStatus(s)}
          >
            {s}
          </Button>
        ))}
      </div>
      {isPending && <p>Loading…</p>}
      <div className="flex flex-col gap-2" data-testid="eos-proposals">
        {proposals.map((p: any) => (
          <ProposalCard
            key={p.id}
            p={p}
            companies={companies}
            sales={sales}
            onDone={refresh}
          />
        ))}
        {!isPending && !proposals.length && (
          <p className="text-sm text-muted-foreground">No {status} proposals</p>
        )}
      </div>
    </div>
  );
};
ProposalsPage.path = "/eos/proposals";

const ProposalCard = ({
  p,
  companies,
  sales,
  onDone,
}: {
  p: any;
  companies: any[];
  sales: any[];
  onDone: () => void;
}) => {
  const notify = useNotify();
  const [title, setTitle] = useState(p.payload?.title ?? "");
  const [companyId, setCompanyId] = useState<string>(
    p.payload?.company_id ? String(p.payload.company_id) : "",
  );
  const [ownerId, setOwnerId] = useState<string>(
    p.payload?.owner_sales_id ? String(p.payload.owner_sales_id) : "",
  );
  const [due, setDue] = useState<string>(p.payload?.due_date ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = p.status === "pending";

  const confirm = async () => {
    setBusy(true);
    const { data, error } = await getSupabaseClient().rpc(
      "eos_confirm_proposal",
      {
        p_id: p.id,
        p_fields: {
          title,
          company_id: companyId ? Number(companyId) : null,
          owner_sales_id: ownerId ? Number(ownerId) : null,
          due_date: due || null,
        },
      },
    );
    setBusy(false);
    if (error) return notify(error.message, { type: "error" });
    notify(
      `Confirmed → ${p.target_table === "eos_issues" ? "issue" : "commitment"} ${String(data).slice(0, 8)}`,
    );
    onDone();
  };
  const reject = async () => {
    setBusy(true);
    const { error } = await getSupabaseClient().rpc("eos_reject_proposal", {
      p_id: p.id,
      p_reason: reason,
    });
    setBusy(false);
    if (error) return notify(error.message, { type: "error" });
    notify("Rejected");
    onDone();
  };

  return (
    <Card data-testid="eos-proposal">
      <CardContent className="flex flex-col gap-2 pt-4 text-sm min-w-0">
        <div className="flex flex-wrap gap-1 items-center">
          <Badge>{p.source}</Badge>
          <Badge variant="outline">
            {p.target_table === "eos_issues" ? "Issue" : "Commitment"}
          </Badge>
          {p.confidence != null && (
            <Badge variant="secondary">
              conf {Math.round(p.confidence * 100)}%
            </Badge>
          )}
          {p.source_url && (
            <a
              href={p.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-xs break-all"
            >
              source
            </a>
          )}
        </div>
        <blockquote className="border-l-2 pl-2 italic break-words">
          “{p.excerpt}”
        </blockquote>
        {pending ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              Title
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              Account{" "}
              {p.payload?.candidate_account_text && !companyId && (
                <span className="text-red-600 text-xs">
                  “{p.payload.candidate_account_text}” not matched
                </span>
              )}
              <select
                className="border rounded h-9 px-2 bg-background"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                aria-label="Account"
              >
                <option value="">— choose —</option>
                {companies.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Owner
              <select
                className="border rounded h-9 px-2 bg-background"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                aria-label="Owner"
              >
                <option value="">— none —</option>
                {sales.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name}
                  </option>
                ))}
              </select>
            </label>
            {p.target_table === "eos_commitments" && (
              <label className="flex flex-col gap-1">
                Due
                <Input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
            )}
            <div className="flex flex-wrap gap-2 sm:col-span-2 items-end">
              <Button
                onClick={confirm}
                disabled={busy || !companyId || !title}
                data-testid="eos-confirm"
              >
                Confirm
              </Button>
              <Input
                className="max-w-xs"
                placeholder="Reject reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={reject}
                disabled={busy || !reason.trim()}
                data-testid="eos-reject"
              >
                Reject
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {p.status} {p.decided_at?.slice(0, 16).replace("T", " ")} UTC
            {p.reject_reason && ` · reason: ${p.reject_reason}`}
            {p.confirmed_record_id && (
              <>
                {" "}
                ·{" "}
                <Link
                  to={`/${p.target_table}/${p.confirmed_record_id}`}
                  className="underline"
                >
                  open record
                </Link>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
