import { useState } from "react";
import { useGetList } from "ra-core";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EosNav } from "./EosNav";
import { ClientActionsView } from "./ClientActionsView";
import {
  BLOCKED_PORTFOLIO_CAP,
  blockedActionsLink,
  CLIENT_ACTIONS_PATH,
  clientActionsLink,
  companyActionsPath,
} from "./clientActions";
import { blockedCountLabel, usePortfolioBlocked } from "./usePortfolioBlocked";

/** Client Actions: a thin view over existing eos_commitments (manual entry only). */
export const ClientActionsPage = () => (
  <div
    className="flex flex-col gap-2 p-2 min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-2"
    data-testid="client-actions"
  >
    <EosNav />
    <PortfolioRollup />
    <ClientActionsView />
  </div>
);
ClientActionsPage.path = CLIENT_ACTIONS_PATH;

/**
 * Portfolio rollup: one eos_account_summary request (no N+1); open/overdue counts are
 * authoritative per account. Blocked (U3) comes from one capped getList, grouped.
 * Every count drills into the exact Client Actions list it counts.
 */
export const PortfolioRollup = () => {
  const [showAll, setShowAll] = useState(false);
  const blocked = usePortfolioBlocked();
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
        blocked.countFor(b.id) - blocked.countFor(a.id) ||
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
  const blockedTotal = rows.reduce(
    (s: number, a: any) => s + blocked.countFor(a.id),
    0,
  );
  const blockedReady = !blocked.isPending && !blocked.error;
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
              <b className="text-red-600">{overdue}</b> overdue ·{" "}
              <b
                className={
                  blockedTotal ? "text-amber-700 dark:text-amber-400" : ""
                }
                data-testid="portfolio-blocked-total"
              >
                {blockedReady
                  ? blockedCountLabel(blockedTotal, blocked.capped)
                  : blocked.error
                    ? "?"
                    : "…"}
              </b>{" "}
              blocked across {rows.length} account{rows.length === 1 ? "" : "s"}
              {total != null && total > loaded
                ? ` (first ${loaded} of ${total} accounts loaded)`
                : ""}
              {blocked.capped
                ? ` (blocked from first ${BLOCKED_PORTFOLIO_CAP} of ${blocked.total})`
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
                data-testid="portfolio-account"
                data-company-id={String(a.id)}
              >
                <Link
                  to={companyActionsPath(a.id)}
                  className="break-words min-w-0"
                >
                  {a.name}
                </Link>
                <span className="flex flex-wrap justify-end gap-x-3 shrink-0">
                  <Link
                    to={clientActionsLink("overdue", a.id)}
                    data-testid="portfolio-overdue"
                    data-count={String(a.overdue_commitments ?? 0)}
                    className={
                      a.overdue_commitments
                        ? "text-red-600 font-medium"
                        : "text-muted-foreground"
                    }
                  >
                    {a.overdue_commitments ?? 0} overdue
                  </Link>
                  <Link
                    to={blockedActionsLink(a.id)}
                    data-testid="portfolio-blocked"
                    data-count={
                      blockedReady ? String(blocked.countFor(a.id)) : ""
                    }
                    className={
                      blocked.countFor(a.id)
                        ? "text-amber-700 dark:text-amber-400 font-medium"
                        : "text-muted-foreground"
                    }
                  >
                    {blockedReady
                      ? blockedCountLabel(
                          blocked.countFor(a.id),
                          blocked.capped,
                        )
                      : "…"}{" "}
                    blocked
                  </Link>
                  <Link
                    to={clientActionsLink("all", a.id)}
                    data-testid="portfolio-open"
                    data-count={String(a.open_commitments ?? 0)}
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
