import { describe, expect, it } from "vitest";
import { decodeSheet } from "../decode";
import { buildSheetLayout, encodeStudentCode } from "../layout";
import {
  itemSpecsFromKey,
  itemsNeedingReview,
  scorableItemNumbers,
  scoreAnswers,
  type AnswerKeyItem,
} from "../score";
import { marksFromLetters, renderSheet } from "./renderSheet";

const key = (letters: (string | null)[], points = 1): AnswerKeyItem[] =>
  letters.map((correctAnswer, i) => ({
    itemNumber: i + 1,
    correctAnswer,
    points,
    choiceCount: 4,
  }));

describe("scoreAnswers", () => {
  it("scores a straightforward sheet", () => {
    const result = scoreAnswers(
      ["A", "B", "C", "D"],
      key(["A", "B", "C", "D"]),
    );
    expect(result.correctItems).toEqual([1, 2, 3, 4]);
    expect(result.correctCount).toBe(4);
    expect(result.percentage).toBe(100);
  });

  it("separates wrong, blank and unresolved answers", () => {
    const result = scoreAnswers(["A", "C", "", "?"], key(["A", "B", "C", "D"]));

    expect(result.correctItems).toEqual([1]);
    expect(result.outcomes.map((o) => o.status)).toEqual([
      "correct",
      "wrong",
      "blank",
      "unresolved",
    ]);
    expect(itemsNeedingReview(result)).toEqual([4]);
  });

  it("keeps the wrong choice on the record, not just that it was wrong", () => {
    const result = scoreAnswers(["C"], key(["A"]));
    // Distractor analysis and the learner's slip both need to know it was C.
    expect(result.outcomes[0].response).toBe("C");
    expect(result.outcomes[0].correctAnswer).toBe("A");
  });

  it("excludes unkeyed items from the denominator instead of failing them", () => {
    const result = scoreAnswers(["A", "B", "C"], key(["A", null, "C"]));

    expect(result.scorableCount).toBe(2);
    expect(result.correctCount).toBe(2);
    expect(result.percentage).toBe(100);
    expect(result.outcomes[1].status).toBe("unkeyed");
    expect(scorableItemNumbers(key(["A", null, "C"]))).toEqual([1, 3]);
  });

  it("honours per-item points", () => {
    const weighted: AnswerKeyItem[] = [
      { itemNumber: 1, correctAnswer: "A", points: 1, choiceCount: 4 },
      { itemNumber: 2, correctAnswer: "B", points: 3, choiceCount: 4 },
    ];
    const result = scoreAnswers(["A", "B"], weighted);
    expect(result.points).toBe(4);
    expect(result.maxPoints).toBe(4);

    const partial = scoreAnswers(["A", "C"], weighted);
    expect(partial.points).toBe(1);
    expect(partial.percentage).toBe(25);
  });

  it("treats a short answer array as trailing blanks", () => {
    const result = scoreAnswers(["A"], key(["A", "B", "C"]));
    expect(result.correctItems).toEqual([1]);
    expect(result.outcomes[2].status).toBe("blank");
  });

  it("is case- and whitespace-insensitive", () => {
    const result = scoreAnswers([" a ", "b"], key(["A", "B"]));
    expect(result.correctCount).toBe(2);
  });

  it("reports zero rather than dividing by an empty key", () => {
    const result = scoreAnswers([], []);
    expect(result.percentage).toBe(0);
    expect(result.maxPoints).toBe(0);
  });
});

describe("itemSpecsFromKey", () => {
  it("prints a row for an unkeyed item so the grid stays aligned", () => {
    const specs = itemSpecsFromKey(key(["A", null, "C"]));
    expect(specs.map((s) => s.itemNumber)).toEqual([1, 2, 3]);
  });

  it("carries each item's choice count through to the sheet", () => {
    const mixed: AnswerKeyItem[] = [
      { itemNumber: 1, correctAnswer: "A", points: 1, choiceCount: 2 },
      { itemNumber: 2, correctAnswer: "E", points: 1, choiceCount: 5 },
    ];
    expect(itemSpecsFromKey(mixed)).toEqual([
      { itemNumber: 1, choiceCount: 2 },
      { itemNumber: 2, choiceCount: 5 },
    ]);
  });
});

describe("end to end: print geometry -> scan -> score", () => {
  it("turns a rendered sheet into a scored result", () => {
    const answerKey = key(["A", "C", "B", "D", "A", "B"]);
    const layout = buildSheetLayout(itemSpecsFromKey(answerKey));
    const learnerAnswers = ["A", "C", "D", "D", null, "B"]; // one wrong, one blank

    const image = renderSheet(layout, {
      marks: marksFromLetters(learnerAnswers),
      idDigits: encodeStudentCode(3312),
    });

    const decoded = decodeSheet(image, layout);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    expect(decoded.sheet.studentId).toBe(3312);

    const score = scoreAnswers(decoded.sheet.answers, answerKey);
    expect(score.correctItems).toEqual([1, 2, 4, 6]);
    expect(score.correctCount).toBe(4);
    expect(score.scorableCount).toBe(6);
    expect(score.percentage).toBeCloseTo(66.67, 1);
    expect(score.outcomes[2].status).toBe("wrong");
    expect(score.outcomes[4].status).toBe("blank");
  });
});
