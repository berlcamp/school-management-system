import { describe, expect, it } from "vitest";
import { computeMps } from "../itemAnalysis";
import { mpsBySex } from "../mps";

describe("mpsBySex", () => {
  it("computes each half the way the class MPS is computed", () => {
    const learners = [
      { sex: "male" as const, score: 8 },
      { sex: "male" as const, score: 6 },
      { sex: "female" as const, score: 9 },
    ];
    expect(mpsBySex(learners, 10)).toEqual({ male: 70, female: 90 });
    expect(computeMps([8, 6, 9], 10)).toBe(76.67);
  });

  it("returns null for a half with no learners, and leaves unspecified out", () => {
    const learners = [
      { sex: "female" as const, score: 5 },
      { sex: "unspecified" as const, score: 0 },
    ];
    expect(mpsBySex(learners, 10)).toEqual({ male: null, female: 50 });
  });

  it("returns null when the exam has no scorable items", () => {
    expect(mpsBySex([{ sex: "male", score: 0 }], 0)).toEqual({
      male: null,
      female: null,
    });
  });
});
