import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useGetIdentity,
  useGetList,
  useGetOne,
  useListContext,
  useNotify,
  useRecordContext,
  useStore,
} from "ra-core";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  QUICK_ADD_CONFIRM_MS,
  QUICK_ADD_EVENT,
  QuickAdd,
  type QuickAddCreated,
} from "./QuickAdd";
import { Link } from "react-router";
import { Plus, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { SelectInput } from "@/components/admin/select-input";
import { TopToolbar } from "../layout/TopToolbar";
import { choices, PRIORITIES } from "./constants";
import { CommonCols } from "./EosResources";
import { CompanyInput, DueField, LinksField, OwnerInput } from "./EosShared";
import { EosListBody } from "./EosListBody";
import { EosBulkToolbar } from "./EosBulkActions";
import { COMMITMENT_BULK } from "./bulkFields";
import {
  CLIENT_ACTION_TABS,
  clientActionFilter,
  clientActionsStoreKey,
  HIGHLIGHT_CLASS,
  ptWeekRange,
  type ClientActionTab,
  quickAddVisibleInList,
} from "./clientActions";
import { usePTDate } from "./usePTDate";
import { QuickDirection } from "./QuickDirection";
import { ActionDrawer } from "./ActionDrawer";
import { ClientActionsBoard } from "./ClientActionsBoard";
import {
  clientActionsListKey,
  neighbourIds,
  useClientActionsState,
} from "./clientActionsState";

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
  if (tab === "all") return "Every open action, any owner, newest first.";
  return "Open actions you own.";
};

/**
 * Client Actions list + board + drawer (spec D4 ClientActionsView), shared by
 * /client-actions and the company page Actions tab (U3). With `lockedCompanyId`
 * the account is a permanent filter (ra merges {...filterValues, ...permanent},
 * so the lock wins), the account chip/input are hidden and list params use the
 * per-account store key `client-actions.company.<id>.<tab>` (U4).
 */
export const ClientActionsView = ({
  lockedCompanyId,
}: {
  lockedCompanyId?: string | number | null;
}) => {
  const {
    tab,
    companyId: urlCompanyId,
    unclassified,
    status,
    view,
    item,
    highlight: newId,
    drill,
    params,
    setClientActionsParams,
    openItem,
    replaceItem,
    closeItem,
  } = useClientActionsState();
  const locked = lockedCompanyId != null && lockedCompanyId !== "";
  const companyId = locked ? String(lockedCompanyId) : urlCompanyId;
  // D1: last view choice in ra store; URL wins. Restore from store when URL has no view.
  const [storedView, setStoredView] = useStore<"list" | "board">(
    "client-actions.view",
    "list",
  );
  useEffect(() => {
    // Persist whenever URL view changes.
    if (view !== storedView) setStoredView(view);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps -- store write only on URL change
  useEffect(() => {
    // CE nit 9: read the router's search params (works for hash and browser routers).
    if (!params.get("view") && storedView === "board") {
      setClientActionsParams({ view: "board" });
    }
    // once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // CTO nit: MobileNavigation hides itself while ?item= is set on /client-actions.
  const { identity, isPending: idPending } = useGetIdentity();
  // PT date drives week/overdue bounds; recomputed at PT midnight and on focus.
  const ptDate = usePTDate();
  const filter = useMemo(
    () =>
      clientActionFilter(tab, {
        identityId: identity?.id,
        companyId,
        now: ptNoon(ptDate),
        unclassified,
        status,
      }),
    [tab, identity?.id, companyId, ptDate, unclassified, status],
  );
  // U4: a quick-added row is highlighted from local state, never the URL (the URL
  // highlight remounts the List and pauses saved filters). Only when the new row is
  // hidden by the current filters does the toast's "Show" set ?highlight=.
  const isMobile = useIsMobile();
  const notify = useNotify();
  const [localNew, setLocalNew] = useState<string | null>(null);
  const hl = newId ?? localNew;
  const filterValuesRef = useRef<Record<string, unknown>>({});
  const scopeKey = `${tab}|${companyId}|${unclassified}|${status}|${drill}`;
  useEffect(() => setLocalNew(null), [scopeKey]);
  // CE nit 3: "Show" must actually show the row: tab all, no status/unclassified
  // chip, and drop a URL company_id that conflicts with the saved row's account.
  const showSaved = (rec: QuickAddCreated) =>
    setClientActionsParams({
      tab: "all",
      status: null,
      unclassified: false,
      ...(!locked &&
      urlCompanyId &&
      String(rec.company_id ?? "") !== String(urlCompanyId)
        ? { company_id: null }
        : {}),
      highlight: String(rec.id),
    });
  const showSavedRef = useRef(showSaved);
  showSavedRef.current = showSaved;
  const notifyHidden = useCallback(
    (rec: QuickAddCreated, why: "filters" | "page") =>
      notify(
        <span data-testid="quick-add-hidden-toast" data-why={why}>
          {why === "filters"
            ? "Added, but hidden by the current filters."
            : "Added, but not on this page."}{" "}
          <button
            type="button"
            className="underline font-medium"
            data-testid="quick-add-show"
            onClick={() => showSavedRef.current(rec)}
          >
            Show
          </button>
        </span>,
        { type: "info", autoHideDuration: 8000 },
      ),
    [notify],
  );
  // CE nit 4: the predicate can't see sort/paging, so a "visible" row is confirmed
  // against the ids the list/board actually loaded after the refresh; if it never
  // shows up there, fall back to the "not on this page" hint with Show.
  const pendingNew = useRef<{ rec: QuickAddCreated; timer: number } | null>(
    null,
  );
  useEffect(
    () => () => {
      if (pendingNew.current) window.clearTimeout(pendingNew.current.timer);
    },
    [],
  );
  const onQuickAdded = useCallback(
    (rec: QuickAddCreated) => {
      const visible = quickAddVisibleInList(rec, {
        tab,
        identityId: identity?.id,
        unclassified,
        companyId,
        status,
        filterValues: filterValuesRef.current,
        now: ptNoon(ptDate),
      });
      if (pendingNew.current) {
        window.clearTimeout(pendingNew.current.timer);
        pendingNew.current = null;
      }
      if (!visible) {
        notifyHidden(rec, "filters");
        return;
      }
      setLocalNew(String(rec.id));
      pendingNew.current = {
        rec,
        timer: window.setTimeout(() => {
          if (pendingNew.current?.rec.id !== rec.id) return;
          pendingNew.current = null;
          notifyHidden(rec, "page");
        }, QUICK_ADD_CONFIRM_MS),
      };
    },
    [tab, identity?.id, unclassified, companyId, status, ptDate, notifyHidden],
  );
  // CE nit 5: the phone sheet (MobileNavigation) hands its saves to the mounted view,
  // so phone gets the same highlight / hidden hint as desktop.
  const onQuickAddedRef = useRef(onQuickAdded);
  onQuickAddedRef.current = onQuickAdded;
  useEffect(() => {
    const h = (e: Event) => {
      const rec = (e as CustomEvent<QuickAddCreated>).detail;
      if (!rec?.id) return;
      e.preventDefault(); // tells the sheet a view handled it
      onQuickAddedRef.current(rec);
    };
    window.addEventListener(QUICK_ADD_EVENT, h);
    return () => window.removeEventListener(QUICK_ADD_EVENT, h);
  }, []);
  // Nit A: every list-changing control goes through the single writer, which drops ?highlight=.
  const toggleUnclassified = () =>
    setClientActionsParams({ unclassified: !unclassified });
  const setTab = (t: ClientActionTab) => setClientActionsParams({ tab: t });
  const clearCompany = () => setClientActionsParams({ company_id: null });
  const clearStatus = () => setClientActionsParams({ status: null });
  // Prev/Next come from the loaded page; the drawer itself loads by getOne.
  const [pageIds, setPageIds] = useState<string[]>([]);
  const { prev, next } = neighbourIds(pageIds, item);
  useEffect(() => {
    const p = pendingNew.current;
    if (p && pageIds.includes(String(p.rec.id))) {
      window.clearTimeout(p.timer);
      pendingNew.current = null;
      notify("Client action added", { type: "success" });
    }
  }, [pageIds, notify]);
  const lastItem = useRef<string | null>(null);
  if (item) lastItem.current = item;
  const focusOpener = useCallback(() => {
    const id = lastItem.current;
    if (!id) return true;
    return (
      document.querySelector<HTMLElement>(
        `[data-open-item="${CSS.escape(id)}"]`,
      ) ?? true
    );
  }, []);
  return (
    <div
      className="flex flex-col gap-2 min-w-0"
      data-testid="client-actions-view"
      data-scope={locked ? "company" : "global"}
    >
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
        {companyId && !locked && (
          <CompanyChip id={companyId} onClear={clearCompany} />
        )}
        {drill && (
          // Nit 3: say why the filter bar ignores saved filters on a count drilldown.
          <span
            role="status"
            className="rounded-full border border-dashed px-2 py-0.5 text-xs"
            data-testid="client-actions-drill-hint"
          >
            Showing exactly this count (saved filters paused)
          </span>
        )}
        {view === "list" && status && (
          <StatusChip status={status} onClear={clearStatus} />
        )}
        {tab !== "waiting" && (
          <UnclassifiedChip
            tab={tab}
            identityId={identity?.id}
            companyId={companyId}
            ptDate={ptDate}
            active={unclassified}
            onToggle={toggleUnclassified}
          />
        )}
        <div
          className="inline-flex rounded-md border overflow-hidden"
          role="group"
          aria-label="List or board"
          data-testid="client-actions-view-toggle"
        >
          <button
            type="button"
            aria-pressed={view === "list"}
            data-testid="client-actions-view-list"
            className={`px-3 min-h-11 md:min-h-8 text-sm ${view === "list" ? "bg-primary text-primary-foreground" : ""}`}
            onClick={() => setClientActionsParams({ view: "list" })}
          >
            List
          </button>
          <button
            type="button"
            aria-pressed={view === "board"}
            data-testid="client-actions-view-board"
            className={`px-3 min-h-11 md:min-h-8 text-sm ${view === "board" ? "bg-primary text-primary-foreground" : ""}`}
            onClick={() => setClientActionsParams({ view: "board" })}
          >
            Board
          </button>
        </div>
        {!locked && (
          <Link
            to="/tasks"
            className="ml-auto underline min-h-11 inline-flex items-center"
            data-testid="client-actions-tasks-link"
          >
            Legacy tasks
          </Link>
        )}
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
        <>
          {/* U4: outside the List's remount subtree so a remount never steals focus. Phone
            uses the + button's drawer (MobileNavigation) instead. */}
          {!isMobile && (
            <QuickAdd
              key={`qa-${companyId ?? ""}`}
              companyId={companyId}
              lockedCompanyId={locked ? lockedCompanyId : null}
              boardHint={view === "board"}
              onCreated={onQuickAdded}
            />
          )}
          <List
            // D1: item and view are never in the key, so opening the drawer / toggling view never remounts the List.
            key={clientActionsListKey(
              { tab, companyId, unclassified, status, highlight: newId, drill },
              ptDate,
            )}
            resource="eos_commitments"
            title="Client Actions"
            // With ?highlight= or ?drill=1, ignore this tab's stored filter/sort/page (they beat
            // the props in ra-core): the just-saved row is never hidden (CE 2026-11-08) and a
            // count badge's target list is exactly the badge (U3 CE MF1).
            storeKey={clientActionsStoreKey(
              tab,
              newId,
              locked ? "company" : "global",
              drill,
              locked ? lockedCompanyId : null,
            )}
            disableSyncWithLocation
            filter={filter}
            pagination={view === "board" ? false : undefined}
            perPage={view === "board" ? 1 : undefined}
            filters={[
              <SearchInput source="q" alwaysOn key="q" />,
              ...(companyId
                ? []
                : [
                    <CompanyInput
                      source="company_id"
                      key="company"
                      alwaysOn
                      placeholder="All accounts"
                    />,
                  ]),
              ...(tab === "mine"
                ? []
                : [
                    <OwnerInput
                      source="owner_sales_id"
                      key="owner"
                      alwaysOn
                      placeholder="All owners"
                    />,
                  ]),
              <SelectInput
                source="priority"
                choices={choices(PRIORITIES)}
                key="priority"
                alwaysOn
                // CTO nit (U3): an empty Priority box read as broken.
                emptyText="All priorities"
              />,
            ]}
            sort={
              tab === "all"
                ? { field: "created_at", order: "DESC" }
                : { field: "due_date", order: "ASC" }
            }
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
            {/* CE MF2: only the list reports its page ids; in board view the List runs
              perPage:1 and would clobber the board's ids (Prev/Next). */}
            {view === "list" && <ListIdsReporter onIds={setPageIds} />}
            <FilterValuesReporter target={filterValuesRef} />
            {view === "board" ? (
              <ClientActionsBoard
                highlightId={hl}
                itemId={item}
                onOpenItem={openItem}
                permanentFilter={filter}
                onIds={setPageIds}
                onShowCompletedInList={() =>
                  setClientActionsParams({ view: "list", status: "completed" })
                }
              />
            ) : (
              <EosListBody
                highlightId={hl}
                onOpenItem={openItem}
                bulkFields={COMMITMENT_BULK}
                cardActions={() => (
                  <>
                    <span className="text-muted-foreground">Direction</span>
                    <QuickDirection />
                  </>
                )}
              >
                <DataTable
                  // v1d U1: a row click opens the detail drawer (?item=), not the edit page.
                  rowClick={(id) => {
                    openItem(id);
                    return false;
                  }}
                  rowClassName={(r) =>
                    hl != null && String(r.id) === hl
                      ? `bg-primary/10 font-medium ${HIGHLIGHT_CLASS}`
                      : undefined
                  }
                  bulkActionsToolbar={
                    <EosBulkToolbar fields={COMMITMENT_BULK} />
                  }
                >
                  <DataTable.Col source="title">
                    <OpenItemTitle onOpen={openItem} />
                  </DataTable.Col>
                  {/* U4: scoped to one account, the Account column is noise. */}
                  {locked
                    ? CommonCols().filter((c) => c.key !== "c")
                    : CommonCols()}
                  <DataTable.Col source="status" />
                  <DataTable.Col source="direction" label="Direction">
                    <QuickDirection />
                  </DataTable.Col>
                  <DataTable.Col source="due_date" label="Due">
                    <DueField />
                  </DataTable.Col>
                  <DataTable.Col source="priority" />
                  <DataTable.Col label="Links / files">
                    <LinksField />
                  </DataTable.Col>
                </DataTable>
              </EosListBody>
            )}
          </List>
        </>
      )}
      <ActionDrawer
        item={item}
        onClose={closeItem}
        prevId={prev}
        nextId={next}
        onNavigate={replaceItem}
        finalFocus={focusOpener}
      />
    </div>
  );
};

/** U4: the List's current filter values, read by the quick-add hidden-row check. */
const FilterValuesReporter = ({
  target,
}: {
  target: { current: Record<string, unknown> };
}) => {
  const { filterValues } = useListContext();
  target.current = filterValues ?? {};
  return null;
};

/** Reports the loaded page's ids (Prev/Next) without making the List depend on the drawer. */
const ListIdsReporter = ({ onIds }: { onIds: (ids: string[]) => void }) => {
  const { data } = useListContext();
  const joined = (data ?? []).map((r: any) => String(r.id)).join(",");
  useEffect(() => {
    onIds(joined ? joined.split(",") : []);
  }, [joined, onIds]);
  return null;
};

/** Title cell: a real button, so rows are keyboard-reachable and focus can return here (D3). */
const OpenItemTitle = ({
  onOpen,
}: {
  label?: string;
  onOpen: (id: string | number) => void;
}) => {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <button
      type="button"
      data-open-item={String(record.id)}
      data-testid="client-action-open"
      className="text-left font-medium underline-offset-2 hover:underline min-h-8 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-sm"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(record.id);
      }}
    >
      {record.title}
    </button>
  );
};

const StatusChip = ({
  status,
  onClear,
}: {
  status: string;
  onClear: () => void;
}) => (
  <span
    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-foreground"
    data-testid="client-actions-status"
  >
    Status: {status.replace(/_/g, " ")}
    <button
      type="button"
      aria-label="Clear status filter"
      className="p-1 -m-1 min-h-8 min-w-8 inline-flex items-center justify-center"
      onClick={onClear}
    >
      <X className="size-3" />
    </button>
  </span>
);

/** Count of open, blank-direction rows in the current tab (+ account); toggles the filter. */
const UnclassifiedChip = ({
  tab,
  identityId,
  companyId,
  ptDate,
  active,
  onToggle,
}: {
  tab: ClientActionTab;
  identityId?: string | number | null;
  companyId: string | null;
  ptDate: string;
  active: boolean;
  onToggle: () => void;
}) => {
  const countFilter = clientActionFilter(tab, {
    identityId,
    companyId,
    now: ptNoon(ptDate),
    unclassified: true,
  });
  const { total, isPending, error } = useGetList(
    "eos_commitments",
    {
      filter: countFilter ?? {},
      pagination: { page: 1, perPage: 1 },
      sort: { field: "id", order: "ASC" },
    },
    { enabled: countFilter != null, retry: false },
  );
  if (countFilter == null) return null;
  const n = isPending ? "…" : error ? "?" : String(total ?? 0);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      title="Open actions in this tab (and account) with no direction. Ignores search, owner and priority filters."
      data-testid="client-actions-unclassified"
      data-count={isPending || error ? "" : String(total ?? 0)}
      className={`inline-flex items-center gap-1 rounded-full border px-3 min-h-11 md:min-h-8 text-sm ${active ? "bg-amber-100 border-amber-500 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : (total ?? 0) > 0 ? "border-amber-500 text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
    >
      Unclassified in tab: <b>{n}</b>
      {active && <X className="size-3" aria-hidden />}
    </button>
  );
};

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
