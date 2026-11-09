import { describe, expect, it, vi } from "vitest";
import { withLifecycleCallbacks, type DataProvider } from "ra-core";
import { eosBeforeSave } from "./attachments";
import { toDirectionValue } from "./clientActions";

vi.mock("../providers/supabase/supabase", () => ({
  getSupabaseClient: () => {
    throw new Error("no network in this test");
  },
}));

const attached = {
  id: "c1",
  title: "Synthetic attached commitment",
  direction: null,
  status: "open",
  attachments: [
    {
      path: "u/brief.pdf",
      title: "brief.pdf",
      uploaded_at: "2026-11-01T00:00:00Z",
    },
  ],
  links: [{ url: "https://example.invalid/brief", title: "Brief" }],
};

const setup = () => {
  const update = vi.fn(async (_r: string, p: any) => ({
    data: { ...p.previousData, ...p.data },
  }));
  const base = { update } as unknown as DataProvider;
  const dp = withLifecycleCallbacks(base, [
    {
      resource: "eos_commitments",
      beforeSave: async (d: any) => eosBeforeSave(d),
    },
  ]);
  return { dp, update };
};

describe("Quick-classify partial update keeps attachments (regression)", () => {
  it.each([["from_client"], [""]])(
    "direction '%s' patches direction only",
    async (v) => {
      const { dp, update } = setup();
      const direction = toDirectionValue(v);
      const res = await dp.update("eos_commitments", {
        id: attached.id,
        data: { direction },
        previousData: attached,
      });
      const sent = update.mock.calls[0][1].data;
      expect(sent).toEqual({ direction });
      expect(sent).not.toHaveProperty("attachments");
      expect(res.data.attachments).toEqual(attached.attachments);
      expect(res.data.links).toEqual(attached.links);
    },
  );
  it("full form saves still merge existing + new attachments", async () => {
    const out = await eosBeforeSave({
      title: "x",
      attachments: attached.attachments,
    });
    expect(out.attachments).toEqual(attached.attachments);
    const created = await eosBeforeSave({ title: "x", new_files: [] });
    expect(created.attachments).toEqual([]);
  });
});
