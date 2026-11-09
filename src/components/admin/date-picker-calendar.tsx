import * as React from "react";
import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
export const toYmd = (d: Date) => format(d, "yyyy-MM-dd");
/** Local "today" as YYYY-MM-DD (the user's device date). */
export const todayYmd = () => toYmd(new Date());
/** Parse a bare YYYY-MM-DD as a local date (no UTC shift). */
export const parseYmd = (v: unknown): Date | null =>
  typeof v === "string" && ymdRe.test(v) ? parseISO(v) : null;

/** 6×7 grid of dates for the month containing `month`, weeks starting Sunday. */
export const monthGrid = (month: Date) => {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Small, dependency-free month calendar used by DateInput's popover.
 * Value in and out is a bare "YYYY-MM-DD" string (same contract as <input type="date">).
 */
export const DatePickerCalendar = ({
  value,
  onSelect,
  onClear,
}: {
  value?: string | null;
  onSelect: (ymd: string) => void;
  onClear?: () => void;
}) => {
  const selected = parseYmd(value);
  const [month, setMonth] = React.useState<Date>(
    startOfMonth(selected ?? new Date()),
  );
  const today = todayYmd();
  return (
    <div className="flex flex-col gap-2" data-testid="date-picker-calendar">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Previous month"
          onClick={() => setMonth((m) => addMonths(m, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-sm font-medium" aria-live="polite">
          {format(month, "MMMM yyyy")}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Next month"
          onClick={() => setMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-xs text-muted-foreground py-1">
            {d}
          </div>
        ))}
        {monthGrid(month).map((d) => {
          const ymd = toYmd(d);
          const isSel = value === ymd;
          return (
            <button
              key={ymd}
              type="button"
              data-date={ymd}
              aria-label={format(d, "EEEE, MMMM d, yyyy")}
              aria-pressed={isSel}
              onClick={() => onSelect(ymd)}
              className={cn(
                "h-9 w-9 rounded-md text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring",
                !isSameMonth(d, month) && "text-muted-foreground/60",
                ymd === today && !isSel && "border border-primary",
                isSel &&
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onSelect(today)}
        >
          Today
        </Button>
        {onClear && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
};
