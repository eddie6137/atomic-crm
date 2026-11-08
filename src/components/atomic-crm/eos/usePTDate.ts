import { useEffect, useState } from "react";
import { todayPT } from "./constants";
import { msUntilNextPTMidnight } from "./clientActions";

/** Current PT date (YYYY-MM-DD); refreshes at PT midnight and on focus/visibility. */
export const usePTDate = () => {
  const [date, setDate] = useState(() => todayPT());
  useEffect(() => {
    const sync = () => setDate(todayPT());
    const t = setTimeout(sync, msUntilNextPTMidnight());
    const onVis = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(t);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [date]);
  return date;
};
