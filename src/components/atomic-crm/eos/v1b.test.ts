import { describe, expect, it } from "vitest";
import { addDays, currentQuarter, metricHit, weekStart } from "./constants";
import { fixtureProposals, fingerprintOf } from "./proposals/fixtureProposals";

describe("eos v1b helpers", () => {
  it("weekStart returns Monday", () => {
    expect(weekStart("2026-11-05")).toBe("2026-11-02");
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
  });
  it("addDays crosses months", () => {
    expect(addDays("2026-10-26", 7)).toBe("2026-11-02");
  });
  it("currentQuarter", () => {
    expect(currentQuarter("2026-11-05")).toBe("2026-Q4");
    expect(currentQuarter("2026-01-01")).toBe("2026-Q1");
  });
  it("metricHit", () => {
    expect(metricHit(10, ">=", 8)).toBe(true);
    expect(metricHit(5, ">=", 8)).toBe(false);
    expect(metricHit(5, "<=", 8)).toBe(true);
    expect(metricHit(8, "=", 8)).toBe(true);
    expect(metricHit(null, ">=", 8)).toBeNull();
  });
  it("fixture fingerprints are stable and unique", () => {
    const fps = fixtureProposals.map(fingerprintOf);
    expect(new Set(fps).size).toBe(fps.length);
    expect(fingerprintOf(fixtureProposals[0])).toBe(fps[0]);
  });
});
