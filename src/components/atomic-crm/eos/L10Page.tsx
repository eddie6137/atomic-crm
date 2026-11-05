import { useGetList } from "ra-core";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addDays,
  COMMITMENT_OPEN,
  currentQuarter,
  inFilter,
  ISSUE_OPEN,
  todayPT,
} from "./constants";
import { EosNav } from "./EosNav";

const PRIO: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Weekly L10 support view (meeting day TBD; no meeting/reminder is created). */
export const L10Page = () => {
  const today = todayPT();
  const q = currentQuarter(today);
  const { data: issues = [] } = useGetList("eos_issues", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "created_at", order: "ASC" },
    filter: { "archived_at@is": null, "status@in": inFilter(ISSUE_OPEN) },
  });
  const { data: todos = [] } = useGetList("eos_commitments", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "due_date", order: "ASC" },
    filter: {
      "archived_at@is": null,
      "status@in": inFilter(COMMITMENT_OPEN),
      "due_date@lte": addDays(today, 7),
    },
  });
  const { data: rocks = [] } = useGetList("eos_rocks", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "status", order: "DESC" },
    filter: { "archived_at@is": null, quarter: q },
  });
  const { data: companies = [] } = useGetList("companies", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "name", order: "ASC" },
    filter: {},
  });
  const cname = (id: any) =>
    companies.find((c: any) => c.id === id)?.name ?? "No account";
  const ids = [...issues].sort(
    (a: any, b: any) => (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9),
  );

  return (
    <div className="flex flex-col gap-3 p-2 min-w-0">
      <EosNav />
      <h2 className="text-xl font-semibold">EOS · L10 (weekly)</h2>
      <p className="text-xs text-muted-foreground">
        Meeting day TBD. Order: Scorecard → Rock review → To-dos → IDS.
      </p>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card data-testid="l10-rocks">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Rocks {q}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {rocks.map((r: any) => (
              <Link
                key={r.id}
                to={`/eos_rocks/${r.id}`}
                className="flex justify-between gap-2 no-underline text-foreground"
              >
                <span className="break-words">
                  {r.title}{" "}
                  <span className="text-muted-foreground">
                    · {cname(r.company_id)}
                  </span>
                </span>
                <Badge
                  variant={r.status === "off_track" ? "destructive" : "outline"}
                >
                  {r.status.replace("_", " ")}
                </Badge>
              </Link>
            ))}
            {!rocks.length && (
              <span className="text-muted-foreground">
                No rocks this quarter
              </span>
            )}
          </CardContent>
        </Card>
        <Card data-testid="l10-todos">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              To-do review (due ≤ 7d or overdue)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {todos.map((t: any) => (
              <Link
                key={t.id}
                to={`/eos_commitments/${t.id}`}
                className="flex justify-between gap-2 no-underline text-foreground"
              >
                <span className="break-words">
                  {t.title}{" "}
                  <span className="text-muted-foreground">
                    · {cname(t.company_id)}
                  </span>
                </span>
                <span
                  className={
                    t.due_date < today
                      ? "text-red-600 whitespace-nowrap"
                      : "whitespace-nowrap"
                  }
                >
                  {t.due_date}
                </span>
              </Link>
            ))}
            {!todos.length && (
              <span className="text-muted-foreground">Nothing due</span>
            )}
          </CardContent>
        </Card>
        <Card data-testid="l10-ids">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">IDS list ({ids.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {ids.map((i: any) => (
              <Link
                key={i.id}
                to={`/eos_issues/${i.id}`}
                className="flex justify-between gap-2 no-underline text-foreground"
              >
                <span className="break-words">
                  {i.title}{" "}
                  <span className="text-muted-foreground">
                    · {cname(i.company_id)}
                  </span>
                </span>
                <span className="flex gap-1">
                  {i.status === "ids" && <Badge>IDS</Badge>}
                  {i.priority && (
                    <Badge variant="secondary">{i.priority}</Badge>
                  )}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
      <Link to="/eos/scorecard" className="text-sm underline">
        Open Scorecard →
      </Link>
    </div>
  );
};
L10Page.path = "/eos/l10";
