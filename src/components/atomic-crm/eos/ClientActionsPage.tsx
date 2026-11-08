import { useMemo, useState } from "react";
import { useGetIdentity, useGetList, useGetOne } from "ra-core";
import { Link, useSearchParams } from "react-router";
import { Plus, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { SelectInput } from "@/components/admin/select-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TopToolbar } from "../layout/TopToolbar";
import { choices, PRIORITIES } from "./constants";
import { CommonCols } from "./EosResources";
import { CompanyInput, DueField, LinksField, OwnerInput } from "./EosShared";
import { EosListBody } from "./EosListBody";
import { EosNav } from "./EosNav";
import { EosBulkToolbar } from "./EosBulkActions";
import { COMMITMENT_BULK } from "./bulkFields";
import {
  activeActionFilter,
  CLIENT_ACTION_TABS,
  CLIENT_ACTIONS_PATH,
  clientActionFilter,
  clientActionsLink,
  isClientActionTab,
  ptWeekRange,
  type ClientActionTab,
} from "./clientActions";
import { usePTDate } from "./usePTDate";

/** Noon PT-ish instant for a PT date string (safe for date math on any DST day). */
const ptNoon = (d: string) => new Date(`${d}T20:00:00Z`);

const tabHint = (tab: ClientActionTab, ptDate: string) => {
  if (tab === "week") {
    const { start, end } = ptWeekRange(ptNoon(ptDate));
    return `Due Mon ${start} – Sun ${end} (Pacific).`;
  }
  if (tab === "overdue")
    return `Due before ${ptDate} (Pacific). No due date is not overdue.`;
  if (tab === "waiting") return "Direction = from client (the client owes us).";
  return "Open actions you own.";
};

/** Client Actions: a thin view over existing eos_commitments (manual entry only). */
export const ClientActionsPage = () => {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab");
  const tab: ClientActionTab = isClientActionTab(rawTab) ? rawTab : "mine";
  const companyId = params.get("company_id");
  const { identity, isPending: idPending } = useGetIdentity();
  // PT date drives week/overdue bounds; recomputed at PT midnight and on focus.
  const ptDate = usePTDate();
  const filter = useMemo(
    () =>
      clientActionFilter(tab, {
        identityId: identity?.id,
        companyId,
        now: ptNoon(ptDate),
      }),
    [tab, identity?.id, companyId, ptDate],
  );
  const setTab = (t: ClientActionTab) => {
    const p = new URLSearchParams(params);
    p.set("tab", t);
    setParams(p, { replace: true });
  };
  const clearCompany = () => {
    const p = new URLSearchParams(params);
    p.delete("company_id");
    setParams(p, { replace: true });
  };
  return (
    <div
      className="flex flex-col gap-2 p-2 min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-2"
      data-testid="client-actions"
    >
      <EosNav />
      <PortfolioRollup />
      <div
        role="tablist"
        aria-label="Client action views"
        className="flex gap-1 overflow-x-auto border-b sticky top-0 z-10 bg-background"
        data-testid="client-actions-tabs"
      >
        {CLIENT_ACTION_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 min-h-11 text-sm whitespace-nowrap border-b-2 ${tab === t.id ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{tabHint(tab, ptDate)}</span>
        {companyId && <CompanyChip id={companyId} onClear={clearCompany} />}
        <Link
          to="/tasks"
          className="ml-auto underline min-h-11 inline-flex items-center"
          data-testid="client-actions-tasks-link"
        >
          Legacy tasks
        </Link>
      </div>
      {filter == null ? (
        <p
          className="text-sm text-muted-foreground p-2"
          data-testid="client-actions-loading"
        >
          {idPending
            ? "Resolving your identity…"
            : "Could not resolve your identity, so My actions is unavailable."}
        </p>
      ) : (
        <List
          key={`${tab}:${companyId ?? ""}:${ptDate}`}
          resource="eos_commitments"
          title="Client Actions"
          storeKey={`client-actions.${tab}`}
          disableSyncWithLocation
          filter={filter}
          filters={[
            <SearchInput source="q" alwaysOn key="q" />,
            ...(companyId
              ? []
              : [<CompanyInput source="company_id" key="company" alwaysOn />]),
            ...(tab === "mine"
              ? []
              : [<OwnerInput source="owner_sales_id" key="owner" alwaysOn />]),
            <SelectInput
              source="priority"
              choices={choices(PRIORITIES)}
              key="priority"
              alwaysOn
            />,
          ]}
          sort={{ field: "due_date", order: "ASC" }}
          actions={
            <TopToolbar>
              <Link
                to={
                  companyId
                    ? `/eos_commitments/create?source=${encodeURIComponent(JSON.stringify({ company_id: Number(companyId) || companyId }))}`
                    : "/eos_commitments/create"
                }
                className={buttonVariants({ size: "sm" })}
                data-testid="client-actions-new"
              >
                <Plus className="size-4" /> New action
              </Link>
            </TopToolbar>
          }
        >
          <EosListBody bulkFields={COMMITMENT_BULK}>
            <DataTable
              rowClick="edit"
              bulkActionsToolbar={<EosBulkToolbar fields={COMMITMENT_BULK} />}
            >
              <DataTable.Col source="title" />
              {CommonCols()}
              <DataTable.Col source="status" />
              <DataTable.Col source="direction" />
              <DataTable.Col source="due_date" label="Due">
                <DueField />
              </DataTable.Col>
              <DataTable.Col source="priority" />
              <DataTable.Col label="Links / files">
                <LinksField />
              </DataTable.Col>
            </DataTable>
          </EosListBody>
        </List>
      )}
    </div>
  );
};
ClientActionsPage.path = CLIENT_ACTIONS_PATH;

const CompanyChip = ({ id, onClear }: { id: string; onClear: () => void }) => {
  const { data } = useGetOne("companies", { id }, { retry: false });
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-foreground"
      data-testid="client-actions-company"
    >
      Account: {data?.name ?? `#${id}`}
      <button
        type="button"
        aria-label="Clear account filter"
        className="p-1 -m-1"
        onClick={onClear}
      >
        <X className="size-3" />
      </button>
    </span>
  );
};

/** Portfolio rollup: one eos_account_summary request (no N+1); open/overdue counts are authoritative per account. */
export const PortfolioRollup = () => {
  const [showAll, setShowAll] = useState(false);
  const { data, total, isPending, error } = useGetList(
    "eos_account_summary",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "name", order: "ASC" },
    },
    { retry: false },
  );
  const rows = (data ?? [])
    .filter((a: any) => (a.open_commitments ?? 0) > 0)
    .sort(
      (a: any, b: any) =>
        (b.overdue_commitments ?? 0) - (a.overdue_commitments ?? 0) ||
        (b.open_commitments ?? 0) - (a.open_commitments ?? 0),
    );
  const open = rows.reduce(
    (s: number, a: any) => s + (a.open_commitments ?? 0),
    0,
  );
  const overdue = rows.reduce(
    (s: number, a: any) => s + (a.overdue_commitments ?? 0),
    0,
  );
  const loaded = data?.length ?? 0;
  const shown = showAll ? rows : rows.slice(0, 5);
  return (
    <Card data-testid="client-actions-portfolio" className="gap-2 py-3">
      <CardHeader className="px-3">
        <CardTitle className="text-base flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span>Portfolio</span>
          {isPending ? (
            <span className="text-sm font-normal text-muted-foreground">
              Loading…
            </span>
          ) : error ? (
            <span className="text-sm font-normal text-red-600">
              Could not load summary
            </span>
          ) : (
            <span className="text-sm font-normal text-muted-foreground">
              <b className="text-foreground">{open}</b> open ·{" "}
              <b className="text-red-600">{overdue}</b> overdue across{" "}
              {rows.length} account{rows.length === 1 ? "" : "s"}
              {total != null && total > loaded
                ? ` (first ${loaded} of ${total} accounts loaded)`
                : ""}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      {!isPending && !error && rows.length > 0 && (
        <CardContent className="px-3">
          <ul className="flex flex-col divide-y text-sm">
            {shown.map((a: any) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 py-1.5 min-w-0"
              >
                <Link
                  to={`/companies/${a.id}/show/eos`}
                  className="break-words min-w-0"
                >
                  {a.name}
                </Link>
                <span className="flex gap-3 shrink-0">
                  <Link
                    to={clientActionsLink("overdue", a.id)}
                    className={
                      a.overdue_commitments
                        ? "text-red-600 font-medium"
                        : "text-muted-foreground"
                    }
                  >
                    {a.overdue_commitments ?? 0} overdue
                  </Link>
                  <Link
                    to={`/eos_commitments?filter=${encodeURIComponent(JSON.stringify({ company_id: a.id, ...activeActionFilter() }))}`}
                    className="text-muted-foreground"
                  >
                    {a.open_commitments ?? 0} open
                  </Link>
                </span>
              </li>
            ))}
          </ul>
          {rows.length > 5 && (
            <button
              type="button"
              className="text-sm underline mt-1 min-h-11"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Show fewer" : `Show all ${rows.length} accounts`}
            </button>
          )}
        </CardContent>
      )}
    </Card>
  );
};
