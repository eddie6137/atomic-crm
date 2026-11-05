import { useState } from "react";
import {
  useGetList,
  useListContext,
  useNotify,
  useRefresh,
  useResourceContext,
  useUpdateMany,
} from "ra-core";
import { BulkActionsToolbar } from "@/components/admin/bulk-actions-toolbar";
import { SelectAllButton } from "@/components/admin/select-all-button";
import { Button } from "@/components/ui/button";

export type BulkField = {
  key: string;
  label: string;
  source: string;
  kind: "select" | "date" | "owner";
  options?: string[];
  optionLabels?: Record<string, string>;
};

const nice = (s: string) => s.replace(/_/g, " ");

/**
 * Bulk edit (Eddie 2:18 PT): change status/owner/priority/due date on selected rows, and
 * soft-archive with undo (react-admin undoable mutation: nothing is written until the undo
 * window closes). Reuses Atomic's BulkActionsToolbar + SelectAllButton pattern from Contacts.
 */
export const EosBulkToolbar = ({
  fields,
  archivable = true,
}: {
  fields: BulkField[];
  archivable?: boolean;
}) => (
  <BulkActionsToolbar>
    <EosBulkButtons fields={fields} archivable={archivable} />
  </BulkActionsToolbar>
);

export const EosBulkButtons = ({
  fields,
  archivable = true,
}: {
  fields: BulkField[];
  archivable?: boolean;
}) => {
  const resource = useResourceContext()!;
  const { selectedIds, onUnselectItems } = useListContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const [updateMany, { isPending }] = useUpdateMany();
  const [open, setOpen] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const { data: sales } = useGetList("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "first_name", order: "ASC" },
  });
  const field = fields.find((f) => f.key === open);
  const n = selectedIds.length;

  const apply = (data: Record<string, unknown>, undoable = false) =>
    updateMany(
      resource,
      { ids: selectedIds, data },
      {
        mutationMode: undoable ? "undoable" : "pessimistic",
        onSuccess: () => {
          notify(undoable ? `${n} archived` : `${n} updated`, {
            undoable,
            type: "info",
          });
          onUnselectItems();
          setOpen(null);
          setValue("");
          refresh();
        },
        onError: (e: any) =>
          notify(`Bulk update failed: ${e?.message ?? e}`, { type: "error" }),
      },
    );

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="eos-bulk">
      <SelectAllButton />
      {fields.map((f) => (
        <Button
          key={f.key}
          size="sm"
          variant={open === f.key ? "default" : "outline"}
          onClick={() => {
            setOpen(open === f.key ? null : f.key);
            setValue("");
          }}
          data-testid={`eos-bulk-${f.key}`}
        >
          {f.label}
        </Button>
      ))}
      {archivable && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => apply({ archived_at: new Date().toISOString() }, true)}
          data-testid="eos-bulk-archive"
        >
          Archive
        </Button>
      )}
      {field && (
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {field.kind === "date" ? (
            <input
              type="date"
              className="border rounded px-2 py-1 text-sm bg-background"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={field.label}
              data-testid="eos-bulk-value"
            />
          ) : (
            <select
              className="border rounded px-2 py-1 text-sm bg-background"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={field.label}
              data-testid="eos-bulk-value"
            >
              <option value="">Choose…</option>
              {field.kind === "owner"
                ? (sales ?? []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))
                : (field.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {field.optionLabels?.[o] ?? nice(o)}
                    </option>
                  ))}
              {field.kind !== "select" || field.key === "priority" ? (
                <option value="__clear">— clear —</option>
              ) : null}
            </select>
          )}
          <Button
            size="sm"
            disabled={!value || isPending}
            onClick={() =>
              apply({
                [field.source]:
                  value === "__clear"
                    ? null
                    : field.kind === "owner"
                      ? Number(value)
                      : value,
              })
            }
            data-testid="eos-bulk-apply"
          >
            Apply to {n}
          </Button>
        </div>
      )}
    </div>
  );
};
