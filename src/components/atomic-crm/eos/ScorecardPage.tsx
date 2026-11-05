import { useState } from "react";
import { useDataProvider, useGetList, useNotify, useRefresh } from "ra-core";
import { Link } from "react-router";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { addDays, metricHit, todayPT, weekStart } from "./constants";
import { EosNav } from "./EosNav";

const WEEKS = 6;

/** Weekly Scorecard grid (Monday week start, PT). Blank = missing, never zero. */
export const ScorecardPage = () => {
  const isMobile = useIsMobile();
  const thisWeek = weekStart(todayPT());
  const weeks = Array.from({ length: isMobile ? 3 : WEEKS }, (_, i) =>
    addDays(thisWeek, -7 * i),
  ).reverse();
  const { data: metrics = [] } = useGetList("eos_scorecard_metrics", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "name", order: "ASC" },
    filter: { "archived_at@is": null, active: true },
  });
  const { data: values = [] } = useGetList("eos_scorecard_values", {
    pagination: { page: 1, perPage: 2000 },
    sort: { field: "week_start", order: "ASC" },
    filter: { "week_start@gte": weeks[0], "archived_at@is": null },
  });
  const { data: companies = [] } = useGetList("companies", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "name", order: "ASC" },
    filter: {},
  });
  const cname = (id: any) =>
    companies.find((c: any) => c.id === id)?.name ?? "";
  const val = (mid: string, w: string) =>
    values.find((v: any) => v.metric_id === mid && v.week_start === w);

  return (
    <div className="flex flex-col gap-2 p-2 min-w-0">
      <EosNav />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-semibold">EOS · Scorecard (weekly)</h2>
        <Link to="/eos_scorecard_metrics" className="text-sm underline">
          Manage measurables
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Weeks start Monday (America/Los_Angeles). Blank cells are missing data,
        not zero.
      </p>
      <div className="w-full min-w-0">
        <table
          className="w-full text-sm border-collapse table-fixed"
          data-testid="eos-scorecard"
        >
          <thead>
            <tr>
              <th className="text-left p-1 w-2/5">Measurable</th>
              {weeks.map((w) => (
                <th key={w} className="p-1 text-xs font-normal">
                  {w.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m: any) => (
              <tr key={m.id} className="border-t align-top">
                <td className="p-1 break-words">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {cname(m.company_id)} · {m.comparator} {m.target} {m.unit}
                  </div>
                </td>
                {weeks.map((w) => (
                  <ScoreCell
                    key={w}
                    metric={m}
                    week={w}
                    existing={val(m.id, w)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
ScorecardPage.path = "/eos/scorecard";

const ScoreCell = ({
  metric,
  week,
  existing,
}: {
  metric: any;
  week: string;
  existing: any;
}) => {
  const dp = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [text, setText] = useState<string>(existing?.actual ?? "");
  const actual = existing?.actual == null ? null : Number(existing.actual);
  const hit = metricHit(
    actual,
    metric.comparator,
    metric.target == null ? null : Number(metric.target),
  );
  const save = async () => {
    const t = String(text).trim();
    const next = t === "" ? null : Number(t);
    if (t !== "" && Number.isNaN(next))
      return notify("Not a number", { type: "error" });
    if (
      (existing?.actual ?? null) === next ||
      (existing == null && next == null)
    )
      return;
    try {
      if (existing) {
        await dp.update("eos_scorecard_values", {
          id: existing.id,
          data: { actual: next },
          previousData: existing,
        });
      } else {
        await dp.create("eos_scorecard_values", {
          data: { metric_id: metric.id, week_start: week, actual: next },
        });
      }
      refresh();
    } catch (e: any) {
      notify(e.message, { type: "error" });
    }
  };
  return (
    <td
      className={`p-1 ${hit === true ? "bg-green-50 dark:bg-green-950" : hit === false ? "bg-red-50 dark:bg-red-950" : ""}`}
    >
      <Input
        aria-label={`${metric.name} ${week}`}
        className="h-8 px-1 text-center"
        inputMode="decimal"
        value={text ?? ""}
        placeholder="—"
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
      />
    </td>
  );
};
