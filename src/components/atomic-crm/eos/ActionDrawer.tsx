import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Form,
  RecordContextProvider,
  ResourceContextProvider,
  useGetOne,
  useNotify,
  useRefresh,
  useUpdate,
} from "ra-core";
import { useWatch } from "react-hook-form";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { ReferenceField } from "@/components/admin/reference-field";
import { DateInput } from "@/components/admin/date-input";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { FormDrawer } from "../misc/FormDrawer";
import { ActionActivity } from "./ActionActivity";
import { ActionComments } from "./ActionComments";
import {
  accountEditable,
  inlinePatch,
  type InlineField,
} from "./actionDrawerWrites";
import { COMMITMENT_STATUSES, PRIORITIES } from "./constants";
import {
  CompanyInput,
  ExistingAttachments,
  LinksField,
  OwnerInput,
} from "./EosShared";
import { QuickDirection } from "./QuickDirection";

const RESOURCE = "eos_commitments";
const human = (v: string) => v.replace(/_/g, " ");
const selectClass =
  "min-h-11 md:min-h-9 w-full rounded-md border bg-background text-foreground scheme-light dark:scheme-dark px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60";

export type ActionDrawerProps = {
  /** `item` from the URL; null = closed. */
  item: string | null;
  onClose: () => void;
  prevId?: string | null;
  nextId?: string | null;
  /** Prev/Next: replaces `item` (never pushes history). */
  onNavigate?: (id: string) => void;
  /** Element to focus on close (the opener's title button). */
  finalFocus?: () => HTMLElement | null | boolean;
};

/**
 * v1d U1 detail drawer (spec §2 D3, §5 U1). Desktop (≥768): right Sheet. Phone: the
 * full-height FormDrawer (h-dvh, iOS keyboard inset). Loads the record by getOne,
 * independently of the list, so deep links and refresh work.
 */
export const ActionDrawer = (props: ActionDrawerProps) => {
  const isMobile = useIsMobile();
  const { item, onClose } = props;
  const open = item != null;
  const onOpenChange = (o: boolean) => {
    if (!o) onClose();
  };
  const body = item ? (
    <ResourceContextProvider value={RESOURCE}>
      <ActionDetail {...props} id={item} isMobile={isMobile} />
    </ResourceContextProvider>
  ) : null;
  if (isMobile)
    return (
      <FormDrawer
        open={open}
        onOpenChange={onOpenChange}
        finalFocus={props.finalFocus}
      >
        {body}
      </FormDrawer>
    );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="action-drawer-sheet"
        aria-describedby={undefined}
        finalFocus={props.finalFocus}
        className="w-full gap-0 p-0 data-[side=right]:sm:max-w-[min(480px,40vw)] data-[side=right]:min-w-[380px]"
      >
        {body}
      </SheetContent>
    </Sheet>
  );
};

const Title = ({
  isMobile,
  children,
}: {
  isMobile: boolean;
  children: ReactNode;
}) =>
  isMobile ? (
    <DrawerTitle className="sr-only">{children}</DrawerTitle>
  ) : (
    <SheetTitle className="sr-only">{children}</SheetTitle>
  );

const ActionDetail = ({
  id,
  isMobile,
  prevId,
  nextId,
  onNavigate,
}: ActionDrawerProps & { id: string; isMobile: boolean }) => {
  const {
    data: record,
    isPending,
    error,
  } = useGetOne(RESOURCE, { id }, { retry: false });
  const save = useInlineSave(record);

  let content: ReactNode;
  if (isPending) {
    content = (
      <p className="p-4 text-sm text-muted-foreground" role="status">
        Loading…
      </p>
    );
  } else if (error || !record || record.archived_at) {
    content = (
      <div
        className="p-4 flex flex-col gap-2"
        data-testid="action-drawer-missing"
      >
        <p className="font-medium">
          {record?.archived_at ? "This action is archived" : "Action not found"}
        </p>
        <p className="text-sm text-muted-foreground">
          It may have been archived or the link is out of date.
        </p>
      </div>
    );
  } else {
    content = (
      <RecordContextProvider value={record}>
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-4 p-4 pr-14 md:pr-4"
          data-testid="action-drawer-body"
        >
          <InlineTitle record={record} save={save.run} />
          <AccountField record={record} save={save.run} />
          {record.project_id && (
            <ReadOnly label="Project">
              <ReferenceField
                source="project_id"
                reference="eos_projects"
                link={false}
              />
            </ReadOnly>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Labeled label="Status" htmlFor="action-drawer-status">
              <select
                id="action-drawer-status"
                data-testid="action-drawer-status"
                className={selectClass}
                value={record.status ?? ""}
                disabled={save.isPending}
                onChange={(e) => save.run("status", e.target.value)}
              >
                {COMMITMENT_STATUSES.filter(
                  (s) => s !== "lapsed" || record.status === "lapsed",
                ).map((s) => (
                  <option key={s} value={s} disabled={s === "lapsed"}>
                    {human(s)}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Priority" htmlFor="action-drawer-priority">
              <select
                id="action-drawer-priority"
                data-testid="action-drawer-priority"
                className={selectClass}
                value={record.priority ?? ""}
                disabled={save.isPending}
                onChange={(e) => save.run("priority", e.target.value)}
              >
                <option value="">None</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Labeled>
            <FieldForm record={record} field="owner_sales_id" save={save.run}>
              <OwnerInput explicitClear />
            </FieldForm>
            <FieldForm
              record={record}
              field="due_date"
              save={save.run}
              onBlurSubmit
            >
              <DateInput source="due_date" label="Due date" />
            </FieldForm>
            <Labeled label="Direction">
              <div
                data-testid="action-drawer-direction"
                className="[&_select]:w-full [&_select]:md:min-h-9"
              >
                <QuickDirection />
              </div>
            </Labeled>
          </div>
          {record.needs_review && (
            <Badge variant="destructive" className="self-start">
              needs review
            </Badge>
          )}
          {record.blocker && (
            <ReadOnly label="Blocker">
              <p className="whitespace-pre-wrap break-words">
                {record.blocker}
              </p>
            </ReadOnly>
          )}
          {record.definition_of_done && (
            <ReadOnly label="Definition of done">
              <p className="whitespace-pre-wrap break-words">
                {record.definition_of_done}
              </p>
            </ReadOnly>
          )}
          {(record.links?.length > 0 || record.attachments?.length > 0) && (
            <ReadOnly label="Links and files">
              <div className="flex flex-col gap-2">
                <LinksField />
                <ExistingAttachments />
              </div>
            </ReadOnly>
          )}
          <section
            aria-labelledby="action-comments-h"
            className="flex flex-col gap-2"
          >
            <h3 id="action-comments-h" className="text-sm font-medium">
              Comments
            </h3>
            <ActionComments commitmentId={String(record.id)} />
          </section>
          <section
            aria-labelledby="action-activity-h"
            className="flex flex-col gap-2"
          >
            <h3 id="action-activity-h" className="text-sm font-medium">
              Activity
            </h3>
            <ActionActivity recordId={String(record.id)} />
          </section>
        </div>
      </RecordContextProvider>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="action-drawer">
      <Title isMobile={isMobile}>{record?.title ?? "Action"}</Title>
      {content}
      <div className="border-t flex items-center gap-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Button
          variant="outline"
          className="min-h-11 min-w-11 md:min-h-9"
          aria-label="Previous action"
          data-testid="action-drawer-prev"
          disabled={!prevId}
          onClick={() => prevId && onNavigate?.(prevId)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          className="min-h-11 min-w-11 md:min-h-9"
          aria-label="Next action"
          data-testid="action-drawer-next"
          disabled={!nextId}
          onClick={() => nextId && onNavigate?.(nextId)}
        >
          <ChevronRight className="size-4" />
        </Button>
        {record && !record.archived_at && (
          <Link
            to={`/${RESOURCE}/${encodeURIComponent(String(record.id))}`}
            className={`${buttonVariants({ variant: "default" })} ml-auto min-h-11 md:min-h-9`}
            data-testid="action-drawer-full-edit"
          >
            <ExternalLink className="size-4" /> Open full edit
          </Link>
        )}
      </div>
    </div>
  );
};

/** Partial, pessimistic, one-field update (D5), then refresh (QuickDirection pattern). */
const useInlineSave = (record: any) => {
  const [update, { isPending }] = useUpdate();
  const notify = useNotify();
  const refresh = useRefresh();
  const run = (field: InlineField, value: unknown) => {
    if (!record) return;
    let patch: Record<string, unknown> | null;
    try {
      patch = inlinePatch(record, field, value);
    } catch (e: any) {
      notify(e?.message ?? "Invalid value", { type: "error" });
      return;
    }
    if (!patch) return;
    update(
      RESOURCE,
      { id: record.id, data: patch, previousData: record },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          notify("Saved", { type: "success" });
          refresh();
        },
        onError: (e: any) =>
          notify(
            e?.message ? `Could not save: ${e.message}` : "Could not save",
            {
              type: "error",
            },
          ),
      },
    );
  };
  return { run, isPending };
};

type Save = (field: InlineField, value: unknown) => void;

const InlineTitle = ({ record, save }: { record: any; save: Save }) => {
  const [value, setValue] = useState<string>(record.title ?? "");
  const cancelled = useRef(false);
  useEffect(() => setValue(record.title ?? ""), [record.title]);
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="action-drawer-title"
        className="text-xs text-muted-foreground"
      >
        Title
      </label>
      <input
        id="action-drawer-title"
        data-testid="action-drawer-title"
        data-autofocus
        className="w-full rounded-md border border-transparent bg-transparent px-2 -mx-2 min-h-11 text-lg font-semibold hover:border-border focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape" && value !== (record.title ?? "")) {
            // Escape cancels the edit; it closes the drawer only when nothing is pending.
            e.stopPropagation();
            cancelled.current = true;
            setValue(record.title ?? "");
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false;
            return;
          }
          if (!value.trim()) {
            setValue(record.title ?? "");
            save("title", value); // surfaces "Title is required"; nothing is written
            return;
          }
          save("title", value);
        }}
      />
    </div>
  );
};

const AccountField = ({ record, save }: { record: any; save: Save }) => {
  if (!accountEditable(record))
    return (
      <ReadOnly label="Account">
        <div data-testid="action-drawer-account-locked">
          {record.company_id ? (
            <ReferenceField
              source="company_id"
              reference="companies"
              link={false}
            />
          ) : (
            "No account"
          )}
          <p className="text-xs text-muted-foreground">
            Set by the project. Change account in full edit.
          </p>
        </div>
      </ReadOnly>
    );
  return (
    <FieldForm record={record} field="company_id" save={save}>
      {/* required: no Clear (CHECK eos_commitments_company_or_review) */}
      <CompanyInput required />
    </FieldForm>
  );
};

/**
 * One small ra Form per field (D5). Its own submit sends only {[field]: value};
 * it never touches SaveContext/SaveButton and never sees the full record.
 */
const FieldForm = ({
  record,
  field,
  save,
  children,
  onBlurSubmit,
}: {
  record: any;
  field: InlineField;
  save: Save;
  children: ReactNode;
  /** Typed dates: submit on blur (or calendar pick), never per keystroke. */
  onBlurSubmit?: boolean;
}) => (
  <div data-testid={`action-drawer-field-${field}`}>
    <Form
      key={`${record.id}:${record.updated_at ?? ""}:${String(record[field] ?? "")}`}
      record={{ id: record.id, [field]: record[field] ?? null }}
      onSubmit={(values: Record<string, unknown>) => save(field, values[field])}
    >
      <AutoSubmit
        field={field}
        initial={record[field] ?? null}
        onBlurSubmit={onBlurSubmit}
      >
        {children}
      </AutoSubmit>
    </Form>
  </div>
);

const AutoSubmit = ({
  field,
  initial,
  onBlurSubmit,
  children,
}: {
  field: string;
  initial: unknown;
  onBlurSubmit?: boolean;
  children: ReactNode;
}) => {
  const value = useWatch({ name: field });
  const wrapper = useRef<HTMLDivElement>(null);
  // Submit through the field's own <form> (ra Form onSubmit -> partial save).
  const submit = () => wrapper.current?.closest("form")?.requestSubmit();
  useEffect(() => {
    if (String(value ?? "") === String(initial ?? "")) return;
    if (onBlurSubmit) {
      const active = document.activeElement;
      if (
        active &&
        wrapper.current?.contains(active) &&
        active.tagName === "INPUT"
      )
        return; // still typing a date: wait for blur
    }
    submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div
      ref={wrapper}
      onBlur={
        onBlurSubmit
          ? (e) => {
              // Commit when the typed date input itself loses focus (even if
              // focus moves to the calendar button in this field), or when
              // focus leaves the field. Otherwise a later save of another
              // field refreshes the record and remounts this form, which
              // would drop the typed value.
              const fromInput = (e.target as HTMLElement).tagName === "INPUT";
              if (
                fromInput ||
                !wrapper.current?.contains(e.relatedTarget as Node | null)
              )
                submit();
            }
          : undefined
      }
    >
      {children}
    </div>
  );
};

const Labeled = ({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={htmlFor} className="text-sm font-medium">
      {label}
    </label>
    {children}
  </div>
);

const ReadOnly = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-1 text-sm">
    <span className="font-medium">{label}</span>
    <div className="text-muted-foreground">{children}</div>
  </div>
);
