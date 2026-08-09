import { describe, expect, it } from "vitest";
import { buildSlipsHtml, type ExamResultSlipParams } from "../generateExamResultSlips";
import { scoreAnswers, type AnswerKeyItem } from "@/lib/omr/score";

const answerKey: AnswerKeyItem[] = ["A", "C", "B", "D"].map(
  (correctAnswer, i) => ({
    itemNumber: i + 1,
    correctAnswer,
    choiceCount: 4,
    points: 1,
  }),
);

const params = (
  overrides: Partial<ExamResultSlipParams> = {},
): ExamResultSlipParams => ({
  schoolName: "Bayugan Central Elementary School",
  examTitle: "Periodical Test in Science 5",
  subjectName: "Science",
  sectionName: "Rizal",
  schoolYear: "2026-2027",
  versionLabel: "Set A",
  teacherName: "Ms. Reyes",
  classMps: 72.5,
  learners: [
    {
      studentId: 1,
      name: "Cruz, Ben",
      lrn: "123456789012",
      score: scoreAnswers(["A", "D", "", "D"], answerKey),
      rank: 2,
    },
  ],
  ...overrides,
});

describe("buildSlipsHtml", () => {
  it("shows the learner their own answer beside the key", () => {
    const html = buildSlipsHtml(params());

    expect(html).toContain("Cruz, Ben");
    expect(html).toContain("2 / 4");
    expect(html).toContain("50.00%");
    // Item 2: they answered D, the key is C — both must appear.
    expect(html).toMatch(/<td[^>]*>D<\/td>/);
    expect(html).toMatch(/<td[^>]*>C<\/td>/);
  });

  it("marks a blank as a dash rather than an empty cell", () => {
    const html = buildSlipsHtml(params());
    expect(html).toContain("—");
  });

  it("prints the class MPS and rank for context", () => {
    const html = buildSlipsHtml(params());
    expect(html).toContain("72.50%");
    expect(html).toContain("Rank in section");
  });

  it("escapes learner and school names", () => {
    const html = buildSlipsHtml(
      params({
        schoolName: "St. Mary's <Annex>",
        learners: [
          {
            studentId: 1,
            name: "O'Brien & Sons",
            score: scoreAnswers(["A"], answerKey),
          },
        ],
      }),
    );
    expect(html).toContain("&lt;Annex&gt;");
    expect(html).toContain("O'Brien &amp; Sons");
    expect(html).not.toContain("<Annex>");
  });

  it("prints one slip per learner", () => {
    const html = buildSlipsHtml(
      params({
        learners: [1, 2, 3].map((id) => ({
          studentId: id,
          name: `Learner ${id}`,
          score: scoreAnswers(["A", "C", "B", "D"], answerKey),
        })),
      }),
    );
    expect(html.match(/class="slip"/g)).toHaveLength(3);
  });

  it("refuses to print nothing", () => {
    expect(() => buildSlipsHtml(params({ learners: [] }))).not.toThrow();
  });
});
