import { describe, expect, it } from "vitest";
import { resizeAnswers } from "../components/PhilIriPassageFields";
import type { PhilIriComprehensionAnswer } from "@/types";

const answers = (
  ...marks: (boolean | null)[]
): Record<string, PhilIriComprehensionAnswer> =>
  Object.fromEntries(
    marks.map((correct, i) => [
      `q${i + 1}`,
      { correct, type: "critical" } as PhilIriComprehensionAnswer,
    ]),
  );

describe("resizeAnswers", () => {
  it("extends a 7-question form to 8, keeping every mark and type", () => {
    const out = resizeAnswers(answers(true, false, true, true, true, true, null), 8);
    expect(Object.keys(out)).toHaveLength(8);
    // Existing questions keep the type the teacher scored them under — a
    // re-typed q1 must not silently revert to the default spread.
    expect(out.q1).toEqual({ correct: true, type: "critical" });
    expect(out.q6).toEqual({ correct: true, type: "critical" });
    // The added question comes in blank, typed by the 8-question default spread.
    expect(out.q8.correct).toBeNull();
    expect(out.q8.type).toBeTruthy();
  });

  it("drops from the tail when the passage got shorter", () => {
    const out = resizeAnswers(answers(true, true, true, true, true, true, true, true), 6);
    expect(Object.keys(out)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6"]);
  });

  it("never produces an empty form", () => {
    expect(Object.keys(resizeAnswers(answers(true), 0))).toEqual(["q1"]);
  });
});
