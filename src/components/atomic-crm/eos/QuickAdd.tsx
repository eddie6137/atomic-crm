// v1d U4: inline quick-add (spec §5 U4). One line, Enter saves, focus stays for the
// next entry. Write path: one `create` with quickAddPayload() only.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Form,
  useCreate,
  useGetIdentity,
  useGetOne,
  useNotify,
  useRefresh,
} from "ra-core";
import { useFormContext, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/admin/text-input";
import { CompanyInput, OwnerInput } from "./EosShared";
import { auditQuickAdd } from "./intake/intake";
import {
  QUICK_ADD_TITLE_MAX,
  QUICK_ADD_DUE_CHIPS,
  quickAddDueDate,
  quickAddPayload,
  type QuickAddDueChip,
} from "./clientActions";

/** Phone sheet → mounted Client Actions view (CE nit 5). Cancelled = handled. */
export const QUICK_ADD_EVENT = "client-actions:quick-added";
/** How long the view waits for a "visible" new row to appear in the loaded ids. */
export const QUICK_ADD_CONFIRM_MS = 3000;

export type QuickAddCreated = {
  id: string | number;
  title?: string | null;
  status?: string | null;
  company_id?: unknown;
  owner_sales_id?: unknown;
  due_date?: string | null;
  [k: string]: unknown;
};

type Props = {
  /** Preselected account (URL company_id or the company page). */
  companyId?: string | number | null;
  /** Company page: the account is fixed and the account input is hidden. */
  lockedCompanyId?: string | number | null;
  variant?: "inline" | "drawer";
  /** Called after each successful create with the saved record. */
  onCreated?: (r: QuickAddCreated) => void;
  /** Board view: the new card lands in the Open lane. */
  boardHint?: boolean;
};

export const QuickAdd = (props: Props) => {
  const { identity, isPending } = useGetIdentity();
  if (isPending) return null;
  const company = props.lockedCompanyId ?? props.companyId ?? null;
  return (
    <Form
      // ra-core Form: RHF provider + <form>; Enter in the title submits it.
      defaultValues={{
        title: "",
        company_id:
          company == null || company === "" ? null : Number(company) || company,
        owner_sales_id: identity?.id ?? null,
      }}
      // The submit handler lives in QuickAddFields (it needs the form context).
      onSubmit={() => undefined}
      noValidate
    >
      <QuickAddFields {...props} />
    </Form>
  );
};

const QuickAddFields = ({
  lockedCompanyId,
  variant = "inline",
  onCreated,
  boardHint,
}: Props) => {
  const locked = lockedCompanyId != null && lockedCompanyId !== "";
  const { getValues, setValue, watch } = useFormContext();
  const [due, setDue] = useState<QuickAddDueChip>("none");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false); // double-Enter guard (sync, before any await)
  const rootRef = useRef<HTMLDivElement>(null);
  const [create] = useCreate();
  const notify = useNotify();
  const refresh = useRefresh();
  const navigate = useNavigate();
  // CE nit 6: a date chosen for one account must not silently carry over to another.
  const watchedCompany = useWatch({ name: "company_id" });
  const lastCompany = useRef(watchedCompany);
  useEffect(() => {
    if (String(lastCompany.current ?? "") !== String(watchedCompany ?? ""))
      setDue("none");
    lastCompany.current = watchedCompany;
  }, [watchedCompany]);
  const titleInput = () =>
    rootRef.current?.querySelector<HTMLInputElement>('input[name="title"]');

  const save = useCallback(async () => {
    if (inFlight.current) return;
    const v = getValues();
    let data: ReturnType<typeof quickAddPayload>;
    try {
      data = quickAddPayload({
        title: String(v.title ?? ""),
        company_id: locked ? lockedCompanyId! : v.company_id,
        owner_sales_id: v.owner_sales_id,
        due,
      });
    } catch (e) {
      setError((e as Error).message);
      titleInput()?.focus();
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const rec = (await create(
        "eos_commitments",
        { data },
        { returnPromise: true },
      )) as QuickAddCreated;
      setValue("title", "", { shouldDirty: false });
      titleInput()?.focus();
      refresh();
      // Audit-only intake row (Q5). A failure never undoes the commitment: tell the user.
      if (rec?.id != null && rec.id !== "") {
        void auditQuickAdd(rec.id).then((err) => {
          if (err)
            notify(`Saved, but the intake audit row failed: ${err}`, {
              type: "warning",
            });
        });
      }
      onCreated?.(rec ?? ({ ...data, id: "" } as QuickAddCreated));
    } catch (e: any) {
      notify(`Could not save: ${e?.message ?? "unknown error"}`, {
        type: "error",
      });
      titleInput()?.focus();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [
    getValues,
    setValue,
    locked,
    lockedCompanyId,
    due,
    create,
    refresh,
    notify,
    onCreated,
  ]);

  const moreFields = () => {
    const v = getValues();
    const source: Record<string, unknown> = {};
    if (String(v.title ?? "").trim()) source.title = String(v.title).trim();
    const c = locked ? lockedCompanyId : v.company_id;
    if (c != null && c !== "") source.company_id = Number(c) || c;
    if (v.owner_sales_id != null) source.owner_sales_id = v.owner_sales_id;
    const d = quickAddDueDate(due);
    if (d) source.due_date = d;
    navigate(
      `/eos_commitments/create?source=${encodeURIComponent(JSON.stringify(source))}`,
    );
  };

  const title = watch("title");
  return (
    <div
      ref={rootRef}
      className={
        variant === "drawer"
          ? "flex flex-col gap-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          : "flex flex-wrap items-start gap-2 rounded-lg border bg-card p-2"
      }
      data-testid="quick-add"
      data-variant={variant}
      aria-busy={pending}
      onKeyDown={(e) => {
        // Enter in the title saves; Enter elsewhere (account/owner pickers) does not.
        // CE nit 1: an IME composition Enter commits the composition, not the form.
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (
          e.key === "Enter" &&
          (e.target as HTMLElement).getAttribute("name") === "title"
        ) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className={variant === "drawer" ? "w-full" : "min-w-56 flex-1"}>
        <TextInput
          source="title"
          label={boardHint ? "Quick add (Open lane)" : "Quick add"}
          placeholder="New client action, Enter to save"
          autoComplete="off"
          // FormDrawer focuses [data-autofocus] after it slides in (iOS).
          {...(variant === "drawer" ? { "data-autofocus": true } : {})}
          data-testid="quick-add-title"
          // CE nit 2: app-side cap (no DB CHECK; that would be a migration).
          maxLength={QUICK_ADD_TITLE_MAX}
          enterKeyHint="done"
        />
      </div>
      {locked && variant === "drawer" && (
        <LockedAccount id={lockedCompanyId!} />
      )}
      {!locked && (
        <div
          className={variant === "drawer" ? "w-full" : "min-w-48"}
          data-testid="quick-add-account"
        >
          <CompanyInput required placeholder="Account (required)" />
        </div>
      )}
      <div
        className={variant === "drawer" ? "w-full" : "min-w-44"}
        data-testid="quick-add-owner"
      >
        <OwnerInput placeholder="Owner" />
      </div>
      <div
        role="group"
        aria-label="Due date"
        className="flex flex-wrap items-center gap-1 self-center"
        data-testid="quick-add-due"
      >
        {QUICK_ADD_DUE_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={due === c.id}
            data-testid={`quick-add-due-${c.id}`}
            onClick={() => setDue(due === c.id ? "none" : c.id)}
            className={`rounded-full border px-3 min-h-11 md:min-h-8 text-sm ${due === c.id ? "bg-primary text-primary-foreground" : ""}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 self-center">
        <Button
          type="button"
          size="sm"
          className="min-h-11 md:min-h-8"
          onClick={() => void save()}
          disabled={pending || !String(title ?? "").trim()}
          data-testid="quick-add-save"
        >
          {pending ? "Saving…" : "Add"}
        </Button>
        <button
          type="button"
          className="text-sm underline min-h-11 md:min-h-8"
          onClick={moreFields}
          data-testid="quick-add-more"
        >
          More fields
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="w-full text-sm text-red-600 dark:text-red-400"
          data-testid="quick-add-error"
        >
          {error}
        </p>
      )}
    </div>
  );
};

const LockedAccount = ({ id }: { id: string | number }) => {
  const { data } = useGetOne("companies", { id });
  return (
    <p
      className="text-sm text-muted-foreground"
      data-testid="quick-add-locked-account"
    >
      Account:{" "}
      <span className="font-medium text-foreground">{data?.name ?? "…"}</span>
    </p>
  );
};
