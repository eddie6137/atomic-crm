import type { ReactNode } from "react";
import { RecordContextProvider } from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { HIGHLIGHT_CLASS } from "./clientActions";
import { DueField } from "./EosShared";

export type ActionCardProps = {
  record: any;
  highlightId?: string | null;
  onOpen?: (id: string | number) => void;
  /** Extra controls under the card (status menu, Confirm, etc.). */
  footer?: ReactNode;
};

/** Compact card for board lanes and (optionally) list mobile. Spec D4. */
export const ActionCard = ({
  record,
  highlightId,
  onOpen,
  footer,
}: ActionCardProps) => {
  const highlighted =
    highlightId != null && String(record.id) === String(highlightId);
  return (
    <RecordContextProvider value={record}>
      <div
        className={`rounded-lg border min-w-0 bg-card ${highlighted ? `border-primary bg-primary/10 ring-1 ring-primary ${HIGHLIGHT_CLASS}` : ""}`}
        data-testid="action-card"
        data-lane-card={String(record.id)}
        data-highlighted={highlighted ? "true" : undefined}
      >
        <button
          type="button"
          data-open-item={String(record.id)}
          data-testid="action-card-open"
          onClick={() => onOpen?.(record.id)}
          className="block w-full text-left p-3 pb-2 text-foreground min-w-0 rounded-t-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="block font-medium break-words">
            {record.title ?? "Untitled"}
          </span>
          <span className="block text-sm text-muted-foreground break-words">
            {record.company_id ? (
              <ReferenceField
                source="company_id"
                reference="companies"
                link={false}
              />
            ) : (
              "No account"
            )}
            {" · "}
            {record.owner_sales_id ? (
              <ReferenceField
                source="owner_sales_id"
                reference="sales"
                link={false}
                render={({ referenceRecord }) =>
                  referenceRecord
                    ? `${referenceRecord.first_name} ${referenceRecord.last_name}`
                    : "—"
                }
              />
            ) : (
              "No owner"
            )}
          </span>
          <span className="flex flex-wrap gap-1 mt-2 items-center text-xs">
            {record.status && (
              <Badge variant="outline">
                {String(record.status).replace(/_/g, " ")}
              </Badge>
            )}
            {record.priority && (
              <Badge variant="secondary">{record.priority}</Badge>
            )}
            {record.direction === "from_client" && (
              <Badge variant="secondary">waiting on client</Badge>
            )}
            {record.needs_review && (
              <Badge variant="destructive">needs review</Badge>
            )}
            <DueField />
          </span>
        </button>
        {footer && (
          <div
            className="px-3 pb-3 flex flex-wrap items-center gap-2 text-xs"
            data-testid="action-card-footer"
            onClick={(e) => e.stopPropagation()}
          >
            {footer}
          </div>
        )}
      </div>
    </RecordContextProvider>
  );
};
