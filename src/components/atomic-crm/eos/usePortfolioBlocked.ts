import { useMemo } from "react";
import { useGetList } from "ra-core";
import {
  BLOCKED_PORTFOLIO_CAP,
  blockedPortfolioFilter,
  groupCountByCompany,
} from "./clientActions";

/**
 * U3 blocked counts per account: ONE getList (open set, status=blocked, perPage 500),
 * grouped client-side. `eos_account_summary` has no blocked column (adding one needs
 * a migration). Every caller shares the same query key, so react-query dedupes it.
 * `capped` = more blocked rows exist than were loaded; counts are then lower bounds.
 */
export const usePortfolioBlocked = () => {
  const filter = useMemo(() => blockedPortfolioFilter(), []);
  const { data, total, isPending, error } = useGetList(
    "eos_commitments",
    {
      filter,
      pagination: { page: 1, perPage: BLOCKED_PORTFOLIO_CAP },
      // CE nit 1: whole accounts before the cap (company_id, then id: stable).
      sort: { field: "company_id.asc,id", order: "ASC" },
    },
    { retry: false },
  );
  const byCompany = useMemo(() => groupCountByCompany(data ?? []), [data]);
  const loaded = data?.length ?? 0;
  const capped = total != null && total > loaded;
  // Rows come in company_id order, so when capped every account before the last loaded
  // one is complete; only that account and later ones are lower bounds.
  const last = capped ? data?.[loaded - 1]?.company_id : null;
  const exactFor = (id: string | number) =>
    !capped ||
    (last != null &&
      Number.isFinite(Number(id)) &&
      Number.isFinite(Number(last)) &&
      Number(id) < Number(last));
  return {
    byCompany,
    countFor: (id: string | number) => byCompany.get(String(id)) ?? 0,
    exactFor,
    loaded,
    total,
    capped,
    isPending,
    error: !!error,
  };
};

/** Honest label for a per-account blocked count when the one query was capped. */
export const blockedCountLabel = (n: number, capped: boolean) =>
  capped ? `${n}+` : String(n);
