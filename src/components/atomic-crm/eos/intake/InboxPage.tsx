import { useState } from "react";
import { useGetList, useNotify, usePermissions, useRefresh } from "ra-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSupabaseClient } from "../../providers/supabase/supabase";
import { EosNav } from "../EosNav";
import { addDays, todayPT } from "../constants";
import { fixtureIntake } from "./fixtureIntake";
import { isIntakeUiEnabled } from "./intake";
import {
  acceptActionBlocker,
  acceptFyiBlocker,
  type IntakeItem,
} from "./intake";

const STATUS_TABS: Record<string, string[]> = {
  open: ["raw", "triaged"],
  accepted: ["accepted"],
  rejected: ["rejected"],
};
const norm = (s?: string) => (s ?? "").trim().toLowerCase();
const selectCls =
  "border rounded min-h-11 md:min-h-9 px-2 bg-background w-full min-w-0";

/** Inbox of intake items: Needs client flag, one-click Accept (Action / FYI) or Reject. */
export const InboxPage = () => {
  const notify = useNotify();
  const refresh = useRefresh();
  const { permissions } = usePermissions();
  const [tab, setTab] = useState("open");
  const { data: items = [], isPending } = useGetList("eos_intake_items", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "created_at", order: "DESC" },
    filter: {
      "archived_at@is": null,
      "triage_status@in": `(${STATUS_TABS[tab].join(",")})`,
    },
  });
  const { data: companies = [] } = useGetList("companies", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "name", order: "ASC" },
    filter: {},
  });
  const { data: sales = [] } = useGetList("sales", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "id", order: "ASC" },
    filter: { "disabled@neq": true },
  });

  const loadFixture = async () => {
    let failed = 0;
    for (const f of fixtureIntake) {
      const company = companies.find(
        (c: any) => norm(c.name) === norm(f.account),
      );
      const { error } = await getSupabaseClient().rpc(
        "eos_intake_insert_fixture_admin",
        {
          p_source_ref: f.source_ref,
          p_subject: f.subject,
          p_from_addr: f.from_addr,
          p_excerpt: f.excerpt,
          p_company_id: company?.id ?? null,
          p_needs_client: company ? false : true,
          p_suggested_title: f.suggested_title ?? null,
          p_suggested_due_date:
            f.suggested_due_offset_days != null
              ? addDays(todayPT(), f.suggested_due_offset_days)
              : null,
          p_triage_label: f.triage_label ?? null,
        },
      );
      if (error) failed++;
    }
    notify(
      failed ? `Fixture intake: ${failed} failed` : "Fixture intake loaded",
      { type: failed ? "error" : "success" },
    );
    refresh();
  };

  return (
    <div className="flex flex-col gap-3 p-2 min-w-0">
      <EosNav />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Inbox</h2>
        {isIntakeUiEnabled() && permissions === "admin" ? (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 md:min-h-8"
            onClick={loadFixture}
            data-testid="inbox-load-fixture"
          >
            Load fixture items (stub)
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Live email/Slack/Fireflies capture is OFF. Nothing here counts as a
        client action until you accept it.
      </p>
      <div className="flex gap-2">
        {Object.keys(STATUS_TABS).map((s) => (
          <Button
            key={s}
            size="sm"
            className="min-h-11 md:min-h-8"
            variant={s === tab ? "default" : "outline"}
            onClick={() => setTab(s)}
          >
            {s}
          </Button>
        ))}
      </div>
      {isPending && <p>Loading…</p>}
      <div className="flex flex-col gap-2" data-testid="inbox-items">
        {(items as IntakeItem[]).map((it) => (
          <InboxCard
            key={it.id}
            item={it}
            companies={companies}
            sales={sales}
            onDone={refresh}
          />
        ))}
        {!isPending && !items.length && (
          <p className="text-sm text-muted-foreground">No {tab} items</p>
        )}
      </div>
    </div>
  );
};
InboxPage.path = "/inbox";

export const InboxCard = ({
  item,
  companies,
  sales,
  onDone,
}: {
  item: IntakeItem;
  companies: any[];
  sales: any[];
  onDone: () => void;
}) => {
  const notify = useNotify();
  const [title, setTitle] = useState(
    item.suggested_title ?? item.subject ?? "",
  );
  const [companyId, setCompanyId] = useState(
    item.company_id ? String(item.company_id) : "",
  );
  const [ownerId, setOwnerId] = useState(
    item.suggested_owner_sales_id ? String(item.suggested_owner_sales_id) : "",
  );
  const [due, setDue] = useState(item.suggested_due_date ?? "");
  const [busy, setBusy] = useState(false);
  const open = item.triage_status === "raw" || item.triage_status === "triaged";
  const cid = companyId ? Number(companyId) : null;
  const actionBlock = acceptActionBlocker(
    {
      title,
      company_id: cid,
      owner_sales_id: ownerId ? Number(ownerId) : null,
      due_date: due || null,
    },
    item.needs_client,
  );
  const fyiBlock = acceptFyiBlocker(
    cid,
    item.excerpt.slice(0, 2000),
    item.needs_client,
  );

  const call = async (
    fn: string,
    args: Record<string, unknown>,
    ok: string,
  ) => {
    setBusy(true);
    const { error } = await getSupabaseClient().rpc(fn, args);
    setBusy(false);
    if (error) return notify(error.message, { type: "error" });
    notify(ok);
    onDone();
  };
  const acceptAction = () =>
    call(
      "eos_intake_accept_action",
      {
        p_id: item.id,
        p_fields: {
          title,
          company_id: cid,
          owner_sales_id: ownerId ? Number(ownerId) : null,
          due_date: due || null,
        },
      },
      "Accepted as client action",
    );
  const acceptFyi = () =>
    call(
      "eos_intake_accept_fyi",
      { p_id: item.id, p_fields: { company_id: cid } },
      "Saved as account FYI",
    );
  const reject = () => call("eos_intake_reject", { p_id: item.id }, "Rejected");

  const btn = "min-h-11 md:min-h-8";
  return (
    <Card data-testid="inbox-item">
      <CardContent className="flex flex-col gap-2 pt-4 text-sm min-w-0">
        <div className="flex flex-wrap gap-1 items-center">
          <Badge>{item.source}</Badge>
          {item.triage_label && (
            <Badge variant="outline">{item.triage_label}</Badge>
          )}
          <Badge variant="secondary">{item.triage_status}</Badge>
          {item.needs_client && !item.company_id && open && (
            <Badge variant="destructive" data-testid="inbox-needs-client">
              Needs client
            </Badge>
          )}
          {item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-xs break-all"
            >
              source
            </a>
          )}
        </div>
        {item.subject && (
          <p className="font-medium break-words">{item.subject}</p>
        )}
        {item.from_addr && (
          <p className="text-xs text-muted-foreground break-all">
            {item.from_addr}
          </p>
        )}
        <blockquote className="border-l-2 pl-2 italic break-words">
          “{item.excerpt}”
        </blockquote>
        {open ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              Title
              <Input
                className="min-h-11 md:min-h-9"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              Account
              <select
                className={selectCls}
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
                className={selectCls}
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
            <label className="flex flex-col gap-1">
              Due
              <Input
                type="date"
                className="min-h-11 md:min-h-9"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2 items-center">
              <Button
                className={btn}
                onClick={acceptAction}
                disabled={busy || actionBlock != null}
                title={actionBlock ?? undefined}
                data-testid="inbox-accept-action"
              >
                Accept Action
              </Button>
              <Button
                variant="outline"
                className={btn}
                onClick={acceptFyi}
                disabled={busy || fyiBlock != null}
                title={fyiBlock ?? undefined}
                data-testid="inbox-accept-fyi"
              >
                Accept FYI
              </Button>
              <Button
                variant="outline"
                className={btn}
                onClick={reject}
                disabled={busy}
                data-testid="inbox-reject"
              >
                Reject
              </Button>
              {actionBlock && (
                <span
                  className="text-xs text-red-600"
                  data-testid="inbox-blocker"
                >
                  {actionBlock}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {item.triage_status}{" "}
            {item.decided_at?.slice(0, 16).replace("T", " ")} UTC
          </div>
        )}
      </CardContent>
    </Card>
  );
};
