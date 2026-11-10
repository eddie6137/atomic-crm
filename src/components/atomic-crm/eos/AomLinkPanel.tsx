import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ACTION_LABEL,
  aomHref,
  offeredActions,
  statusLabel,
  type AomAction,
  type AomMapRow,
} from "./aomLink";
import { useAomWriteBack, type Invoke } from "./useAomWriteBack";

const AOM_ORIGIN: string | undefined = (import.meta as any).env
  ?.VITE_AOM_APP_ORIGIN;

type Props = {
  record: {
    id: string | number;
    status: string;
    status_reason?: string | null;
    revision?: number;
  };
  aom: AomMapRow;
  invoke?: Invoke;
};

/**
 * Replaces the free status select on AOM-originated cards: status is read-only here, changed only by
 * asking AOM (Start / Complete / Skip). Complete is not rendered on an `open` card.
 */
export const AomLinkPanel = ({ record, aom, invoke }: Props) => {
  const wb = useAomWriteBack(record, { invoke });
  const actions: AomAction[] = offeredActions(record.status);
  const href = aomHref(aom.deep_link_path, AOM_ORIGIN);
  return (
    <div
      className="flex flex-col gap-2 rounded-md border p-3"
      data-testid="aom-link-panel"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">AOM</Badge>
        <span className="font-medium">Status</span>
        <Badge variant="outline" data-testid="aom-status">
          {wb.waitingFor
            ? `waiting for AOM… (${statusLabel({ status: wb.waitingFor })})`
            : statusLabel(record)}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        This is work from AOM. Status is changed in AOM; here you can ask AOM to
        start, complete or skip it.
      </p>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="aom-actions">
          {actions.map((a) => (
            <Button
              key={a}
              type="button"
              variant={a === "skip" ? "outline" : "default"}
              className="min-h-11 md:min-h-9"
              disabled={wb.pending}
              data-testid={`aom-action-${a}`}
              onClick={() => void wb.send(a)}
            >
              {ACTION_LABEL[a]}
            </Button>
          ))}
        </div>
      )}
      {wb.error && (
        <p
          role="alert"
          className="text-sm text-destructive"
          data-testid="aom-error"
        >
          {wb.error}
        </p>
      )}
      <p
        className="text-xs text-muted-foreground break-all"
        data-testid="aom-provenance"
      >
        {aom.namespace} · {aom.source_key}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-sm inline-flex items-center gap-1 underline"
          data-testid="aom-open-link"
        >
          <ExternalLink className="size-4" /> Open in AOM
        </a>
      ) : (
        <span
          className="text-xs text-muted-foreground"
          data-testid="aom-open-path"
        >
          Open in AOM: {aom.deep_link_path}
        </span>
      )}
    </div>
  );
};
