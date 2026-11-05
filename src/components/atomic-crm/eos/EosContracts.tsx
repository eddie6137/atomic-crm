import { useEffect, useState, type ReactNode } from "react";
import { useGetList, useRecordContext } from "ra-core";
import { Link } from "react-router";
import { ArrayInput } from "@/components/admin/array-input";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { BooleanInput } from "@/components/admin/boolean-input";
import { Create } from "@/components/admin/create";
import { DataTable } from "@/components/admin/data-table";
import { DateInput } from "@/components/admin/date-input";
import { Edit } from "@/components/admin/edit";
import { List } from "@/components/admin/list";
import { NumberInput } from "@/components/admin/number-input";
import { ReferenceField } from "@/components/admin/reference-field";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { SimpleForm } from "@/components/admin/simple-form";
import { SimpleFormIterator } from "@/components/admin/simple-form-iterator";
import { TextInput } from "@/components/admin/text-input";
import { Badge } from "@/components/ui/badge";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { TopToolbar } from "../layout/TopToolbar";
import { choices } from "./constants";
import {
  ArchiveButton,
  CommonCols,
  ListActions,
  required,
} from "./EosResources";
import { CompanyInput, OwnerInput, ProjectInput } from "./EosShared";
import { EosListBody } from "./EosListBody";
import { EosNav } from "./EosNav";
import { validateHttpsUrl } from "./links";

export const CONTRACT_STATUSES = ["draft", "active", "expired", "terminated"];
export const OBLIGATION_TYPES = [
  "fee_step_up",
  "review",
  "renewal",
  "notice",
  "threshold",
  "scope_addendum",
];
export const OBLIGATION_STATUSES = [
  "proposed",
  "open",
  "upcoming",
  "fulfilled",
  "missed",
  "waived",
  "not_applicable",
];
export const ANCHORS = [
  "contract_start",
  "contract_end",
  "period_start",
  "period_end",
  "invoice_date",
  "scope_event",
];
export const OFFSET_UNITS = ["day", "business_day", "month", "year"];

/** Server-side check (RLS is the real gate; this only decides what to render). */
export const usePrivateMember = () => {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    getSupabaseClient()
      .rpc("eos_is_private_member")
      .then(({ data, error }) => setOk(!error && data === true));
  }, []);
  return ok;
};

export const PrivateGate = ({ children }: { children: ReactNode }) => {
  const ok = usePrivateMember();
  if (ok === null) return null;
  if (!ok)
    return (
      <div className="flex flex-col gap-2">
        <EosNav />
        <p
          className="p-4 text-sm text-muted-foreground"
          data-testid="eos-contracts-restricted"
        >
          Contracts are restricted to Joe and Eddie.
        </p>
      </div>
    );
  return <>{children}</>;
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div className="w-full flex flex-col gap-3 border-t pt-3">
    <h3 className="font-semibold">{title}</h3>
    <div className="grid gap-4 md:grid-cols-2 w-full">{children}</div>
  </div>
);

// ---------------- Contracts ----------------
const ContractForm = () => (
  <SimpleForm>
    <div className="grid gap-4 md:grid-cols-2 w-full">
      <TextInput source="title" validate={required} />
      <CompanyInput required />
      <ProjectInput />
      <SelectInput
        source="status"
        choices={choices(CONTRACT_STATUSES)}
        defaultValue="draft"
        helperText="Non-draft needs a link"
      />
      <NumberInput source="version" defaultValue={1} />
      <OwnerInput />
      <DateInput source="start_date" />
      <NumberInput source="term_quantity" label="Term" />
      <SelectInput
        source="term_unit"
        choices={choices(["day", "month", "year"])}
      />
      <DateInput
        source="end_date"
        helperText="Blank = computed from start + term"
      />
      <TextInput
        source="end_date_rule"
        label="End-date / renewal rule (as written)"
      />
    </div>
    <ArrayInput
      source="links"
      label="Contract source links (private; uploads come later)"
    >
      <SimpleFormIterator inline>
        <TextInput source="url" label="URL" validate={validateHttpsUrl} />
        <TextInput source="label" label="Label" />
      </SimpleFormIterator>
    </ArrayInput>
    <TextInput source="notes" multiline className="w-full" />
    <Section title="Pricing / partner terms (STUB, Joe + Eddie decide)">
      <TextInput
        source="pricing_terms_stub"
        label="Pricing terms (free text, not interpreted)"
        multiline
      />
      <TextInput
        source="partner_terms_stub"
        label="Partner terms (free text, not interpreted)"
        multiline
      />
    </Section>
    <ContractObligations />
  </SimpleForm>
);

const signalBadge = (o: any) => {
  if (["fulfilled", "waived", "not_applicable"].includes(o.status))
    return <Badge variant="outline">{o.status.replace(/_/g, " ")}</Badge>;
  if (o.needs_review) return <Badge variant="secondary">needs review</Badge>;
  return <Badge variant="outline">{o.status}</Badge>;
};

const ContractObligations = () => {
  const record = useRecordContext();
  const { data } = useGetList(
    "eos_contract_obligations",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "due_date", order: "ASC" },
      filter: { contract_id: record?.id, "archived_at@is": null },
    },
    { enabled: !!record?.id },
  );
  if (!record?.id) return null;
  return (
    <div
      className="w-full flex flex-col gap-1 border-t pt-3"
      data-testid="eos-contract-obligations"
    >
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">
          Clauses / obligations ({data?.length ?? 0})
        </h3>
        <Link
          className="text-sm underline"
          to={`/eos_contract_obligations/create?source=${encodeURIComponent(JSON.stringify({ contract_id: record.id }))}`}
        >
          + Clause
        </Link>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {(data ?? []).map((o: any) => (
          <li key={o.id} className="flex flex-wrap justify-between gap-2">
            <Link
              to={`/eos_contract_obligations/${o.id}`}
              className="break-words min-w-0"
            >
              {o.title}{" "}
              <span className="text-muted-foreground">
                ({o.type.replace(/_/g, " ")})
              </span>
            </Link>
            <span className="flex gap-1 items-center shrink-0">
              {signalBadge(o)}
              <span className="text-muted-foreground">
                {o.due_date ?? "no date"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const ContractList = () => (
  <PrivateGate>
    <div className="flex flex-col gap-2">
      <EosNav />
      <div className="flex gap-3 text-sm">
        <Link
          className="underline"
          to="/eos/contract-signals"
          data-testid="eos-contract-signals-link"
        >
          Overdue / missed / upcoming clauses
        </Link>
        <Link className="underline" to="/eos_contract_obligations">
          All clauses
        </Link>
      </div>
      <List
        resource="eos_contracts"
        title="EOS · Contracts (private)"
        filter={{ "archived_at@is": null }}
        sort={{ field: "start_date", order: "DESC" }}
        actions={<ListActions label="New contract" />}
      >
        <EosListBody dateSource="end_date">
          <DataTable rowClick="edit" bulkActionButtons={false}>
            <DataTable.Col source="title" />
            {CommonCols()}
            <DataTable.Col source="status" />
            <DataTable.Col source="start_date" label="Start" />
            <DataTable.Col source="end_date" label="End" />
          </DataTable>
        </EosListBody>
      </List>
    </div>
  </PrivateGate>
);

// ---------------- Obligations ----------------
const Computed = () => {
  const r = useRecordContext();
  if (!r?.id)
    return (
      <p className="text-sm text-muted-foreground">
        Due date is computed on save; ambiguity is flagged, never guessed.
      </p>
    );
  return (
    <div className="text-sm w-full" data-testid="eos-obligation-computed">
      Computed due: <b>{r.computed_due_date ?? "—"}</b>
      {r.needs_review ? (
        <span className="ml-2 text-amber-700">
          Needs review: {r.review_reason || "unconfirmed"}
        </span>
      ) : null}
    </div>
  );
};

const ObligationForm = () => (
  <SimpleForm>
    <div className="grid gap-4 md:grid-cols-2 w-full">
      <ReferenceInput
        source="contract_id"
        reference="eos_contracts"
        filter={{ "archived_at@is": null }}
      >
        <AutocompleteInput
          label="Contract"
          optionText="title"
          validate={required}
        />
      </ReferenceInput>
      <SelectInput
        source="type"
        choices={choices(OBLIGATION_TYPES)}
        validate={required}
      />
      <TextInput source="title" validate={required} />
      <SelectInput
        source="status"
        choices={choices(OBLIGATION_STATUSES)}
        defaultValue="proposed"
      />
      <OwnerInput />
      <TextInput source="source_page" label="Source page" />
    </div>
    <TextInput
      source="source_excerpt"
      label="Source excerpt (untrusted text)"
      multiline
      className="w-full"
    />
    <Section title="Date rule">
      <SelectInput source="anchor" choices={choices(ANCHORS)} />
      <DateInput
        source="anchor_date"
        label="Anchor date (invoice / event / period)"
      />
      <NumberInput source="offset_quantity" label="Offset" />
      <SelectInput source="offset_unit" choices={choices(OFFSET_UNITS)} />
      <TextInput source="business_calendar" label="Business calendar (OPEN)" />
      <TextInput source="due_rule" label="Rule as written" />
      <BooleanInput source="due_confirmed" label="Human-confirmed date" />
      <DateInput source="due_date" label="Confirmed due date" />
      <Computed />
    </Section>
    <Section title="Threshold (type = threshold)">
      <TextInput source="threshold_metric" />
      <SelectInput
        source="threshold_comparator"
        choices={choices([">", ">=", "=", "<=", "<"])}
      />
      <NumberInput source="threshold_value" />
    </Section>
    <Section title="Amount impact (private estimate, not an invoice or legal determination)">
      <NumberInput source="amount_impact" />
      <TextInput source="amount_currency" defaultValue="USD" />
      <TextInput source="amount_basis" />
      <BooleanInput source="amount_estimated" defaultValue />
    </Section>
    <TextInput source="evidence" multiline className="w-full" />
  </SimpleForm>
);

const ObligationList = () => (
  <PrivateGate>
    <div className="flex flex-col gap-2">
      <EosNav />
      <List
        resource="eos_contract_obligations"
        title="EOS · Contract clauses (private)"
        filter={{ "archived_at@is": null }}
        sort={{ field: "due_date", order: "ASC" }}
        actions={<ListActions label="New clause" />}
      >
        <EosListBody
          extra={(r) =>
            r.needs_review ? (
              <Badge variant="secondary">needs review</Badge>
            ) : null
          }
        >
          <DataTable rowClick="edit" bulkActionButtons={false}>
            <DataTable.Col source="title" />
            <DataTable.Col source="contract_id" label="Contract">
              <ReferenceField
                source="contract_id"
                reference="eos_contracts"
                link={false}
              />
            </DataTable.Col>
            <DataTable.Col source="type" />
            <DataTable.Col source="status" />
            <DataTable.Col source="due_date" label="Due" />
            <DataTable.Col source="review_reason" label="Review" />
          </DataTable>
        </EosListBody>
      </List>
    </div>
  </PrivateGate>
);

// ---------------- Signals page ----------------
const SIGNAL_SECTIONS: [string, string][] = [
  ["missed", "Missed (past due, not fulfilled or waived)"],
  ["upcoming", "Upcoming (inside lead window 30/14/3d)"],
  ["needs_review", "Needs review (no confirmed date)"],
];

export const ContractSignalsPage = () => {
  const { data, isPending } = useGetList("eos_contract_signals", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "due_date", order: "ASC" },
  });
  return (
    <PrivateGate>
      <div className="flex flex-col gap-3" data-testid="eos-contract-signals">
        <EosNav />
        <h2 className="text-lg font-semibold">
          EOS · Contract clauses: overdue / missed / upcoming
        </h2>
        <p className="text-xs text-muted-foreground">
          Computed on load (last evaluated{" "}
          {new Date().toLocaleString("en-US", {
            timeZone: "America/Los_Angeles",
          })}{" "}
          PT). No outbound alerts. Flags only; Joe + Eddie decide
          interpretation.
        </p>
        {isPending
          ? null
          : SIGNAL_SECTIONS.map(([key, label]) => {
              const rows = (data ?? []).filter((r: any) => r.signal === key);
              return (
                <section key={key} className="flex flex-col gap-1 min-w-0">
                  <h3 className="font-medium">
                    {label} ({rows.length})
                  </h3>
                  {rows.map((r: any) => (
                    <Link
                      key={r.id}
                      to={`/eos_contract_obligations/${r.id}`}
                      className="rounded border p-2 text-sm flex flex-wrap justify-between gap-2 min-w-0"
                    >
                      <span className="break-words min-w-0">{r.title}</span>
                      <span className="text-muted-foreground shrink-0">
                        {r.due_date ?? r.review_reason ?? "—"}
                        {r.days_until != null ? ` (${r.days_until}d)` : ""}
                      </span>
                    </Link>
                  ))}
                </section>
              );
            })}
      </div>
    </PrivateGate>
  );
};
ContractSignalsPage.path = "/eos/contract-signals";

const gatedEdit = (resource: string, Form: () => ReactNode) => () => (
  <PrivateGate>
    <Edit
      resource={resource}
      mutationMode="pessimistic"
      actions={
        <TopToolbar>
          <ArchiveButton resource={resource} />
        </TopToolbar>
      }
    >
      <Form />
    </Edit>
  </PrivateGate>
);
const gatedCreate = (resource: string, Form: () => ReactNode) => () => (
  <PrivateGate>
    <Create resource={resource} redirect="edit">
      <Form />
    </Create>
  </PrivateGate>
);

export const eosContracts = {
  list: ContractList,
  create: gatedCreate("eos_contracts", ContractForm),
  edit: gatedEdit("eos_contracts", ContractForm),
  recordRepresentation: "title",
  options: { label: "EOS Contracts" },
};
export const eosContractObligations = {
  list: ObligationList,
  create: gatedCreate("eos_contract_obligations", ObligationForm),
  edit: gatedEdit("eos_contract_obligations", ObligationForm),
  recordRepresentation: "title",
  options: { label: "EOS Contract clauses" },
};
