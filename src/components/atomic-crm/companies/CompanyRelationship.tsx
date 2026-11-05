import { useListContext } from "ra-core";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useConfigurationContext } from "../root/ConfigurationContext";

/** Plural tab labels for the default values; custom values fall back to their label. */
const TAB_LABELS: Record<string, string> = {
  client: "Clients",
  prospect: "Prospects",
  lead: "Leads",
  partner: "Partners",
  past_client: "Past",
};

export const useRelationshipLabel = (value?: string | null) => {
  const { companyRelationships } = useConfigurationContext();
  if (!value) return undefined;
  return companyRelationships.find((r) => r.value === value)?.label ?? value;
};

export const RelationshipBadge = ({
  value,
  className,
}: {
  value?: string | null;
  className?: string;
}) => {
  const label = useRelationshipLabel(value);
  if (!label) return null;
  return (
    <Badge
      variant={value === "client" ? "default" : "outline"}
      className={cn("text-[10px]", className)}
      data-testid="company-relationship-badge"
    >
      {label}
    </Badge>
  );
};

/** Segmented control at the top of Companies: All / Clients / Prospects / Leads / Partners / Past. */
export const RelationshipTabs = () => {
  const { companyRelationships } = useConfigurationContext();
  const { filterValues, setFilters, displayedFilters } = useListContext();
  const current: string | undefined = filterValues?.relationship;
  const select = (value?: string) => {
    const { relationship: _drop, ...rest } = filterValues ?? {};
    setFilters(
      value ? { ...rest, relationship: value } : rest,
      displayedFilters,
    );
  };
  const tabs = [
    { value: undefined as string | undefined, label: "All" },
    ...companyRelationships.map((r) => ({
      value: r.value,
      label: TAB_LABELS[r.value] ?? r.label,
    })),
  ];
  return (
    <div
      role="tablist"
      className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 w-fit max-w-full"
      data-testid="company-relationship-tabs"
    >
      {tabs.map((t) => (
        <button
          key={t.value ?? "all"}
          type="button"
          role="tab"
          aria-selected={current === t.value}
          onClick={() => select(t.value)}
          className={cn(
            "rounded-md px-3 py-1 text-sm",
            current === t.value
              ? "bg-background shadow font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
};
