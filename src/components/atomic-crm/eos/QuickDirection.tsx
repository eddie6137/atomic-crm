import {
  useNotify,
  useRecordContext,
  useRefresh,
  useResourceContext,
  useUpdate,
} from "ra-core";
import {
  DIRECTION_OPTIONS,
  isUnclassified,
  toDirectionValue,
} from "./clientActions";

/**
 * Inline direction control for one commitment row (desktop table cell or 390 card).
 * Writes only the existing `direction` column; refreshes so tabs and the Unclassified
 * count update right away (a row set to from_client appears in Waiting on client).
 */
export const QuickDirection = () => {
  const record = useRecordContext();
  const resource = useResourceContext() ?? "eos_commitments";
  const [update, { isPending }] = useUpdate();
  const notify = useNotify();
  const refresh = useRefresh();
  if (!record) return null;
  const blank = isUnclassified(record.direction);
  const value = blank ? "" : String(record.direction);
  return (
    <select
      aria-label={`Direction for ${record.title ?? "action"}`}
      data-testid="quick-direction"
      data-unclassified={blank ? "true" : "false"}
      value={value}
      disabled={isPending}
      // Never let the control trigger the row's edit click.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = toDirectionValue(e.target.value);
        update(
          resource,
          { id: record.id, data: { direction: next }, previousData: record },
          {
            mutationMode: "pessimistic",
            onSuccess: () => {
              notify("Direction saved", { type: "success" });
              refresh();
            },
            onError: () =>
              notify("Could not save direction", { type: "error" }),
          },
        );
      }}
      className={`min-h-11 md:min-h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ${blank ? "border-amber-500 text-amber-700 dark:text-amber-400" : ""}`}
    >
      <option value="">Unclassified</option>
      {DIRECTION_OPTIONS.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
};
