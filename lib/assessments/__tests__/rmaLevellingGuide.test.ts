import { describe, expect, it } from "vitest";
import { RMA_DEFAULT_BANDS, RMA_LEVELS } from "@/lib/constants/assessments";
import { rmaBandRange, rmaKeyStage, rmaLevellingGuide } from "../rmaFormat";

const bands = (rows: { min_score: number; max_score: number; label: string }[]) =>
  rows.map((r, i) => ({ ...r, position: i }));

describe("rmaKeyStage", () => {
  it("maps grades to key stages", () => {
    expect([1, 3, 4, 6, 7, 10, 11, 12].map(rmaKeyStage)).toEqual([
      "KS1", "KS1", "KS2", "KS2", "KS3", "KS3", "KS4", "KS4",
    ]);
    expect(rmaKeyStage(0)).toBeNull();
    expect(rmaKeyStage(13)).toBeNull();
    expect(rmaKeyStage(null)).toBeNull();
  });
});

describe("rmaBandRange", () => {
  it("prints the default bands as the KS1 card did", () => {
    expect(RMA_DEFAULT_BANDS.map(rmaBandRange)).toEqual(RMA_LEVELS.map((l) => l.range));
  });

  it("prints a middle band with whole edges", () => {
    expect(rmaBandRange({ min_score: 60, max_score: 79.99 })).toBe("60–79%");
  });
});

describe("rmaLevellingGuide", () => {
  it("reproduces the KS1 card from the default bands", () => {
    expect(rmaLevellingGuide(bands(RMA_DEFAULT_BANDS), RMA_LEVELS)).toEqual(RMA_LEVELS);
  });

  it("follows a material's own bands, in band order", () => {
    const guide = rmaLevellingGuide(
      [
        { min_score: 80, max_score: 100, label: "Enhancement", position: 2 },
        { min_score: 0, max_score: 59.99, label: "Intervention", position: 0 },
        { min_score: 60, max_score: 79.99, label: "Needs Practice", position: 1 },
      ],
      RMA_LEVELS,
    );
    expect(guide.map((g) => [g.label, g.range])).toEqual([
      ["Intervention", "Below 60%"],
      ["Needs Practice", "60–79%"],
      ["Enhancement", "80% and above"],
    ]);
    expect(guide[0].definition).toBe(RMA_LEVELS[0].definition);
    expect(guide[1].definition).toBe("");
  });
});
