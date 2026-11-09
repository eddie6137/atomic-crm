import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { useClientActionsState } from "./clientActionsState";

const Harness = () => {
  const s = useClientActionsState();
  const loc = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <output data-testid="search">{`${loc.pathname}${loc.search}`}</output>
      <button onClick={() => s.openItem("a")}>open-a</button>
      <button onClick={() => s.replaceItem("b")}>next-b</button>
      <button onClick={() => s.closeItem()}>close-drawer</button>
      <button onClick={() => navigate(-1)}>history-back</button>
      <button onClick={() => s.setClientActionsParams({ tab: "overdue" })}>
        tab-overdue
      </button>
    </div>
  );
};

const renderAt = async (url: string) => {
  const screen = await render(
    <MemoryRouter initialEntries={["/start", url]} initialIndex={1}>
      <Harness />
    </MemoryRouter>,
  );
  const at = () => screen.getByTestId("search").element().textContent;
  const click = (name: string) =>
    screen.getByRole("button", { name, exact: true }).click();
  return { screen, at, click };
};

describe("useClientActionsState history (D1)", () => {
  it("first open pushes; Prev/Next replaces; Back closes the drawer", async () => {
    const { at, click } = await renderAt("/client-actions?tab=all&highlight=h");
    await click("open-a");
    await expect.poll(at).toBe("/client-actions?tab=all&highlight=h&item=a");
    await click("next-b");
    await expect.poll(at).toBe("/client-actions?tab=all&highlight=h&item=b");
    await click("history-back");
    // One Back closes the drawer (Prev/Next added no history) and keeps highlight.
    await expect.poll(at).toBe("/client-actions?tab=all&highlight=h");
  });
  it("close pops our own push", async () => {
    const { at, click } = await renderAt("/client-actions?tab=all");
    await click("open-a");
    await expect.poll(at).toBe("/client-actions?tab=all&item=a");
    await click("close-drawer");
    await expect.poll(at).toBe("/client-actions?tab=all");
  });
  it("a deep-linked drawer closes by replace (never leaves the page)", async () => {
    const { at, click } = await renderAt("/client-actions?tab=all&item=z");
    await click("close-drawer");
    await expect.poll(at).toBe("/client-actions?tab=all");
    await click("history-back");
    await expect.poll(at).toBe("/start");
  });
  it("a tab change drops highlight (nit A) but keeps the open item", async () => {
    const { at, click } = await renderAt(
      "/client-actions?tab=all&highlight=h&item=a",
    );
    await click("tab-overdue");
    await expect.poll(at).toBe("/client-actions?tab=overdue&item=a");
  });
});
