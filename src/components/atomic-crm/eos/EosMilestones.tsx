import { useGetList, useRecordContext } from "ra-core";
import { useWatch } from "react-hook-form";
import { Link } from "react-router";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
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
import { TextInput } from "@/components/admin/text-input";
import { Badge } from "@/components/ui/badge";
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

export const MILESTONE_STATUSES = [
  "planned",
  "in_progress",
  "done",
  "missed",
  "cancelled",
];

/** Parent project picker: top-level projects of the same account only (max two levels). */
export const ParentProjectInput = () => {
  const companyId = useWatch({ name: "company_id" });
  const record = useRecordContext();
  return (
    <ReferenceInput
      source="parent_project_id"
      reference="eos_projects"
      filter={{
        "archived_at@is": null,
        "parent_project_id@is": null,
        ...(companyId ? { company_id: companyId } : {}),
        ...(record?.id ? { "id@neq": record.id } : {}),
      }}
      sort={{ field: "title", order: "ASC" }}
    >
      <AutocompleteInput label="Parent project (optional)" optionText="title" />
    </ReferenceInput>
  );
};

/** On a project's edit page: its sub-projects and milestones. */
export const ProjectChildren = () => {
  const record = useRecordContext();
  const id = record?.id;
  const { data: subs } = useGetList(
    "eos_projects",
    {
      pagination: { page: 1, perPage: 50 },
      sort: { field: "title", order: "ASC" },
      filter: { parent_project_id: id, "archived_at@is": null },
    },
    { enabled: !!id },
  );
  const { data: ms } = useGetList(
    "eos_milestones",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "sort_order", order: "ASC" },
      filter: { project_id: id, "archived_at@is": null },
    },
    { enabled: !!id },
  );
  if (!id) return null;
  const src = (o: object) => encodeURIComponent(JSON.stringify(o));
  return (
    <div
      className="grid gap-4 md:grid-cols-2 w-full"
      data-testid="eos-project-children"
    >
      <div className="min-w-0">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold">Milestones ({ms?.length ?? 0})</h3>
          <Link
            className="text-sm underline"
            to={`/eos_milestones/create?source=${src({ project_id: id, company_id: record.company_id })}`}
          >
            + Milestone
          </Link>
        </div>
        <ol className="mt-1 flex flex-col gap-1 text-sm">
          {(ms ?? []).map((m: any) => (
            <li key={m.id} className="flex justify-between gap-2">
              <Link to={`/eos_milestones/${m.id}`} className="break-words">
                {m.title}
              </Link>
              <span className="flex gap-1 shrink-0 items-center">
                <Badge
                  variant={
                    m.status === "missed"
                      ? "destructive"
                      : m.status === "done"
                        ? "default"
                        : "outline"
                  }
                >
                  {m.status.replace(/_/g, " ")}
                </Badge>
                <span className="text-muted-foreground">
                  {m.due_date ?? ""}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      {!record.parent_project_id && (
        <div className="min-w-0">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">
              Sub-projects ({subs?.length ?? 0})
            </h3>
            <Link
              className="text-sm underline"
              to={`/eos_projects/create?source=${src({ parent_project_id: id, company_id: record.company_id })}`}
            >
              + Sub-project
            </Link>
          </div>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {(subs ?? []).map((p: any) => (
              <li key={p.id} className="flex justify-between gap-2">
                <Link to={`/eos_projects/${p.id}`} className="break-words">
                  {p.title}
                </Link>
                <Badge variant="outline">{p.status.replace(/_/g, " ")}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const MilestoneForm = () => (
  <SimpleForm>
    <div className="grid gap-4 md:grid-cols-2 w-full">
      <TextInput source="title" validate={required} />
      <CompanyInput required />
      <ProjectInput required />
      <SelectInput
        source="status"
        choices={choices(MILESTONE_STATUSES)}
        defaultValue="planned"
      />
      <DateInput source="due_date" />
      <OwnerInput />
      <NumberInput source="sort_order" label="Order" />
    </div>
    <TextInput source="notes" multiline className="w-full" />
  </SimpleForm>
);

const MilestoneList = () => (
  <div className="flex flex-col gap-2">
    <EosNav />
    <List
      resource="eos_milestones"
      title="EOS · Milestones"
      filter={{ "archived_at@is": null }}
      sort={{ field: "due_date", order: "ASC" }}
      actions={<ListActions label="New milestone" />}
    >
      <EosListBody>
        <DataTable rowClick="edit" bulkActionButtons={false}>
          <DataTable.Col source="title" />
          {CommonCols()}
          <DataTable.Col source="project_id" label="Project">
            <ReferenceField
              source="project_id"
              reference="eos_projects"
              link={false}
            />
          </DataTable.Col>
          <DataTable.Col source="status" />
          <DataTable.Col source="due_date" label="Due" />
        </DataTable>
      </EosListBody>
    </List>
  </div>
);

export const eosMilestones = {
  list: MilestoneList,
  create: () => (
    <Create resource="eos_milestones" redirect="list">
      <MilestoneForm />
    </Create>
  ),
  edit: () => (
    <Edit
      resource="eos_milestones"
      mutationMode="pessimistic"
      actions={
        <TopToolbar>
          <ArchiveButton resource="eos_milestones" />
        </TopToolbar>
      }
    >
      <MilestoneForm />
    </Edit>
  ),
  recordRepresentation: "title",
  options: { label: "EOS Milestones" },
};
