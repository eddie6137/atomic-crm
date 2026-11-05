import { useGetList, useGetOne } from "ra-core";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { AccountSignals } from "./EosHome";
import {
  COMMITMENT_OPEN,
  DELIVERABLE_OPEN,
  inFilter,
  ISSUE_OPEN,
} from "./constants";

/** EOS tab on the company page: signals + open items for this account. */
export const CompanyEosTab = ({
  companyId,
}: {
  companyId: number | string;
}) => {
  const { data: summary } = useGetOne(
    "eos_account_summary",
    { id: companyId },
    { retry: false },
  );
  const a = summary ?? {
    id: companyId,
    open_projects: 0,
    open_commitments: 0,
    overdue_commitments: 0,
    open_issues: 0,
    deliverables_due_7d: 0,
    stale_projects: 0,
    off_track_rocks: 0,
    missing_owner_or_date: 0,
  };
  const useQ = (resource: string, filter: object, sort = "created_at") =>
    useGetList(resource, {
      pagination: { page: 1, perPage: 50 },
      sort: { field: sort, order: "ASC" },
      filter: { company_id: companyId, "archived_at@is": null, ...filter },
    }).data ?? [];
  const sections = [
    {
      label: "Projects",
      resource: "eos_projects",
      rows: useQ(
        "eos_projects",
        { "status@in": "(planned,active,on_hold)" },
        "title",
      ),
    },
    {
      label: "Commitments",
      resource: "eos_commitments",
      rows: useQ(
        "eos_commitments",
        { "status@in": inFilter(COMMITMENT_OPEN) },
        "due_date",
      ),
    },
    {
      label: "Issues",
      resource: "eos_issues",
      rows: useQ("eos_issues", { "status@in": inFilter(ISSUE_OPEN) }),
    },
    {
      label: "Deliverables",
      resource: "eos_deliverables",
      rows: useQ(
        "eos_deliverables",
        { "status@in": inFilter(DELIVERABLE_OPEN) },
        "due_date",
      ),
    },
    {
      label: "Rocks",
      resource: "eos_rocks",
      rows: useQ("eos_rocks", { "status@in": "(on_track,off_track)" }),
    },
  ];
  return (
    <div
      className="flex flex-col gap-4 pt-2 min-w-0"
      data-testid="company-eos-tab"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <AccountSignals a={a} />
      </div>
      {sections.map((s) => (
        <div key={s.resource} className="min-w-0">
          <div className="flex justify-between items-center">
            <h6 className="font-semibold">
              {s.label} ({s.rows.length})
            </h6>
            <Link
              to={`/${s.resource}/create?source=${encodeURIComponent(JSON.stringify({ company_id: companyId }))}`}
              className="text-sm underline"
            >
              + New
            </Link>
          </div>
          <ul className="flex flex-col gap-1 mt-1 text-sm">
            {s.rows.map((r: any) => (
              <li key={r.id} className="flex justify-between gap-2 min-w-0">
                <Link to={`/${s.resource}/${r.id}`} className="break-words">
                  {r.title}
                </Link>
                <span className="flex gap-1 shrink-0">
                  {r.status && (
                    <Badge
                      variant={
                        r.status === "off_track" ? "destructive" : "outline"
                      }
                    >
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {r.due_date && (
                    <span className="text-muted-foreground">{r.due_date}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
