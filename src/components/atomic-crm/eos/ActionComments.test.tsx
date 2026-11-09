import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext, type DataProvider } from "ra-core";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";
import { ActionComments } from "./ActionComments";
import {
  COMMENT_MAX,
  COMMENTS_RESOURCE,
  commentBodyError,
} from "./actionComments";

const sales = [
  { id: 4, first_name: "Pat", last_name: "Demo" },
  { id: 6, first_name: "Terry", last_name: "Team" },
];

const makeDp = () => {
  const comments: any[] = [
    {
      id: "k2",
      commitment_id: "c1",
      body: "Second",
      created_by: 6,
      created_at: "2026-11-08T23:00:00Z",
    },
    {
      id: "k1",
      commitment_id: "c1",
      body: "First",
      created_by: null,
      created_at: "2026-11-08T22:00:00Z",
    },
  ];
  const create = vi.fn(async (_r: string, p: any) => {
    const row = {
      id: `k${comments.length + 1}`,
      ...p.data,
      created_by: 4,
      created_at: "2026-11-09T06:00:00Z",
    };
    comments.unshift(row);
    return { data: row };
  });
  const getMany = vi.fn(async (r: string, p: any) => ({
    data: (r === "sales" ? sales : []).filter((x) =>
      p.ids.map(String).includes(String(x.id)),
    ),
  }));
  const getList = vi.fn(async (r: string) =>
    r === COMMENTS_RESOURCE
      ? { data: [...comments], total: comments.length }
      : { data: [], total: 0 },
  );
  const dp = {
    getList,
    getMany,
    create,
    getOne: async () => ({ data: {} }),
    getManyReference: async () => ({ data: [], total: 0 }),
    update: async () => ({ data: {} }),
    updateMany: async () => ({ data: [] }),
    delete: async () => ({ data: {} }),
    deleteMany: async () => ({ data: [] }),
  } as unknown as DataProvider;
  return { dp, create, getMany, getList };
};

const renderIt = (dp: DataProvider) =>
  render(
    <CoreAdminContext dataProvider={dp} i18nProvider={testI18nProvider}>
      <ActionComments commitmentId="c1" />
    </CoreAdminContext>,
  );

describe("ActionComments (v1d U1b)", () => {
  it("lists comments newest first with batched author lookup; null author = System", async () => {
    const { dp, getMany, getList } = makeDp();
    const screen = await renderIt(dp);
    await expect.element(screen.getByText("Second")).toBeVisible();
    await expect.element(screen.getByText("Terry Team")).toBeVisible();
    await expect.element(screen.getByText("System")).toBeVisible();
    const items = screen.getByTestId("action-comment").all();
    expect(items[0].element().textContent).toContain("Second");
    expect(getList.mock.calls[0][1].filter).toEqual({
      commitment_id: "c1",
      "archived_at@is": null,
    });
    expect(getMany.mock.calls.filter((c) => c[0] === "sales")).toHaveLength(1);
  });
  it("posts only {commitment_id, body} (trimmed); author/time come from the DB", async () => {
    const { dp, create } = makeDp();
    const screen = await renderIt(dp);
    await screen
      .getByTestId("action-comment-body")
      .fill("  Called the client, waiting on PO  ");
    await screen.getByTestId("action-comment-submit").click();
    await expect.poll(() => create.mock.calls.length).toBe(1);
    expect(create.mock.calls[0][0]).toBe(COMMENTS_RESOURCE);
    expect(create.mock.calls[0][1].data).toEqual({
      commitment_id: "c1",
      body: "Called the client, waiting on PO",
    });
    await expect
      .element(screen.getByText("Called the client, waiting on PO"))
      .toBeVisible();
    await expect
      .element(screen.getByTestId("action-comment-body"))
      .toHaveValue("");
  });
  it("blank or over-limit bodies cannot be sent (mirrors the DB CHECK)", async () => {
    expect(commentBodyError("   ")).toMatch(/Write/);
    expect(commentBodyError("x".repeat(COMMENT_MAX))).toBeNull();
    expect(commentBodyError("x".repeat(COMMENT_MAX + 1))).toMatch(/under/);
    const { dp, create } = makeDp();
    const screen = await renderIt(dp);
    await expect
      .element(screen.getByTestId("action-comment-submit"))
      .toBeDisabled();
    await screen.getByTestId("action-comment-body").fill("   ");
    await expect
      .element(screen.getByTestId("action-comment-submit"))
      .toBeDisabled();
    expect(create).not.toHaveBeenCalled();
  });
});
