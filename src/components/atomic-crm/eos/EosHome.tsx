import { useGetList } from "ra-core";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EosNav } from "./EosNav";

/** Minimal per-account counts strip (full v1b signals deferred). Reads invoker-rights view eos_account_summary. */
export const EosHome = () => {
  const { data, isPending, error } = useGetList("eos_account_summary", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "name", order: "ASC" },
  });
  return (
    <div className="flex flex-col gap-2 p-2">
      <EosNav />
      <h2 className="text-xl font-semibold">EOS · Account activity</h2>
      <p className="text-sm text-muted-foreground">
        v1a preview (staging, synthetic data). Counts link to filtered lists.
      </p>
      {isPending && <p>Loading…</p>}
      {error && <p className="text-red-600">Could not load summary</p>}
      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="eos-accounts"
      >
        {(data ?? []).map((a: any) => (
          <Card key={a.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{a.name}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <Stat
                to={`/eos_projects?filter=${enc({ company_id: a.id })}`}
                label="Open projects"
                n={a.open_projects}
              />
              <Stat
                to={`/eos_commitments?filter=${enc({ company_id: a.id, "status@in": "(open,in_progress,blocked,ambiguous)" })}`}
                label="Open commitments"
                n={a.open_commitments}
              />
              <Stat
                to={`/eos_commitments?filter=${enc({ company_id: a.id, "status@in": "(open,in_progress,blocked,ambiguous)", "due_date@lt": todayStr() })}`}
                label="Overdue commitments"
                n={a.overdue_commitments}
                warn
              />
              <Stat
                to={`/eos_issues?filter=${enc({ company_id: a.id, "status@in": "(open,ids)" })}`}
                label="Open issues"
                n={a.open_issues}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
EosHome.path = "/eos";

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
}: {
  to: string;
  label: string;
  n: number;
  warn?: boolean;
}) => (
  <Link to={to} className="rounded border p-2 no-underline hover:bg-muted">
    <div
      className={`text-2xl font-semibold ${warn && n > 0 ? "text-red-600" : ""}`}
    >
      {n}
    </div>
    <div className="text-muted-foreground">{label}</div>
  </Link>
);
