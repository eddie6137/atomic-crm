import {
  useGetIdentity,
  useListContext,
  useNotify,
  useRecordContext,
} from "ra-core";
import { useWatch } from "react-hook-form";
import { Paperclip, Link as LinkIcon } from "lucide-react";
import { ArrayInput } from "@/components/admin/array-input";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { FileInput } from "@/components/admin/file-input";
import { FileField } from "@/components/admin/file-field";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SearchInput } from "@/components/admin/search-input";
import { SelectInput } from "@/components/admin/select-input";
import { SimpleFormIterator } from "@/components/admin/simple-form-iterator";
import { TextInput } from "@/components/admin/text-input";
import { DateInput } from "@/components/admin/date-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { openSignedAttachment, type EosAttachment } from "./attachments";
import { choices, inFilter, PRIORITIES, todayPT } from "./constants";
import { linkKind, validateHttpsUrl, type EosLink } from "./links";

const saleName = (c: any) => (c ? `${c.first_name} ${c.last_name}` : "");

export const CompanyInput = ({
  source = "company_id",
  required,
  alwaysOn,
}: {
  source?: string;
  required?: boolean;
  alwaysOn?: boolean;
  label?: string;
}) => (
  <ReferenceInput
    source={source}
    reference="companies"
    sort={{ field: "name", order: "ASC" }}
  >
    <AutocompleteInput
      label="Account"
      optionText="name"
      // UAT 2026-11-08: the closed field read "Search", which looked like an empty
      // search box rather than an account picker. Filters (alwaysOn) mean "any".
      placeholder={alwaysOn ? "All accounts" : "Select an account"}
      validate={required ? (v: any) => (v ? undefined : "Required") : undefined}
    />
  </ReferenceInput>
);

export const OwnerInput = ({
  source = "owner_sales_id",
  alwaysOn,
}: {
  source?: string;
  alwaysOn?: boolean;
  label?: string;
}) => (
  <ReferenceInput
    source={source}
    reference="sales"
    filter={{ "disabled@neq": true }}
    sort={{ field: "last_name", order: "ASC" }}
  >
    <AutocompleteInput
      label="Owner"
      optionText={saleName}
      placeholder={alwaysOn ? "All owners" : "Select an owner"}
    />
  </ReferenceInput>
);

export const ProjectInput = ({
  source = "project_id",
  required,
}: {
  source?: string;
  required?: boolean;
}) => {
  const companyId = useWatch({ name: "company_id" });
  return (
    <ReferenceInput
      source={source}
      reference="eos_projects"
      filter={
        companyId
          ? { company_id: companyId, "archived_at@is": null }
          : { "archived_at@is": null }
      }
      sort={{ field: "title", order: "ASC" }}
    >
      <AutocompleteInput
        label="Project"
        optionText="title"
        placeholder="Select a project"
        validate={
          required ? (v: any) => (v ? undefined : "Required") : undefined
        }
      />
    </ReferenceInput>
  );
};

/** List filters shared by EOS resources (owner, account, status, due/overdue, priority, type). */
export const eosFilters = (opts: {
  statuses: string[];
  priority?: boolean;
  type?: boolean;
  due?: boolean;
}) => {
  const f = [
    <SearchInput source="q" alwaysOn key="q" />,
    <CompanyInput source="company_id" key="company" alwaysOn />,
    <OwnerInput source="owner_sales_id" key="owner" alwaysOn />,
    <SelectInput
      source="status"
      choices={choices(opts.statuses)}
      key="status"
      alwaysOn
    />,
  ];
  if (opts.priority)
    f.push(
      <SelectInput
        source="priority"
        choices={choices(PRIORITIES)}
        key="priority"
        alwaysOn
      />,
    );
  if (opts.type) f.push(<TextInput source="type" key="type" label="Type" />);
  if (opts.due) {
    f.push(
      <DateInput source="due_date@lte" key="due_lte" label="Due on/before" />,
    );
    f.push(
      <DateInput source="due_date@gte" key="due_gte" label="Due on/after" />,
    );
  }
  return f;
};

/** Saved views (§3): My open, Overdue, By account. */
export const SavedViews = ({
  openStatuses,
  hasDue,
}: {
  openStatuses: string[];
  hasDue?: boolean;
}) => {
  const { setFilters, setSort, filterValues } = useListContext();
  const { identity } = useGetIdentity();
  const base = { "archived_at@is": null };
  const views = [
    {
      key: "all",
      label: "All active",
      filters: {} as any,
      sort: { field: "created_at", order: "DESC" },
    },
    {
      key: "mine",
      label: "My open",
      filters: {
        owner_sales_id: identity?.id,
        "status@in": inFilter(openStatuses),
      },
      sort: { field: hasDue ? "due_date" : "created_at", order: "ASC" },
    },
    ...(hasDue
      ? [
          {
            key: "overdue",
            label: "Overdue",
            filters: {
              "status@in": inFilter(openStatuses),
              "due_date@lt": todayPT(),
            },
            sort: { field: "due_date", order: "ASC" },
          },
        ]
      : []),
    {
      key: "account",
      label: "By account",
      filters: { "status@in": inFilter(openStatuses) },
      sort: { field: "company_id", order: "ASC" },
    },
    {
      key: "review",
      label: "Needs review",
      filters: { needs_review: true },
      sort: { field: "created_at", order: "DESC" },
    },
  ];
  return (
    <div className="flex flex-wrap gap-2 py-2" data-testid="eos-saved-views">
      {views.map((v) => (
        <Button
          key={v.key}
          size="sm"
          variant={
            JSON.stringify(filterValues) === JSON.stringify({ ...v.filters })
              ? "default"
              : "outline"
          }
          onClick={() => {
            setFilters({ ...v.filters }, {});
            setSort(v.sort as any);
          }}
        >
          {v.label}
        </Button>
      ))}
      <span className="hidden">{JSON.stringify(base)}</span>
    </div>
  );
};

export const LinksAndFilesInputs = () => (
  <div className="flex flex-col gap-4">
    <ArrayInput source="links" label="Links (Drive / Slack / other https)">
      <SimpleFormIterator inline>
        <TextInput source="url" label="URL" validate={validateHttpsUrl} />
        <TextInput source="label" label="Label" />
      </SimpleFormIterator>
    </ArrayInput>
    <ExistingAttachments editable />
    <FileInput
      source="new_files"
      label="Upload files (private, max 10 MiB each)"
      multiple
    >
      <FileField source="src" title="title" />
    </FileInput>
  </div>
);

export const ExistingAttachments = ({ editable }: { editable?: boolean }) => {
  const record = useRecordContext();
  const notify = useNotify();
  const atts: EosAttachment[] = record?.attachments ?? [];
  if (!atts.length)
    return editable ? null : (
      <span className="text-muted-foreground text-sm">No files</span>
    );
  return (
    <div className="flex flex-col gap-1" data-testid="eos-attachments">
      <span className="text-sm font-medium">Files</span>
      {atts.map((a) => (
        <button
          type="button"
          key={a.path}
          className="flex items-center gap-2 text-sm text-left underline"
          onClick={() =>
            openSignedAttachment(a.path, a.bucket).catch((e) =>
              notify(e.message, { type: "error" }),
            )
          }
        >
          <Paperclip className="h-4 w-4" /> {a.title}
        </button>
      ))}
    </div>
  );
};

export const LinksField = (_: { label?: string }) => {
  const record = useRecordContext();
  const links: EosLink[] = record?.links ?? [];
  const n = (record?.attachments ?? []).length;
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {links.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <Badge variant="outline" className="gap-1">
            <LinkIcon className="h-3 w-3" />
            {l.label || linkKind(l.url)}
          </Badge>
        </a>
      ))}
      {n > 0 && (
        <Badge variant="secondary" className="gap-1">
          <Paperclip className="h-3 w-3" />
          {n}
        </Badge>
      )}
    </div>
  );
};

export const DueField = (_: { label?: string; source?: string }) => {
  const record = useRecordContext();
  if (!record?.due_date)
    return (
      <span className="text-muted-foreground">{record?.due_text || "—"}</span>
    );
  const overdue =
    record.due_date < todayPT() &&
    ![
      "completed",
      "done",
      "missed",
      "superseded",
      "cancelled",
      "lapsed",
      "solved",
      "dropped",
    ].includes(record.status);
  return (
    <span className={overdue ? "text-red-600 font-medium" : ""}>
      {record.due_date}
      {overdue ? " (overdue)" : ""}
    </span>
  );
};
