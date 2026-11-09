import { useGetList, useGetOne } from "ra-core";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { AccountSignals } from "./EosHome";
import {
  activeActionFilter,
  CLIENT_ACTION_TABS,
  clientActionsLink,
  sectionCount,
} from "./clientActions";
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
  const {
    data: summary,
    isPending: sPending,
    error: sError,
  } = useGetOne("eos_account_summary", { id: companyId }, { retry: false });
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
  const useQ = (resource: string, filter: object, sort = "created_at") => {
    const { data, total } = useGetList(resource, {
      pagination: { page: 1, perPage: SECTION_CAP },
      sort: { field: sort, order: "ASC" },
      filter: { company_id: companyId, "archived_at@is": null, ...filter },
    });
    return { rows: data ?? [], total };
  };
  const sections = [
    {
      label: "Projects",
      resource: "eos_projects",
      ...useQ(
        "eos_projects",
        { "status@in": "(planned,active,on_hold)" },
        "title",
      ),
    },
    {
      label: "Commitments",
      resource: "eos_commitments",
      ...useQ(
        "eos_commitments",
        { "status@in": inFilter(COMMITMENT_OPEN) },
        "due_date",
      ),
    },
    {
      label: "Issues",
      resource: "eos_issues",
      ...useQ("eos_issues", { "status@in": inFilter(ISSUE_OPEN) }),
    },
    {
      label: "Deliverables",
      resource: "eos_deliverables",
      ...useQ(
        "eos_deliverables",
        { "status@in": inFilter(DELIVERABLE_OPEN) },
        "due_date",
      ),
    },
    {
      label: "Rocks",
      resource: "eos_rocks",
      ...useQ("eos_rocks", { "status@in": "(on_track,off_track)" }),
    },
  ];
  return (
    <div
      className="flex flex-col gap-4 pt-2 min-w-0"
      data-testid="company-eos-tab"
    >
      <AccountActionsRollup
        companyId={companyId}
        a={a}
        isPending={sPending}
        error={!!sError}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <AccountSignals a={a} />
      </div>
      {sections.map((s) => (
        <div key={s.resource} className="min-w-0">
          <div className="flex justify-between items-center">
            <h6 className="font-semibold">
              {s.label} ({sectionCount(s.rows.length, s.total, SECTION_CAP)})
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
          {s.total != null && s.total > s.rows.length && (
            <Link
              to={
                s.resource === "eos_commitments"
                  ? `/eos_commitments?filter=${encodeURIComponent(JSON.stringify({ company_id: companyId, ...activeActionFilter() }))}`
                  : `/${s.resource}?filter=${encodeURIComponent(JSON.stringify({ company_id: companyId }))}`
              }
              className="text-sm underline mt-1 inline-block"
            >
              View all {s.total}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
};

const SECTION_CAP = 50;

/** Standalone rollup (mobile company page): same eos_account_summary getOne, shared query cache. */
export const CompanyActionsRollup = ({
  companyId,
}: {
  companyId: number | string;
}) => {
  const { data, isPending, error } = useGetOne(
    "eos_account_summary",
    { id: companyId },
    { retry: false },
  );
  return (
    <AccountActionsRollup
      companyId={companyId}
      a={data ?? {}}
      isPending={isPending}
      error={!!error}
    />
  );
};

/** Per-account Client Actions rollup. Counts come from eos_account_summary (authoritative); tabs drill into the hub. */
const AccountActionsRollup = ({
  companyId,
  a,
  isPending,
  error,
}: {
  companyId: number | string;
  a: any;
  isPending?: boolean;
  error?: boolean;
}) => (
  <div
    className="rounded-lg border p-3 flex flex-col gap-2 min-w-0"
    data-testid="company-client-actions"
  >
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h6 className="font-semibold">Client actions</h6>
      {isPending ? (
        <span
          className="text-sm text-muted-foreground"
          role="status"
          data-testid="company-client-actions-loading"
        >
          Loading…
        </span>
      ) : error ? (
        <span
          className="text-sm text-red-600"
          data-testid="company-client-actions-error"
        >
          Could not load counts
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">
          <b className="text-foreground">{a.open_commitments ?? 0}</b> open ·{" "}
          <b className={a.overdue_commitments ? "text-red-600" : ""}>
            {a.overdue_commitments ?? 0}
          </b>{" "}
          overdue
        </span>
      )}
    </div>
    <div className="flex flex-wrap gap-2 text-sm">
      {CLIENT_ACTION_TABS.map((t) => (
        <Link
          key={t.id}
          to={clientActionsLink(t.id, companyId)}
          className="rounded-full border px-3 py-1 min-h-9 inline-flex items-center"
        >
          {t.label}
          {t.id === "overdue" && !isPending && !error
            ? ` (${a.overdue_commitments ?? 0})`
            : ""}
        </Link>
      ))}
    </div>
  </div>
);
