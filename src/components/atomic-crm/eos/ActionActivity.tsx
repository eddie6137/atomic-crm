import { useMemo, useState } from "react";
import { useGetList, useGetMany } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  activityActor,
  activityLookupIds,
  describeActivity,
  formatPT,
  type ActivityEntry,
  type ActivityNames,
} from "./actionActivity";

const PAGE = 50;

const toMap = (rows: any[] | undefined, label: (r: any) => string) =>
  Object.fromEntries((rows ?? []).map((r) => [String(r.id), label(r)]));

/**
 * Read-only, immutable activity timeline for one commitment (spec §4).
 * Source: eos_activity (members-only SELECT, insert revoked). Newest first by id.
 * ID→name lookups are batched: one getMany per resource per loaded page.
 */
export const ActionActivity = ({ recordId }: { recordId: string }) => {
  const [pages, setPages] = useState(1);
  const { data, total, isPending, error } = useGetList<
    ActivityEntry & { id: any }
  >(
    "eos_activity",
    {
      filter: { table_name: "eos_commitments", record_id: recordId },
      sort: { field: "id", order: "DESC" },
      pagination: { page: 1, perPage: PAGE * pages },
    },
    { retry: false },
  );
  const ids = useMemo(() => activityLookupIds(data ?? []), [data]);
  const sales = useGetMany(
    "sales",
    { ids: ids.sales },
    { enabled: ids.sales.length > 0 },
  );
  const companies = useGetMany(
    "companies",
    { ids: ids.companies },
    { enabled: ids.companies.length > 0 },
  );
  const projects = useGetMany(
    "eos_projects",
    { ids: ids.projects },
    { enabled: ids.projects.length > 0 },
  );
  const names: ActivityNames = useMemo(
    () => ({
      sales: toMap(sales.data, (s) =>
        `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(),
      ),
      companies: toMap(companies.data, (c) => c.name),
      projects: toMap(projects.data, (p) => p.title),
    }),
    [sales.data, companies.data, projects.data],
  );

  if (isPending)
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading activity…
      </p>
    );
  if (error)
    return (
      <p className="text-sm text-muted-foreground">Could not load activity.</p>
    );
  if (!data?.length)
    return (
      <p className="text-sm text-muted-foreground">
        No activity yet. History starts Nov 5, 2026.
      </p>
    );
  return (
    <div className="flex flex-col gap-2" data-testid="action-activity">
      <ol className="flex flex-col gap-2 text-sm">
        {data.map((e) => (
          <li
            key={e.id}
            className="border-l-2 border-border pl-3"
            data-testid="action-activity-entry"
          >
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {activityActor(e, names)}
              </span>{" "}
              · {formatPT(e.created_at)}
            </div>
            <ul className="break-words">
              {describeActivity(e, names).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {total != null && total > data.length && (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-8 self-start"
          onClick={() => setPages((p) => p + 1)}
        >
          Load more ({data.length} of {total})
        </Button>
      )}
    </div>
  );
};
