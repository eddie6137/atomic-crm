import { addDays, format, parseISO, startOfMonth, startOfWeek } from "date-fns";

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

/**
 * Mouse/trackpad clicks open the in-app calendar; touch/pen keep the OS picker.
 * Decided per event (pointerType), so iPads with a trackpad and touch laptops behave per input.
 */
export const opensCalendarOnClick = (pointerType: string | null | undefined) =>
  pointerType === "mouse";
