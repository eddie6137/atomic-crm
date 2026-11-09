import { useGetList } from "ra-core";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EosNav } from "./EosNav";
import { blockedActionsLink, drilldownLink } from "./clientActions";
import { blockedCountLabel, usePortfolioBlocked } from "./usePortfolioBlocked";
import { ContractsDueBlock } from "./EosContracts";
import {
  idsFilter,
  ScopeTabs,
  useRelationshipScope,
} from "./useRelationshipScope";

/** Portfolio dashboard: per-account health + signals, scoped by relationship (default Clients). */
export const EosHome = () => {
  const { scope, setScope, ids, isPending: cPending } = useRelationshipScope();
  const { data, isPending, error } = useGetList(
    "eos_account_summary",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "name", order: "ASC" },
      filter: { "id@in": idsFilter(ids) },
    },
    { enabled: !cPending },
  );
  const rows = [...(data ?? [])].sort(
    (a: any, b: any) => health(b) - health(a),
  );
  return (
    <div className="flex flex-col gap-2 p-2 min-w-0">
      <EosNav />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">EOS · Portfolio</h2>
        <ScopeTabs scope={scope} setScope={setScope} />
        <ContractsDueBlock />
      </div>
      <p className="text-sm text-muted-foreground">
        Accounts sorted by risk. Every count links to its filtered list.
      </p>
      {(isPending || cPending) && <p>Loading…</p>}
      {error && <p className="text-red-600">Could not load summary</p>}
      {!isPending && !cPending && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No accounts in this scope.
        </p>
      )}
      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="eos-accounts"
      >
        {rows.map((a: any) => (
          <Card key={a.id} data-testid="eos-portfolio-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <Link
                  to={`/companies/${a.id}/show/eos`}
                  className="break-words"
                >
                  {a.name}
                </Link>
                <HealthDot score={health(a)} />
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <AccountSignals a={a} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
/** Risk score: red-flag signals weigh most. */
export const health = (a: any) =>
  3 * (a.overdue_commitments ?? 0) +
  3 * (a.off_track_rocks ?? 0) +
  2 * (a.deliverables_due_7d ?? 0) +
  2 * (a.stale_projects ?? 0) +
  (a.open_issues ?? 0) +
  (a.missing_owner_or_date ?? 0);
const HealthDot = ({ score }: { score: number }) => {
  const [cls, label] =
    score >= 6
      ? ["bg-red-500", "At risk"]
      : score >= 1
        ? ["bg-amber-400", "Watch"]
        : ["bg-green-500", "Healthy"];
  return (
    <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground shrink-0">
      <span className={`inline-block size-2.5 rounded-full ${cls}`} />
      {label}
    </span>
  );
};
EosHome.path = "/eos";

const OPEN_C = "(open,in_progress,blocked,ambiguous)";

/** Per-account "nothing dropped" signals (spec §3 defaults). Every count drills into its list. */
export const AccountSignals = ({ a }: { a: any }) => {
  const today = todayStr();
  // U3: blocked per account from one shared capped query (no summary column).
  const blocked = usePortfolioBlocked();
  const nBlocked = blocked.countFor(a.id);
  const in7 = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date(Date.now() + 7 * 864e5));
  return (
    <>
      <Stat
        to={drilldownLink("overdue", a.id)}
        label="Overdue commitments"
        n={a.overdue_commitments}
        warn
        testId="signal-overdue"
      />
      <Stat
        to={blockedActionsLink(a.id)}
        label="Blocked commitments"
        n={nBlocked}
        display={
          blocked.isPending
            ? "…"
            : blocked.error
              ? "?"
              : blockedCountLabel(nBlocked, !blocked.exactFor(a.id))
        }
        warn
        testId="signal-blocked"
      />
      <Stat
        to={`/eos_issues?filter=${enc({ company_id: a.id, "status@in": "(open,ids)" })}`}
        label="Open issues"
        n={a.open_issues}
        warn
      />
      <Stat
        to={`/eos_deliverables?filter=${enc({ company_id: a.id, "status@in": "(planned,in_progress,ready)", "due_date@gte": today, "due_date@lte": in7 })}`}
        label="Deliverables due 7d"
        n={a.deliverables_due_7d}
        warn
      />
      <Stat
        to={`/eos_projects?filter=${enc({ company_id: a.id, status: "active", "last_activity_at@lt": new Date(Date.now() - 14 * 864e5).toISOString() })}`}
        label="Stale projects (14d)"
        n={a.stale_projects}
        warn
      />
      <Stat
        to={`/eos_rocks?filter=${enc({ company_id: a.id, status: "off_track" })}`}
        label="Rocks off-track"
        n={a.off_track_rocks}
        warn
      />
      <Stat
        to={drilldownLink("all", a.id)}
        label="Open commitments"
        n={a.open_commitments}
        testId="signal-open"
      />
      <Stat
        to={`/eos_projects?filter=${enc({ company_id: a.id })}`}
        label="Open projects"
        n={a.open_projects}
      />
      <Stat
        to={`/eos_commitments?filter=${enc({ company_id: a.id, "status@in": OPEN_C, "@or": { "owner_sales_id@is": null, "due_date@is": null } })}`}
        label="Missing owner/date"
        n={a.missing_owner_or_date}
        warn
      />
    </>
  );
};

const enc = (o: object) => encodeURIComponent(JSON.stringify(o));
const todayStr = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(
    new Date(),
  );

const Stat = ({
  to,
  label,
  n,
  warn,
  display,
  testId,
}: {
  to: string;
  label: string;
  n: number;
  warn?: boolean;
  display?: string;
  testId?: string;
}) => (
  <Link
    to={to}
    className="rounded border p-2 no-underline hover:bg-muted"
    data-testid={testId}
    data-count={testId ? String(n ?? 0) : undefined}
  >
    <div
      className={`text-2xl font-semibold ${warn && n > 0 ? "text-red-600" : ""}`}
    >
      {display ?? n}
    </div>
    <div className="text-muted-foreground">{label}</div>
  </Link>
);
