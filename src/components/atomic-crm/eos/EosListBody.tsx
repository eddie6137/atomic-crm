import type { ReactNode } from "react";
import {
  RecordContextProvider,
  useCreatePath,
  useListContext,
  useResourceContext,
} from "ra-core";
import { Link } from "react-router";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { DueField, LinksField } from "./EosShared";

/**
 * Desktop: the given DataTable. Narrow screens (<768px, Atomic's useIsMobile breakpoint):
 * stacked cards, so nothing scrolls sideways at 390px.
 */
export const EosListBody = ({
  children,
  dateSource = "due_date",
  extra,
}: {
  children: ReactNode;
  dateSource?: string | null;
  extra?: (r: any) => ReactNode;
}) => {
  const isMobile = useIsMobile();
  const { data, isPending } = useListContext();
  const resource = useResourceContext();
  const createPath = useCreatePath();
  if (!isMobile) return <>{children}</>;
  if (isPending) return null;
  if (!data?.length)
    return <p className="text-sm text-muted-foreground p-2">No results</p>;
  return (
    <div className="flex flex-col gap-2 w-full min-w-0" data-testid="eos-cards">
      {data.map((r: any) => (
        <RecordContextProvider value={r} key={r.id}>
          <Link
            to={createPath({ resource: resource!, id: r.id, type: "edit" })}
            className="block rounded-lg border p-3 no-underline text-foreground min-w-0"
          >
            <div className="font-medium break-words">{r.title ?? r.name}</div>
            <div className="text-sm text-muted-foreground break-words">
              {r.company_id ? (
                <ReferenceField
                  source="company_id"
                  reference="companies"
                  link={false}
                />
              ) : (
                "No account"
              )}
            </div>
            <div className="flex flex-wrap gap-1 mt-2 items-center text-xs">
              {r.status && (
                <Badge variant="outline">
                  {String(r.status).replace(/_/g, " ")}
                </Badge>
              )}
              {r.priority && <Badge variant="secondary">{r.priority}</Badge>}
              {r.quarter && <Badge variant="secondary">{r.quarter}</Badge>}
              {r.needs_review && (
                <Badge variant="destructive">needs review</Badge>
              )}
              {dateSource && r[dateSource] !== undefined && <DueField />}
              {extra?.(r)}
              <LinksField />
            </div>
          </Link>
        </RecordContextProvider>
      ))}
    </div>
  );
};
