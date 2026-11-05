import { commands } from "vitest/browser";

import {
  formatDealAmount,
  formatDealClosingDateLabel,
  formatISODateString,
  isDealClosingDatePast,
  isValidDealClosingDate,
  sumDealAmounts,
} from "./dealUtils";

describe("formatISODateString", () => {
  let originalTimezone: string;

  beforeEach(() => {
    originalTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  });

  afterEach(async () => {
    await commands.setTimezone(originalTimezone);
  });

  it("formats a valid ISO date string correctly", () => {
    const isoDate = "2024-06-15";
    const formattedDate = formatISODateString(isoDate);
    expect(formattedDate).toBe("Jun 15, 2024");
  });

  it("should not shift the date regardless of timezone", async () => {
    // Uses CDP (Emulation.setTimezoneOverride) to actually change the browser's
    // timezone at runtime so we can catch regressions where someone replaces the
    // manual date-component parse with new Date(isoString), which would shift
    // dates in negative-offset timezones like America/New_York.
    const isoDate = "2024-06-15";
    await commands.setTimezone("America/New_York");
    expect(formatISODateString(isoDate)).toBe("Jun 15, 2024");

    await commands.setTimezone("Asia/Tokyo");
    expect(formatISODateString(isoDate)).toBe("Jun 15, 2024");

    await commands.setTimezone("UTC");
    expect(formatISODateString(isoDate)).toBe("Jun 15, 2024");

    await commands.setTimezone("Pacific/Auckland");
    expect(formatISODateString(isoDate)).toBe("Jun 15, 2024");
  });

  it("throw for an invalid date string", () => {
    const invalidDate = "invalid-date";
    expect(() => formatISODateString(invalidDate)).toThrow(
      "Invalid date format. Expected YYYY-MM-DD.",
    );
  });

  it("throw for a date string with wrong format", () => {
    const invalidDate = "15-06-2024";
    expect(() => formatISODateString(invalidDate)).toThrow(
      "Invalid date format. Expected YYYY-MM-DD.",
    );
  });
});

describe("formatDealAmount", () => {
  it("formats finite amounts", () => {
    expect(formatDealAmount(1500, "USD")).toContain("$");
  });

  it("treats null/undefined as zero", () => {
    expect(formatDealAmount(null, "USD")).toBe(formatDealAmount(0, "USD"));
    expect(formatDealAmount(undefined, "USD")).toBe(formatDealAmount(0, "USD"));
  });
});

describe("closing date helpers", () => {
  it("rejects null/empty closing dates", () => {
    expect(isValidDealClosingDate(null)).toBe(false);
    expect(isValidDealClosingDate(undefined)).toBe(false);
    expect(isValidDealClosingDate("")).toBe(false);
    expect(formatDealClosingDateLabel(null)).toBeNull();
    expect(isDealClosingDatePast(null)).toBe(false);
  });

  it("formats valid ISO dates", () => {
    expect(formatDealClosingDateLabel("2024-06-15")).toBe("Jun 15, 2024");
  });
});

describe("sumDealAmounts", () => {
  it("ignores null amounts", () => {
    expect(
      sumDealAmounts([{ amount: 10 }, { amount: null }, { amount: 5 }]),
    ).toBe(15);
  });
});
