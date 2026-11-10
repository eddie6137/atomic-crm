import { describe, expect, it } from "vitest";
import {
  SYNTHETIC_INTAKE_MARKER,
  fixtureIntake,
  withSyntheticIntakeMarker,
} from "./fixtureIntake";

describe("fixtureIntake synthetic marker", () => {
  it("prepends [SYNTHETIC-INTAKE-P1] on every loaded item subject and suggested_title", () => {
    expect(fixtureIntake.length).toBeGreaterThan(0);
    for (const item of fixtureIntake) {
      expect(item.subject.startsWith(`${SYNTHETIC_INTAKE_MARKER} `)).toBe(true);
      if (item.suggested_title != null) {
        expect(item.suggested_title.startsWith(`${SYNTHETIC_INTAKE_MARKER} `)).toBe(
          true,
        );
      }
    }
  });

  it("does not double-prefix a value that already has the marker", () => {
    const once = withSyntheticIntakeMarker("Re: listing copy refresh");
    expect(once).toBe(`${SYNTHETIC_INTAKE_MARKER} Re: listing copy refresh`);
    expect(withSyntheticIntakeMarker(once)).toBe(once);
  });
});
