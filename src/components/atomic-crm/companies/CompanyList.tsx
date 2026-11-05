import { useGetIdentity, useListContext, useTranslate } from "ra-core";
import { CreateButton } from "@/components/admin/create-button";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { ListPagination } from "@/components/admin/list-pagination";
import { SortButton } from "@/components/admin/sort-button";

import { DataImportButton } from "../dataImport/DataImportButton";
import { TopToolbar } from "../layout/TopToolbar";
import { CompanyEmpty } from "./CompanyEmpty";
import { CompanyListFilter } from "./CompanyListFilter";
import { ImageList } from "./GridList";
import { RelationshipTabs } from "./CompanyRelationship";
import { EosBulkToolbar } from "../eos/EosBulkActions";
import { useConfigurationContext } from "../root/ConfigurationContext";

/** Bulk edit on Companies (Eddie 2:18 PT): relationship + account manager. No delete/archive here. */
const CompanyBulkToolbar = () => {
  const { companyRelationships } = useConfigurationContext();
  return (
    <EosBulkToolbar
      archivable={false}
      fields={[
        {
          key: "relationship",
          label: "Relationship",
          source: "relationship",
          kind: "select",
          options: companyRelationships.map((r) => r.value),
          optionLabels: Object.fromEntries(
            companyRelationships.map((r) => [r.value, r.label]),
          ),
        },
        {
          key: "owner",
          label: "Account manager",
          source: "sales_id",
          kind: "owner",
        },
      ]}
    />
  );
};

export const CompanyList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;
  return (
    <List
      title={false}
      perPage={25}
      sort={{ field: "name", order: "ASC" }}
      actions={<CompanyListActions />}
      pagination={<ListPagination rowsPerPageOptions={[10, 25, 50, 100]} />}
    >
      <CompanyListLayout />
    </List>
  );
};

const CompanyListLayout = () => {
  const { data, isPending, filterValues } = useListContext();
  const hasFilters = filterValues && Object.keys(filterValues).length > 0;

  if (isPending) return null;
  if (!data?.length && !hasFilters) return <CompanyEmpty />;

  return (
    <div className="w-full flex flex-row gap-8">
      <CompanyListFilter />
      <div className="flex flex-col flex-1 gap-4 min-w-0">
        <RelationshipTabs />
        <ImageList />
      </div>
      <CompanyBulkToolbar />
    </div>
  );
};

const CompanyListActions = () => {
  const translate = useTranslate();
  return (
    <TopToolbar>
      <SortButton fields={["name", "created_at", "nb_contacts"]} />
      <DataImportButton resource="companies" />
      <ExportButton />
      <CreateButton
        label={translate("resources.companies.action.new", {
          _: "New Company",
        })}
      />
    </TopToolbar>
  );
};
