import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useScrollToHighlightOnce } from "./useScrollToHighlightOnce";
import { HIGHLIGHT_CLASS } from "./clientActions";

describe("useScrollToHighlightOnce (CE nit D)", () => {
  let scrollIntoView: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    scrollIntoView = vi.fn();
    const el = document.createElement("div");
    el.className = HIGHLIGHT_CLASS;
    (el as any).scrollIntoView = scrollIntoView;
    document.body.appendChild(el);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });
  it("scrolls once per highlight id; refetch does not re-scroll", async () => {
    const { rerender } = await renderHook(
      // renderHook types initialProps as optional, so the callback takes `p?`.
      (p?: { id: string | null; ready: boolean }) =>
        useScrollToHighlightOnce(p?.id ?? null, p?.ready ?? false),
      { initialProps: { id: "h1" as string | null, ready: true } },
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // Simulate refetch (ready toggles, same id)
    await rerender({ id: "h1", ready: false });
    await rerender({ id: "h1", ready: true });
    await vi.advanceTimersByTimeAsync(200);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // New highlight id scrolls again
    await rerender({ id: "h2", ready: true });
    await vi.advanceTimersByTimeAsync(200);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
