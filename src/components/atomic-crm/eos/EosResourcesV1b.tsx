import type { ReactElement } from "react";
import { BooleanInput } from "@/components/admin/boolean-input";
import { Create } from "@/components/admin/create";
import { DataTable } from "@/components/admin/data-table";
import { DateInput } from "@/components/admin/date-input";
import { Edit } from "@/components/admin/edit";
import { List } from "@/components/admin/list";
import { NumberInput } from "@/components/admin/number-input";
import { SelectInput } from "@/components/admin/select-input";
import { SimpleForm } from "@/components/admin/simple-form";
import { TextInput } from "@/components/admin/text-input";

import { TopToolbar } from "../layout/TopToolbar";
import {
  choices,
  currentQuarter,
  DELIVERABLE_OPEN,
  DELIVERABLE_STATUSES,
  ROCK_STATUSES,
  todayPT,
} from "./constants";
import {
  ArchiveButton,
  CommonCols,
  ListActions,
  required,
} from "./EosResources";
import {
  CompanyInput,
  DueField,
  eosFilters,
  LinksAndFilesInputs,
  LinksField,
  OwnerInput,
  ProjectInput,
  SavedViews,
} from "./EosShared";
import { EosListBody } from "./EosListBody";
import { EosNav } from "./EosNav";

const quarterValidate = (v: any) =>
  /^\d{4}-Q[1-4]$/.test(v ?? "") ? undefined : "Format YYYY-Qn";

// ---------------- Deliverables ----------------
const DeliverableForm = () => (
  <SimpleForm>
    <div className="grid gap-4 md:grid-cols-2 w-full">
      <TextInput source="title" validate={required} />
      <CompanyInput required />
      <ProjectInput required />
      <OwnerInput />
      <SelectInput
        source="status"
        choices={choices(DELIVERABLE_STATUSES)}
        defaultValue="planned"
      />
      <DateInput source="due_date" />
    </div>
    <TextInput source="acceptance_criteria" multiline className="w-full" />
    <TextInput
      source="proof"
      label="Proof / evidence"
      multiline
      className="w-full"
    />
    <p className="text-xs text-muted-foreground">
      Accepting a deliverable never auto-completes a linked commitment.
    </p>
    <LinksAndFilesInputs />
  </SimpleForm>
);
export const DeliverableList = () => (
  <div className="flex flex-col gap-2 min-w-0">
    <EosNav />
    <List
      resource="eos_deliverables"
      title="EOS · Deliverables"
      filters={eosFilters({ statuses: DELIVERABLE_STATUSES, due: true })}
      filter={{ "archived_at@is": null }}
      sort={{ field: "due_date", order: "ASC" }}
      actions={<ListActions label="New deliverable" />}
    >
      <SavedViews openStatuses={DELIVERABLE_OPEN} hasDue />
      <EosListBody>
        <DataTable rowClick="edit" bulkActionButtons={false}>
          <DataTable.Col source="title" />
          {CommonCols()}
          <DataTable.Col source="status" />
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

// ---------------- Rocks ----------------
const RockForm = () => (
  <SimpleForm>
    <div className="grid gap-4 md:grid-cols-2 w-full">
      <TextInput source="title" validate={required} />
      <CompanyInput required />
      <ProjectInput />
      <OwnerInput />
      <TextInput
        source="quarter"
        validate={quarterValidate}
        defaultValue={currentQuarter(todayPT())}
        helperText="YYYY-Qn"
      />
      <SelectInput
        source="status"
        label="Health"
        choices={choices(ROCK_STATUSES)}
        defaultValue="on_track"
      />
      <DateInput source="start_date" />
      <DateInput source="end_date" />
    </div>
    <TextInput source="success_measure" className="w-full" />
    <TextInput
      source="rationale"
      label="Health rationale"
      multiline
      className="w-full"
    />
    <LinksAndFilesInputs />
  </SimpleForm>
);
export const RockList = () => (
  <div className="flex flex-col gap-2 min-w-0">
    <EosNav />
    <List
      resource="eos_rocks"
      title="EOS · Rocks"
      filters={[
        ...eosFilters({ statuses: ROCK_STATUSES }),
        <TextInput source="quarter" key="quarter" label="Quarter" alwaysOn />,
      ]}
      filter={{ "archived_at@is": null }}
      sort={{ field: "quarter", order: "DESC" }}
      actions={<ListActions label="New rock" />}
    >
      <SavedViews openStatuses={["on_track", "off_track"]} />
      <EosListBody dateSource={null}>
        <DataTable rowClick="edit" bulkActionButtons={false}>
          <DataTable.Col source="title" />
          {CommonCols()}
          <DataTable.Col source="quarter" />
          <DataTable.Col source="status" label="Health" />
          <DataTable.Col source="success_measure" />
        </DataTable>
      </EosListBody>
    </List>
  </div>
);

// ---------------- Scorecard metrics ----------------
const MetricForm = () => (
  <SimpleForm>
    <div className="grid gap-4 md:grid-cols-2 w-full">
      <TextInput source="name" validate={required} />
      <CompanyInput required />
      <ProjectInput />
      <OwnerInput />
      <TextInput source="unit" />
      <SelectInput
        source="comparator"
        choices={[">=", "<=", "="].map((id) => ({ id, name: id }))}
        defaultValue=">="
      />
      <NumberInput source="target" />
      <BooleanInput source="active" defaultValue />
    </div>
  </SimpleForm>
);
export const MetricList = () => (
  <div className="flex flex-col gap-2 min-w-0">
    <EosNav />
    <List
      resource="eos_scorecard_metrics"
      title="EOS · Scorecard measurables"
      filter={{ "archived_at@is": null }}
      sort={{ field: "name", order: "ASC" }}
      actions={<ListActions label="New measurable" />}
    >
      <EosListBody
        dateSource={null}
        extra={(r) => (
          <span>
            {r.comparator} {r.target} {r.unit}
          </span>
        )}
      >
        <DataTable rowClick="edit" bulkActionButtons={false}>
          <DataTable.Col source="name" />
          {CommonCols()}
          <DataTable.Col source="comparator" />
          <DataTable.Col source="target" />
          <DataTable.Col source="unit" />
        </DataTable>
      </EosListBody>
    </List>
  </div>
);

const editFor = (resource: string, Form: () => ReactElement) => () => (
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
);
const createFor = (resource: string, Form: () => ReactElement) => () => (
  <Create resource={resource} redirect="edit">
    <Form />
  </Create>
);

export const eosDeliverables = {
  list: DeliverableList,
  create: createFor("eos_deliverables", DeliverableForm),
  edit: editFor("eos_deliverables", DeliverableForm),
  recordRepresentation: "title",
  options: { label: "EOS Deliverables" },
};
export const eosRocks = {
  list: RockList,
  create: createFor("eos_rocks", RockForm),
  edit: editFor("eos_rocks", RockForm),
  recordRepresentation: "title",
  options: { label: "EOS Rocks" },
};
export const eosMetrics = {
  list: MetricList,
  create: createFor("eos_scorecard_metrics", MetricForm),
  edit: editFor("eos_scorecard_metrics", MetricForm),
  recordRepresentation: "name",
  options: { label: "EOS Scorecard" },
};
