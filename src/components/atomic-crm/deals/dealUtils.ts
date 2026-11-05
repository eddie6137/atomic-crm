import { format } from "date-fns";

import type { DealStage, LabeledValue } from "../types";

export const findDealLabel = (dealStages: DealStage[], dealValue: string) => {
  const dealStage = dealStages.find((stage) => stage.value === dealValue);
  return dealStage?.label;
};

export const formatDealCategories = (
  dealCategories: LabeledValue[],
  categories: string[] | null | undefined,
): string =>
  (categories ?? [])
    .map(
      (value) => dealCategories.find((c) => c.value === value)?.label ?? value,
    )
    .join(", ");

export function formatDealAmount(
  amount: number | null | undefined,
  currency: string,
  locale = "en-US",
): string {
  const value =
    typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return value.toLocaleString(locale, {
    notation: "compact",
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumSignificantDigits: 3,
  });
}

export function isValidDealClosingDate(
  date: string | null | undefined,
): date is string {
  // new Date(null) is epoch and looks "valid"; only accept real strings.
  if (typeof date !== "string" || date.length === 0) return false;
  return !Number.isNaN(Date.parse(date));
}

export function sumDealAmounts(
  deals: Array<{ amount?: number | null }>,
): number {
  return deals.reduce((sum, deal) => {
    const amount = deal.amount;
    return (
      sum + (typeof amount === "number" && Number.isFinite(amount) ? amount : 0)
    );
  }, 0);
}

export function getRelativeTimeString(
  dateString: string,
  locale = "en",
): string {
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diff = date.getTime() - today.getTime();
  const unitDiff = Math.round(diff / (1000 * 60 * 60 * 24));

  // Check if the date is more than one week old
  if (Math.abs(unitDiff) > 7) {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
    }).format(date);
  }

  // Intl.RelativeTimeFormat for dates within the last week
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return ucFirst(rtf.format(unitDiff, "day"));
}

function ucFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const isoDateStringRegex = /^\d{4}-\d{2}-\d{2}$/;

export function formatISODateString(dateString: string) {
  if (!isoDateStringRegex.test(dateString)) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }
  // Some browsers will consider a date in the format YYYY-MM-DD as UTC, which can cause off-by-one-day issues depending on the user's timezone.
  // To avoid this, we can parse the date components manually and create a date object in the local timezone.
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return format(date, "PP");
}

/** Returns a display label for a deal closing date, or null when missing/invalid. */
export function formatDealClosingDateLabel(
  date: string | null | undefined,
): string | null {
  if (!isValidDealClosingDate(date)) return null;
  const isoDay = date.slice(0, 10);
  if (!isoDateStringRegex.test(isoDay)) return null;
  return formatISODateString(isoDay);
}

export function isDealClosingDatePast(
  date: string | null | undefined,
): boolean {
  if (!isValidDealClosingDate(date)) return false;
  return new Date(date) < new Date();
}
