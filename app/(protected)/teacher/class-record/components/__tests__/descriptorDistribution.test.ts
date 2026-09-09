import { describe, expect, it } from "vitest";
import { descriptorDistribution } from "../classRecordUtils";

/**
 * The class record's descriptor tally.
 *
 * The bands themselves are migration 173's and are tested by their own
 * constants; what matters here is that every band is reported even at zero,
 * that boundary grades land in the band the printed legend names, and that the
 * percentages are taken over the learners actually graded.
 */
describe("descriptorDistribution", () => {
  it("returns every band, highest first, even with nothing graded", () => {
    const { tallies, total } = descriptorDistribution([], "matatag");
    expect(total).toBe(0);
    expect(tallies.map((t) => t.label)).toEqual([
      "Advancing",
      "Benchmarking",
      "Connecting",
      "Developing",
      "Emerging",
    ]);
    expect(tallies.every((t) => t.count === 0 && t.percent === 0)).toBe(true);
  });

  it("counts each MATATAG band at its own boundaries", () => {
    // One grade at the bottom edge of each printed band, plus a top mark.
    const { tallies, total } = descriptorDistribution(
      [100, 90, 89, 80, 79, 75, 74, 65, 64, 0],
      "matatag",
    );
    expect(total).toBe(10);
    expect(Object.fromEntries(tallies.map((t) => [t.label, t.count]))).toEqual({
      Advancing: 2, // 100, 90
      Benchmarking: 2, // 89, 80
      Connecting: 2, // 79, 75
      Developing: 2, // 74, 65
      Emerging: 2, // 64, 0
    });
  });

  it("takes percentages over the learners graded, not the class list", () => {
    const { tallies } = descriptorDistribution([90, 90, 80, 70], "matatag");
    const byLabel = Object.fromEntries(tallies.map((t) => [t.label, t.percent]));
    expect(byLabel.Advancing).toBe(50);
    expect(byLabel.Benchmarking).toBe(25);
    expect(byLabel.Developing).toBe(25);
    expect(byLabel.Emerging).toBe(0);
  });

  it("uses the legacy bands for a record pinned to the old scheme", () => {
    const { tallies } = descriptorDistribution([90, 74], "legacy");
    // DO 8, s.2015 names its bands differently — a legacy record must not be
    // relabelled with the updated descriptors (migration 173).
    expect(tallies.map((t) => t.label)).not.toContain("Advancing");
    expect(tallies.reduce((n, t) => n + t.count, 0)).toBe(2);
  });
});
