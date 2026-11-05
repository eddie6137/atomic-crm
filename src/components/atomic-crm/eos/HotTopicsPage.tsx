import { useGetList } from "ra-core";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addDays,
  COMMITMENT_OPEN,
  DELIVERABLE_OPEN,
  inFilter,
  ISSUE_OPEN,
} from "./constants";
import { EosNav } from "./EosNav";
import {
  idsFilter,
  ScopeTabs,
  useRelationshipScope,
} from "./useRelationshipScope";

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(
    new Date(),
  );

type Section = {
  key: string;
  title: string;
  resource: string;
  filter: Record<string, unknown>;
  sort: string;
  detail: (r: any) => string;
};

/** Hot Topics: the cross-account "what's burning" list for the scoped accounts (default Clients). */
export const HotTopicsPage = () => {
  const { scope, setScope, companies, ids, isPending } = useRelationshipScope();
  const names = new Map(companies.map((c: any) => [c.id, c.name]));
  const t = today();
  const sections: Section[] = [
    {
      key: "overdue",
      title: "Overdue commitments",
      resource: "eos_commitments",
      filter: { "status@in": inFilter(COMMITMENT_OPEN), "due_date@lt": t },
      sort: "due_date",
      detail: (r) => `due ${r.due_date}`,
    },
    {
      key: "offtrack",
      title: "Rocks off-track",
      resource: "eos_rocks",
      filter: { status: "off_track" },
      sort: "quarter",
      detail: (r) => r.quarter,
    },
    {
      key: "issues",
      title: "High-priority open issues",
      resource: "eos_issues",
      filter: { "status@in": inFilter(ISSUE_OPEN), priority: "high" },
      sort: "created_at",
      detail: (r) => r.status,
    },
    {
      key: "due7",
      title: "Deliverables due in 7 days",
      resource: "eos_deliverables",
      filter: {
        "status@in": inFilter(DELIVERABLE_OPEN),
        "due_date@lte": addDays(t, 7),
      },
      sort: "due_date",
      detail: (r) => `due ${r.due_date}`,
    },
    {
      key: "stale",
      title: "Stale projects (no activity 14d)",
      resource: "eos_projects",
      filter: {
        status: "active",
        "last_activity_at@lt": new Date(Date.now() - 14 * 864e5).toISOString(),
      },
      sort: "last_activity_at",
      detail: (r) => `last ${String(r.last_activity_at).slice(0, 10)}`,
    },
  ];
  return (
    <div className="flex flex-col gap-2 p-2 min-w-0">
      <EosNav />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">EOS · Hot Topics</h2>
        <ScopeTabs scope={scope} setScope={setScope} />
      </div>
      {isPending ? (
        <p>Loading…</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2" data-testid="eos-hot-topics">
          {sections.map((s) => (
            <HotSection key={s.key} s={s} ids={ids} names={names} />
          ))}
        </div>
      )}
    </div>
  );
};
HotTopicsPage.path = "/eos/hot-topics";

const HotSection = ({
  s,
  ids,
  names,
}: {
  s: Section;
  ids: any[];
  names: Map<any, string>;
}) => {
  const { data, total } = useGetList(s.resource, {
    pagination: { page: 1, perPage: 25 },
    sort: { field: s.sort, order: "ASC" },
    filter: {
      ...s.filter,
      "archived_at@is": null,
      "company_id@in": idsFilter(ids),
    },
  });
  return (
    <Card data-testid={`hot-${s.key}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex justify-between">
          {s.title}
          <Badge variant={total ? "destructive" : "outline"}>
            {total ?? 0}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!data?.length ? (
          <p className="text-sm text-muted-foreground">Nothing here 🎉</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {data.map((r: any) => (
              <li key={r.id} className="flex justify-between gap-2 min-w-0">
                <Link
                  to={`/${s.resource}/${r.id}`}
                  className="break-words min-w-0"
                >
                  {r.title}
                  <span className="text-muted-foreground">
                    {" "}
                    · {names.get(r.company_id) ?? "—"}
                  </span>
                </Link>
                <span className="text-muted-foreground shrink-0">
                  {s.detail(r)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
