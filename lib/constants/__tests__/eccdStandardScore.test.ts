import { describe, expect, it } from "vitest";
import {
  ECCD_STANDARD_SCORE_TABLE,
  eccdStandardScoreInterpretation,
} from "../eccd";

describe("ECCD_STANDARD_SCORE_TABLE", () => {
  it("covers every scaled sum from 29 to 98 with no gaps", () => {
    const sums = Object.keys(ECCD_STANDARD_SCORE_TABLE).map(Number).sort((a, b) => a - b);
    expect(sums).toEqual(Array.from({ length: 70 }, (_, i) => 29 + i));
  });

  it("rises strictly with the scaled sum", () => {
    for (let sum = 30; sum <= 98; sum++) {
      expect(ECCD_STANDARD_SCORE_TABLE[sum]).toBeGreaterThan(ECCD_STANDARD_SCORE_TABLE[sum - 1]);
    }
  });

  it("reproduces both pairs read off the completed card", () => {
    expect(ECCD_STANDARD_SCORE_TABLE[52]).toBe(70);
    expect(ECCD_STANDARD_SCORE_TABLE[73]).toBe(101);
  });

  it("has no entry outside the printed table", () => {
    expect(ECCD_STANDARD_SCORE_TABLE[28]).toBeUndefined();
    expect(ECCD_STANDARD_SCORE_TABLE[99]).toBeUndefined();
  });

  it("interprets the band edges as the sheet prints them", () => {
    expect(eccdStandardScoreInterpretation(ECCD_STANDARD_SCORE_TABLE[51])).toMatch(/Significant Delay/);
    expect(eccdStandardScoreInterpretation(ECCD_STANDARD_SCORE_TABLE[52])).toMatch(/Slight Delay/);
    expect(eccdStandardScoreInterpretation(ECCD_STANDARD_SCORE_TABLE[59])).toBe("Average Overall Development");
    expect(eccdStandardScoreInterpretation(ECCD_STANDARD_SCORE_TABLE[86])).toMatch(/Slightly Advanced/);
    expect(eccdStandardScoreInterpretation(ECCD_STANDARD_SCORE_TABLE[93])).toMatch(/Highly Advance/);
  });
});
