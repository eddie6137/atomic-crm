import { useEffect, useRef } from "react";
import { HIGHLIGHT_CLASS } from "./clientActions";

/**
 * CE nit D: scroll the highlighted row/card into view once per highlight id.
 * A later refetch (QuickDirection, board refresh) must not re-scroll.
 */
export const useScrollToHighlightOnce = (
  highlightId: string | null | undefined,
  ready = true,
) => {
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightId) {
      scrolledFor.current = null;
      return;
    }
    if (!ready) return;
    if (scrolledFor.current === highlightId) return;
    const t = setTimeout(() => {
      const el = document.querySelector(`.${HIGHLIGHT_CLASS}`);
      if (!el) return;
      scrolledFor.current = highlightId;
      el.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }, 150);
    return () => clearTimeout(t);
  }, [highlightId, ready]);
};
