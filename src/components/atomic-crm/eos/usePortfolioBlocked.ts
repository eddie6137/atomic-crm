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
      sort: { field: "id", order: "ASC" },
    },
    { retry: false },
  );
  const byCompany = useMemo(() => groupCountByCompany(data ?? []), [data]);
  const loaded = data?.length ?? 0;
  return {
    byCompany,
    countFor: (id: string | number) => byCompany.get(String(id)) ?? 0,
    loaded,
    total,
    capped: total != null && total > loaded,
    isPending,
    error: !!error,
  };
};

/** Honest label for a per-account blocked count when the one query was capped. */
export const blockedCountLabel = (n: number, capped: boolean) =>
  capped ? `${n}+` : String(n);
