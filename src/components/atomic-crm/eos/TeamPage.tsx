import { useGetList } from "ra-core";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COMMITMENT_OPEN, inFilter, ISSUE_OPEN } from "./constants";
import { EosNav } from "./EosNav";

const enc = (o: object) => encodeURIComponent(JSON.stringify(o));
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(
    new Date(),
  );

/** Team EOS: per-person accountability (existing Atomic users only; spec §RLS default). */
export const TeamPage = () => {
  const { data: sales } = useGetList("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "first_name", order: "ASC" },
    filter: { "disabled@neq": true },
  });
  return (
    <div className="flex flex-col gap-2 p-2 min-w-0">
      <EosNav />
      <h2 className="text-xl font-semibold">EOS · Team</h2>
      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="eos-team"
      >
        {(sales ?? []).map((s: any) => (
          <Person key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
};
TeamPage.path = "/eos/team";

const useCount = (resource: string, filter: object) =>
  useGetList(resource, {
    pagination: { page: 1, perPage: 1 },
    filter: { "archived_at@is": null, ...filter },
  }).total ?? 0;

const Person = ({ s }: { s: any }) => {
  const own = { owner_sales_id: s.id };
  const t = today();
  const rows = [
    {
      label: "Open commitments",
      r: "eos_commitments",
      f: { ...own, "status@in": inFilter(COMMITMENT_OPEN) },
    },
    {
      label: "Overdue",
      r: "eos_commitments",
      f: { ...own, "status@in": inFilter(COMMITMENT_OPEN), "due_date@lt": t },
      warn: true,
    },
    {
      label: "Open issues",
      r: "eos_issues",
      f: { ...own, "status@in": inFilter(ISSUE_OPEN) },
    },
    {
      label: "Rocks",
      r: "eos_rocks",
      f: { ...own, "status@in": "(on_track,off_track)" },
    },
    {
      label: "Rocks off-track",
      r: "eos_rocks",
      f: { ...own, status: "off_track" },
      warn: true,
    },
    {
      label: "Deliverables open",
      r: "eos_deliverables",
      f: { ...own, "status@in": "(planned,in_progress,ready)" },
    },
  ];
  return (
    <Card data-testid="eos-team-person">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {s.first_name} {s.last_name}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 text-sm">
        {rows.map((x) => (
          <Cell key={x.label} {...x} />
        ))}
      </CardContent>
    </Card>
  );
};

const Cell = ({
  label,
  r,
  f,
  warn,
}: {
  label: string;
  r: string;
  f: object;
  warn?: boolean;
}) => {
  const n = useCount(r, f);
  return (
    <Link
      to={`/${r}?filter=${enc(f)}`}
      className="rounded border p-2 no-underline hover:bg-muted"
    >
      <div
        className={`text-lg font-semibold ${warn && n > 0 ? "text-red-600" : ""}`}
      >
        {n}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Link>
  );
};
