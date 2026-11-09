import { useGetList, useGetMany } from "ra-core";
import { Link } from "react-router";
import { ListChecks } from "lucide-react";
import { Card } from "@/components/ui/card";

import { activeActionFilter, clientActionsLink } from "./clientActions";
import { todayPT } from "./constants";

const SHOW = 6;

/** Dashboard card: every open client action (any owner), newest first. */
export const OpenActionsWidget = () => {
  const { data, total, isPending, error } = useGetList("eos_commitments", {
    filter: activeActionFilter(),
    sort: { field: "created_at", order: "DESC" },
    pagination: { page: 1, perPage: SHOW },
  });
  const companyIds = [
    ...new Set((data ?? []).map((r: any) => r.company_id).filter(Boolean)),
  ];
  const { data: companies } = useGetMany(
    "companies",
    { ids: companyIds },
    { enabled: companyIds.length > 0 },
  );
  const nameOf = (id: unknown) =>
    companies?.find((c: any) => String(c.id) === String(id))?.name ?? "";
  const today = todayPT();
  return (
    <Card className="gap-2 py-3 px-4" data-testid="dashboard-open-actions">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <ListChecks className="size-4 text-muted-foreground" />
          Open client actions
          {!isPending && !error && (
            <span
              className="text-sm font-normal text-muted-foreground"
              data-testid="dashboard-open-actions-total"
            >
              {total ?? 0}
            </span>
          )}
        </h2>
        <Link
          to={clientActionsLink("all")}
          className="text-sm underline underline-offset-2 min-h-9 inline-flex items-center"
        >
          View all
        </Link>
      </div>
      {isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading…
        </p>
      ) : error ? (
        <p className="text-sm text-red-600">Could not load open actions.</p>
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">No open actions.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {data.map((r: any) => (
            <li key={r.id}>
              <Link
                to={`/eos_commitments/${r.id}`}
                className="flex items-baseline justify-between gap-3 py-2 min-h-11 text-sm"
                data-testid="dashboard-open-action"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.title}</span>
                  <span className="block truncate text-muted-foreground">
                    {nameOf(r.company_id)}
                  </span>
                </span>
                <span
                  className={`shrink-0 ${r.due_date && r.due_date < today ? "text-red-600" : "text-muted-foreground"}`}
                >
                  {r.due_date ?? "No due date"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
