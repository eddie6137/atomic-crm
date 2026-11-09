import {
  useGetIdentity,
  useNotify,
  useRecordContext,
  useRedirect,
  useUpdate,
} from "ra-core";
import { useNavigate } from "react-router";
import { Archive } from "lucide-react";
import { BooleanInput } from "@/components/admin/boolean-input";
import { Create } from "@/components/admin/create";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { DateInput } from "@/components/admin/date-input";
import { Edit } from "@/components/admin/edit";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { ReferenceField } from "@/components/admin/reference-field";
import { SelectInput } from "@/components/admin/select-input";
import { FormToolbar, SimpleForm } from "@/components/admin/simple-form";
import { TextInput } from "@/components/admin/text-input";
import { Button } from "@/components/ui/button";

import { TopToolbar } from "../layout/TopToolbar";
import {
  choices,
  COMMITMENT_OPEN,
  COMMITMENT_STATUSES,
  DIRECTIONS,
  ISSUE_OPEN,
  ISSUE_STATUSES,
  PRIORITIES,
  PROJECT_STATUSES,
} from "./constants";
import {
  CompanyInput,
  DueField,
  eosFilters,
  ExistingAttachments,
  LinksAndFilesInputs,
  LinksField,
  OwnerInput,
  ProjectInput,
  SavedViews,
} from "./EosShared";
import { EosNav } from "./EosNav";
import { CLIENT_ACTIONS_PATH, normalizeCommitment } from "./clientActions";
import { EosListBody } from "./EosListBody";
import { ParentProjectInput, ProjectChildren } from "./EosMilestones";
import { EosBulkToolbar } from "./EosBulkActions";
import { COMMITMENT_BULK, ISSUE_BULK, PROJECT_BULK } from "./bulkFields";

const saleName = (r: any) => `${r.first_name} ${r.last_name}`;
export const required = (v: any) =>
  v == null || v === "" ? "Required" : undefined;

export const ListActions = ({ label }: { label: string }) => (
  <TopToolbar>
    <ExportButton />
    <CreateButton label={label} />
  </TopToolbar>
);

/** Soft-delete only (§4.2/§7): archive sets archived_at; no delete button anywhere in EOS. */
export const ArchiveButton = ({ resource }: { resource: string }) => {
  const record = useRecordContext();
  const [update, { isPending }] = useUpdate();
  const notify = useNotify();
  const redirect = useRedirect();
  if (!record || record.archived_at) return null;
  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      onClick={() =>
        update(
          resource,
          {
            id: record.id,
            data: { archived_at: new Date().toISOString() },
            previousData: record,
          },
          {
            onSuccess: () => {
              notify("Archived");
              redirect("list", resource);
            },
          },
        )
      }
    >
      <Archive className="h-4 w-4 mr-1" /> Archive
    </Button>
  );
};

export const CommonCols = () => [
  <DataTable.Col source="company_id" label="Account" key="c">
    <ReferenceField source="company_id" reference="companies" link={false} />
  </DataTable.Col>,
  <DataTable.Col source="owner_sales_id" label="Owner" key="o">
    <ReferenceField
      source="owner_sales_id"
      reference="sales"
      link={false}
      render={({ referenceRecord }) =>
        referenceRecord ? saleName(referenceRecord) : "—"
      }
    />
  </DataTable.Col>,
];

// ---------------- Projects ----------------
const ProjectForm = () => (
  <SimpleForm>
    <div className="grid gap-4 md:grid-cols-2 w-full">
      <TextInput source="title" validate={required} />
      <CompanyInput required />
      <SelectInput
        source="status"
        choices={choices(PROJECT_STATUSES)}
        defaultValue="planned"
      />
      <OwnerInput />
      <DateInput source="start_date" />
      <DateInput source="target_date" />
      <BooleanInput source="is_internal" label="Internal (Amplify) project" />
      <ParentProjectInput />
    </div>
    <TextInput source="description" multiline className="w-full" />
    <LinksAndFilesInputs />
    <ProjectChildren />
  </SimpleForm>
);

export const ProjectList = () => (
  <div className="flex flex-col gap-2">
    <EosNav />
    <List
      resource="eos_projects"
      title="EOS · Projects"
      filters={eosFilters({ statuses: PROJECT_STATUSES })}
      filter={{ "archived_at@is": null }}
      sort={{ field: "created_at", order: "DESC" }}
      actions={<ListActions label="New project" />}
    >
      <SavedViews openStatuses={["planned", "active", "on_hold"]} />
      <EosListBody bulkFields={PROJECT_BULK}>
        <DataTable
          rowClick="edit"
          bulkActionsToolbar={<EosBulkToolbar fields={PROJECT_BULK} />}
        >
          <DataTable.Col source="title" />
          {CommonCols()}
          <DataTable.Col source="parent_project_id" label="Parent">
            <ReferenceField
              source="parent_project_id"
              reference="eos_projects"
              link={false}
              empty={<span className="text-muted-foreground">—</span>}
            />
          </DataTable.Col>
          <DataTable.Col source="status" />
          <DataTable.Col source="target_date" label="Target" />
          <DataTable.Col label="Links / files">
            <LinksField />
          </DataTable.Col>
        </DataTable>
      </EosListBody>
    </List>
  </div>
);
export const ProjectCreate = () => (
  <Create resource="eos_projects" redirect="list" title="New project">
    <ProjectForm />
  </Create>
);
export const ProjectEdit = () => (
  <Edit
    resource="eos_projects"
    mutationMode="pessimistic"
    actions={
      <TopToolbar>
        <ArchiveButton resource="eos_projects" />
      </TopToolbar>
    }
  >
    <ProjectForm />
  </Edit>
);

// ---------------- Commitments ----------------
// Mobile: lift the sticky Save toolbar above the fixed bottom nav + home-indicator inset.
const CommitmentForm = () => (
  <SimpleForm
    toolbar={
      <FormToolbar className="bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 z-10" />
    }
  >
    <div className="grid gap-4 md:grid-cols-2 w-full">
      <TextInput source="title" validate={required} />
      <CompanyInput required />
      <ProjectInput />
      <OwnerInput />
      <SelectInput
        source="status"
        choices={choices(COMMITMENT_STATUSES)}
        defaultValue="open"
      />
      <SelectInput source="direction" choices={choices(DIRECTIONS)} />
      <DateInput source="due_date" />
      <TextInput source="due_text" label="Due (original text)" />
      <SelectInput source="priority" choices={choices(PRIORITIES)} />
      <TextInput source="type" />
      <TextInput source="speaker" />
      <TextInput source="source_url" label="Source URL" />
    </div>
    <TextInput source="definition_of_done" multiline className="w-full" />
    <TextInput source="blocker" className="w-full" />
    <TextInput source="status_reason" className="w-full" />
    <BooleanInput source="needs_review" />
    <RawPanel />
    <LinksAndFilesInputs />
  </SimpleForm>
);
export const CommitmentList = () => (
  <div className="flex flex-col gap-2">
    <EosNav />
    <List
      resource="eos_commitments"
      title="EOS · Commitments"
      filters={eosFilters({
        statuses: COMMITMENT_STATUSES,
        priority: true,
        type: true,
        due: true,
      })}
      filter={{ "archived_at@is": null }}
      sort={{ field: "due_date", order: "ASC" }}
      actions={<ListActions label="New commitment" />}
    >
      <SavedViews openStatuses={COMMITMENT_OPEN} hasDue />
      <EosListBody bulkFields={COMMITMENT_BULK}>
        <DataTable
          rowClick="edit"
          bulkActionsToolbar={<EosBulkToolbar fields={COMMITMENT_BULK} />}
        >
          <DataTable.Col source="title" />
          {CommonCols()}
          <DataTable.Col source="status" />
          <DataTable.Col source="due_date" label="Due">
            <DueField />
          </DataTable.Col>
          <DataTable.Col source="priority" />
          <DataTable.Col source="type" />
          <DataTable.Col label="Links / files">
            <LinksField />
          </DataTable.Col>
        </DataTable>
      </EosListBody>
    </List>
  </div>
);
/**
 * UAT 2026-11-08: create used to redirect to an edit page that looks identical to the
 * empty form, so a saved action looked unsaved. Now: success toast + land on Client
 * Actions "All open" (newest first) with the new row highlighted. Owner defaults to me.
 */
export const commitmentCreatedPath = (id: unknown) =>
  `${CLIENT_ACTIONS_PATH}?${new URLSearchParams({ tab: "all", highlight: String(id) })}`;

export const CommitmentCreate = () => {
  const notify = useNotify();
  const navigate = useNavigate();
  const { identity, isPending } = useGetIdentity();
  if (isPending) return null;
  return (
    <Create
      resource="eos_commitments"
      title="New client action"
      transform={normalizeCommitment}
      record={
        identity?.id != null ? { owner_sales_id: identity.id } : undefined
      }
      mutationOptions={{
        onSuccess: (data: any) => {
          notify("Action saved. It is listed under Client Actions, All open.", {
            type: "success",
          });
          navigate(commitmentCreatedPath(data?.id));
        },
      }}
    >
      <CommitmentForm />
    </Create>
  );
};
export const CommitmentEdit = () => (
  <Edit
    resource="eos_commitments"
    mutationMode="pessimistic"
    // After an edit, land back on Client Actions with the row highlighted.
    redirect={(_r?: string, id?: unknown) => commitmentCreatedPath(id)}
    transform={normalizeCommitment}
    actions={
      <TopToolbar>
        <ArchiveButton resource="eos_commitments" />
      </TopToolbar>
    }
  >
    <CommitmentForm />
  </Edit>
);

// ---------------- Issues ----------------
const IssueForm = () => (
  <SimpleForm>
    <div className="grid gap-4 md:grid-cols-2 w-full">
      <TextInput source="title" validate={required} />
      <CompanyInput required />
      <ProjectInput />
      <OwnerInput />
      <SelectInput
        source="status"
        choices={choices(ISSUE_STATUSES)}
        defaultValue="open"
      />
      <SelectInput source="priority" choices={choices(PRIORITIES)} />
      <TextInput source="type" />
      <DateInput source="due_date" />
      <TextInput source="raised_by" />
      <DateInput source="raised_at" />
      <DateInput source="resolved_at" />
    </div>
    <TextInput source="detail" multiline className="w-full" />
    <TextInput source="solution" multiline className="w-full" />
    <BooleanInput source="needs_review" />
    <RawPanel />
    <LinksAndFilesInputs />
  </SimpleForm>
);
export const IssueList = () => (
  <div className="flex flex-col gap-2">
    <EosNav />
    <List
      resource="eos_issues"
      title="EOS · Issues"
      filters={eosFilters({
        statuses: ISSUE_STATUSES,
        priority: true,
        type: true,
        due: true,
      })}
      filter={{ "archived_at@is": null }}
      sort={{ field: "created_at", order: "DESC" }}
      actions={<ListActions label="New issue" />}
    >
      <SavedViews openStatuses={ISSUE_OPEN} hasDue />
      <EosListBody bulkFields={ISSUE_BULK}>
        <DataTable
          rowClick="edit"
          bulkActionsToolbar={<EosBulkToolbar fields={ISSUE_BULK} />}
        >
          <DataTable.Col source="title" />
          {CommonCols()}
          <DataTable.Col source="status" />
          <DataTable.Col source="priority" />
          <DataTable.Col source="type" />
          <DataTable.Col source="due_date" label="Due">
            <DueField />
          </DataTable.Col>
          <DataTable.Col label="Links / files">
            <LinksField />
          </DataTable.Col>
        </DataTable>
      </EosListBody>
    </List>
  </div>
);
export const IssueCreate = () => (
  <Create resource="eos_issues" redirect="list" title="New issue">
    <IssueForm />
  </Create>
);
export const IssueEdit = () => (
  <Edit
    resource="eos_issues"
    mutationMode="pessimistic"
    actions={
      <TopToolbar>
        <ArchiveButton resource="eos_issues" />
      </TopToolbar>
    }
  >
    <IssueForm />
  </Edit>
);

/** Read-only view of preserved raw import payload (unknown columns kept as JSON, §4.2). */
const RawPanel = () => {
  const record = useRecordContext();
  if (!record?.raw) return null;
  return (
    <details className="w-full text-xs">
      <summary className="cursor-pointer">
        Imported raw row (read-only, lossless)
      </summary>
      <pre className="overflow-auto max-h-64 bg-muted p-2">
        {JSON.stringify(record.raw, null, 2)}
      </pre>
    </details>
  );
};

export { ExistingAttachments };

export const eosProjects = {
  list: ProjectList,
  create: ProjectCreate,
  edit: ProjectEdit,
  recordRepresentation: "title",
  options: { label: "EOS Projects" },
};
export const eosCommitments = {
  list: CommitmentList,
  create: CommitmentCreate,
  edit: CommitmentEdit,
  recordRepresentation: "title",
  options: { label: "EOS Commitments" },
};
export const eosIssues = {
  list: IssueList,
  create: IssueCreate,
  edit: IssueEdit,
  recordRepresentation: "title",
  options: { label: "EOS Issues" },
};
