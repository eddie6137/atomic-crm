// Client Actions v1d (spec §2 D1/D2): one URL state shape and one in-page writer.
// Pure helpers (tested) plus a thin hook over react-router's search params.
import { useCallback, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { COMMITMENT_STATUSES } from "./constants";
import {
  DEFAULT_CLIENT_ACTION_TAB,
  isClientActionTab,
  type ClientActionTab,
} from "./clientActions";

export type ClientActionsView = "list" | "board";

export type ClientActionsState = {
  tab: ClientActionTab;
  companyId: string | null;
  unclassified: boolean;
  /** One commitment status; replaces the open set (list view only, D1/N2). */
  status: string | null;
  view: ClientActionsView;
  /** Record shown in the detail drawer. */
  item: string | null;
  highlight: string | null;
};

const isStatus = (v: unknown): v is string =>
  typeof v === "string" && COMMITMENT_STATUSES.includes(v);

/** Parse the D1 query string. Unknown values fall back to safe defaults. */
export const parseClientActionsParams = (
  params: URLSearchParams,
): ClientActionsState => {
  const rawTab = params.get("tab");
  const tab = isClientActionTab(rawTab) ? rawTab : DEFAULT_CLIENT_ACTION_TAB;
  const view: ClientActionsView =
    params.get("view") === "board" ? "board" : "list";
  const rawStatus = params.get("status");
  return {
    tab,
    companyId: params.get("company_id") || null,
    unclassified: params.get("unclassified") === "1" && tab !== "waiting",
    // The board ignores the status chip (N2).
    status: view === "list" && isStatus(rawStatus) ? rawStatus : null,
    view,
    item: params.get("item") || null,
    highlight: params.get("highlight") || null,
  };
};

export type ClientActionsPatch = {
  tab?: ClientActionTab;
  company_id?: string | null;
  unclassified?: boolean;
  status?: string | null;
  view?: ClientActionsView;
  item?: string | null;
  highlight?: string | null;
};

/** Keys whose change drops `highlight` (nit A): they all change what the list shows. */
const HIGHLIGHT_DROPPING_KEYS = [
  "tab",
  "company_id",
  "unclassified",
  "status",
  "view",
] as const;

/**
 * The single in-page writer (D1, nit A). Returns a new URLSearchParams.
 * - tab / unclassified / clear-company / status / view changes drop `highlight`, which flips
 *   storeKey back to the tab's stored params (intended: the filter bar snaps to saved filters).
 * - Switching to the board also drops `status` (N2).
 * - `item` changes never drop anything (the drawer must not remount the List).
 */
export const patchClientActionsParams = (
  current: URLSearchParams,
  patch: ClientActionsPatch,
): URLSearchParams => {
  const p = new URLSearchParams(current);
  const before = parseClientActionsParams(current);
  const setOrDelete = (k: string, v: string | null | undefined) => {
    if (v == null || v === "") p.delete(k);
    else p.set(k, v);
  };
  if ("tab" in patch && patch.tab) p.set("tab", patch.tab);
  if ("company_id" in patch) setOrDelete("company_id", patch.company_id);
  if ("unclassified" in patch)
    setOrDelete("unclassified", patch.unclassified ? "1" : null);
  if ("status" in patch)
    setOrDelete("status", isStatus(patch.status) ? patch.status : null);
  if ("view" in patch)
    setOrDelete("view", patch.view === "board" ? "board" : "list");
  if ("item" in patch) setOrDelete("item", patch.item);
  if ("highlight" in patch) setOrDelete("highlight", patch.highlight);

  const after = parseClientActionsParams(p);
  const changed = HIGHLIGHT_DROPPING_KEYS.some((k) => {
    if (!(k in patch)) return false;
    switch (k) {
      case "tab":
        return after.tab !== before.tab;
      case "company_id":
        return after.companyId !== before.companyId;
      case "unclassified":
        return (
          (current.get("unclassified") === "1") !==
          (p.get("unclassified") === "1")
        );
      case "status":
        return (current.get("status") ?? null) !== (p.get("status") ?? null);
      case "view":
        return after.view !== before.view;
    }
  });
  if (changed && !("highlight" in patch)) p.delete("highlight");
  if (after.view === "board") p.delete("status");
  return p;
};

/** List remount key (D1): never includes `item` or `view`. */
export const clientActionsListKey = (
  s: Pick<
    ClientActionsState,
    "tab" | "companyId" | "unclassified" | "status" | "highlight"
  >,
  ptDate: string,
) =>
  [
    s.tab,
    s.companyId ?? "",
    ptDate,
    s.unclassified ? "u" : "",
    s.status ?? "",
    s.highlight ?? "",
  ].join(":");

/** Prev/Next ids around `item` on the loaded page; null when not on the page or at an end. */
export const neighbourIds = (
  ids: ReadonlyArray<string | number>,
  item: string | null,
) => {
  const i = item == null ? -1 : ids.findIndex((x) => String(x) === item);
  if (i < 0) return { prev: null, next: null, index: -1 };
  return {
    prev: i > 0 ? String(ids[i - 1]) : null,
    next: i < ids.length - 1 ? String(ids[i + 1]) : null,
    index: i,
  };
};

type DrawerHistoryState = { clientActionsDrawer?: boolean } | null;

/**
 * Hook over the URL: parsed state, the single writer, and drawer navigation.
 * First open pushes (so Back closes), Prev/Next replace, close pops when we pushed.
 */
export const useClientActionsState = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = useMemo(() => parseClientActionsParams(params), [params]);
  const pushedByUs = !!(location.state as DrawerHistoryState)
    ?.clientActionsDrawer;

  const go = useCallback(
    (
      next: URLSearchParams,
      opts: { replace: boolean; drawer?: boolean } = { replace: true },
    ) =>
      navigate(
        { pathname: location.pathname, search: `?${next.toString()}` },
        {
          replace: opts.replace,
          state: opts.drawer ? { clientActionsDrawer: true } : null,
        },
      ),
    [navigate, location.pathname],
  );

  const setClientActionsParams = useCallback(
    (patch: ClientActionsPatch) =>
      go(patchClientActionsParams(params, patch), {
        replace: true,
        // Only a pure item swap keeps the "we pushed" marker; any list change makes
        // the next close a replace, so Back never restores an older tab.
        drawer:
          Object.keys(patch).every((k) => k === "item") &&
          !!patch.item &&
          pushedByUs,
      }),
    [go, params, pushedByUs],
  );

  const openItem = useCallback(
    (id: string | number) => {
      const next = patchClientActionsParams(params, { item: String(id) });
      // Already open: swap in place (Prev/Next semantics), never stack history.
      if (state.item) go(next, { replace: true, drawer: pushedByUs });
      else go(next, { replace: false, drawer: true });
    },
    [go, params, state.item, pushedByUs],
  );

  const replaceItem = useCallback(
    (id: string | number) =>
      go(patchClientActionsParams(params, { item: String(id) }), {
        replace: true,
        drawer: pushedByUs,
      }),
    [go, params, pushedByUs],
  );

  const closeItem = useCallback(() => {
    if (!state.item) return;
    if (pushedByUs) navigate(-1);
    else
      go(patchClientActionsParams(params, { item: null }), { replace: true });
  }, [go, navigate, params, pushedByUs, state.item]);

  return {
    ...state,
    params,
    setClientActionsParams,
    openItem,
    replaceItem,
    closeItem,
  };
};
