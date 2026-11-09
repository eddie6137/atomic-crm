import { CoreAdminContext, Form } from "ra-core";
import { useWatch } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";

import { DateInput } from "./date-input";
import {
  monthGrid,
  opensCalendarOnClick,
  parseYmd,
  toYmd,
} from "./date-picker-utils";

const DueValue = () => {
  const v = useWatch({ name: "due_date" });
  return <output aria-label="due value">{JSON.stringify(v ?? null)}</output>;
};

const renderInput = (record: Record<string, unknown>) =>
  render(
    <CoreAdminContext i18nProvider={testI18nProvider}>
      <Form record={record}>
        <DateInput source="due_date" />
        <DueValue />
      </Form>
    </CoreAdminContext>,
  );

describe("date-picker-calendar helpers", () => {
  it("parses YYYY-MM-DD as a local date with no UTC day shift", () => {
    const d = parseYmd("2026-11-09")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 9]);
    expect(toYmd(d)).toBe("2026-11-09");
    expect(parseYmd("11/09/2026")).toBeNull();
    expect(parseYmd(null)).toBeNull();
  });
  it("month grid is 42 days starting on the Sunday on/before the 1st", () => {
    const g = monthGrid(new Date(2026, 10, 15));
    expect(g).toHaveLength(42);
    expect(toYmd(g[0])).toBe("2026-11-01"); // Nov 1 2026 is a Sunday
    expect(g[0].getDay()).toBe(0);
  });
});

describe("opensCalendarOnClick", () => {
  it("opens the in-app calendar only for mouse clicks, per event", () => {
    expect(opensCalendarOnClick("mouse")).toBe(true);
    expect(opensCalendarOnClick("touch")).toBe(false);
    expect(opensCalendarOnClick("pen")).toBe(false);
    expect(opensCalendarOnClick(null)).toBe(false);
  });
});

describe("<DateInput> calendar popover", () => {
  it("opens a real calendar from the button and writes YYYY-MM-DD", async () => {
    const screen = await renderInput({ due_date: "2026-11-09" });
    await screen.getByRole("button", { name: "Open calendar" }).click();
    await expect
      .element(screen.getByTestId("date-picker-calendar"))
      .toBeVisible();
    await expect.element(screen.getByText("November 2026")).toBeVisible();
    await screen
      .getByRole("button", { name: "Saturday, November 21, 2026" })
      .click();
    await expect
      .element(screen.getByLabelText("due value"))
      .toHaveTextContent('"2026-11-21"');
    expect(
      (document.querySelector("input[type=date]") as HTMLInputElement).value,
    ).toBe("2026-11-21");
  });
  it("navigates months and clears an optional date", async () => {
    const screen = await renderInput({ due_date: "2026-11-09" });
    await screen.getByRole("button", { name: "Open calendar" }).click();
    await screen.getByRole("button", { name: "Next month" }).click();
    await expect.element(screen.getByText("December 2026")).toBeVisible();
    await screen.getByRole("button", { name: "Clear" }).click();
    await expect
      .element(screen.getByLabelText("due value"))
      .toHaveTextContent("null"); // ra-core parses "" to null
    expect(
      (document.querySelector("input[type=date]") as HTMLInputElement).value,
    ).toBe("");
  });
  it("clicking the field itself opens the calendar on a mouse device", async () => {
    const screen = await renderInput({});
    // Real mouse click (pointerdown pointerType "mouse"), as a desktop user would.
    await page
      .elementLocator(document.querySelector("input[type=date]")!)
      .click();
    await expect
      .element(screen.getByTestId("date-picker-calendar"))
      .toBeVisible();
  });
  it("nit C: a later click with no pointerdown (keyboard/synthetic) does not reuse the last mouse pointerType", async () => {
    const screen = await renderInput({});
    const input = document.querySelector(
      "input[type=date]",
    ) as HTMLInputElement;
    await page.elementLocator(input).click();
    await expect
      .element(screen.getByTestId("date-picker-calendar"))
      .toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect
      .element(screen.getByTestId("date-picker-calendar"))
      .not.toBeInTheDocument();
    // Synthetic click: no pointerdown precedes it, as with keyboard activation.
    input.click();
    await new Promise((r) => setTimeout(r, 200));
    expect(
      document.querySelector("[data-testid=date-picker-calendar]"),
    ).toBeNull();
  });
});
