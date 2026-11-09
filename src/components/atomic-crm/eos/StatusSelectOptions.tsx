import { STATUS_MORE, STATUS_PRIMARY } from "./boardLanes";

const human = (v: string) => v.replace(/_/g, " ");

/**
 * Shared status <select> options (U1 nit 6 / U2): primary four, then More… group.
 * A current `lapsed` value is shown but not offered.
 */
export const StatusSelectOptions = ({
  current,
}: {
  current?: string | null;
}) => (
  <>
    {STATUS_PRIMARY.map((s) => (
      <option key={s} value={s}>
        {human(s)}
      </option>
    ))}
    <optgroup label="More…">
      {STATUS_MORE.map((s) => (
        <option key={s} value={s}>
          {human(s)}
        </option>
      ))}
    </optgroup>
    {current === "lapsed" && (
      <option value="lapsed" disabled>
        lapsed
      </option>
    )}
  </>
);
