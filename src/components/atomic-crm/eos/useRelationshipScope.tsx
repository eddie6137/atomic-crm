import { useState } from "react";
import { useGetList } from "ra-core";
import { cn } from "@/lib/utils";
import { useConfigurationContext } from "../root/ConfigurationContext";

/** Portfolio / Hot Topics account scope. Defaults to Clients (Eddie 2:08 PT). "all" = every account. */
export const useRelationshipScope = (initial = "client") => {
  const [scope, setScope] = useState<string>(initial);
  const { data: companies, isPending } = useGetList("companies", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "name", order: "ASC" },
    filter: scope === "all" ? {} : { relationship: scope },
  });
  const ids = (companies ?? []).map((c: any) => c.id);
  return { scope, setScope, companies: companies ?? [], ids, isPending };
};

export const ScopeTabs = ({
  scope,
  setScope,
}: {
  scope: string;
  setScope: (s: string) => void;
}) => {
  const { companyRelationships } = useConfigurationContext();
  const tabs = [
    ...companyRelationships.map((r) => ({ value: r.value, label: r.label })),
    { value: "all", label: "All" },
  ];
  return (
    <div
      role="tablist"
      className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 w-fit max-w-full"
      data-testid="eos-scope-tabs"
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={scope === t.value}
          onClick={() => setScope(t.value)}
          className={cn(
            "rounded-md px-3 py-1 text-sm",
            scope === t.value
              ? "bg-background shadow font-medium"
              : "text-muted-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
};

export const idsFilter = (ids: (string | number)[]) =>
  ids.length ? `(${ids.join(",")})` : "(-1)";
