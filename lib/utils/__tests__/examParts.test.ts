import { describe, expect, it } from "vitest";

import {
  groupExamParts,
  type ExamPartQuestion,
  type ExamPartSection,
} from "@/lib/utils/examParts";

import type { ExamQuestionType } from "@/lib/constants/examinations";

/** A stored question, in the order it appears on the paper. */
const q = (
  type: ExamQuestionType,
  part_position: number | null = null,
): ExamPartQuestion & { label: string } => ({
  question_type: type,
  part_position,
  label: `${type}@${part_position ?? "-"}`,
});

const section = (
  question_type: ExamQuestionType,
  position: number,
  instructions: string | null = null,
): ExamPartSection => ({ question_type, instructions, position });

describe("groupExamParts", () => {
  describe("pre-187 exams (part_position NULL)", () => {
    it("groups consecutive runs of the same type", () => {
      const parts = groupExamParts(
        [
          q("multiple_choice"),
          q("multiple_choice"),
          q("essay"),
          q("true_false"),
        ],
        [
          section("multiple_choice", 0),
          section("essay", 1),
          section("true_false", 2),
        ],
      );

      expect(parts.map((p) => [p.partNo, p.type, p.questions.length])).toEqual([
        [1, "multiple_choice", 2],
        [2, "essay", 1],
        [3, "true_false", 1],
      ]);
    });

    it("reopens a repeated type as separate parts", () => {
      // The ticket: I. Multiple Choice / II. Essay / III. Multiple Choice.
      const parts = groupExamParts(
        [q("multiple_choice"), q("essay"), q("multiple_choice")],
        [
          section("multiple_choice", 0, "Encircle the letter."),
          section("essay", 1, "Answer in five sentences."),
          section("multiple_choice", 2, "Shade the circle."),
        ],
      );

      expect(parts.map((p) => p.type)).toEqual([
        "multiple_choice",
        "essay",
        "multiple_choice",
      ]);
      // Each part keeps its OWN directions — matched by index, not by type,
      // which is what would have handed Part III Part I's wording.
      expect(parts.map((p) => p.section?.instructions)).toEqual([
        "Encircle the letter.",
        "Answer in five sentences.",
        "Shade the circle.",
      ]);
    });

    it("cannot split two ADJACENT parts of one type — which is why 187 stores it", () => {
      const parts = groupExamParts(
        [q("multiple_choice"), q("multiple_choice")],
        [section("multiple_choice", 0), section("multiple_choice", 1)],
      );
      expect(parts).toHaveLength(1);
    });
  });

  describe("post-187 exams (part_position set)", () => {
    it("splits two adjacent parts of the same type", () => {
      const parts = groupExamParts(
        [
          q("multiple_choice", 0),
          q("multiple_choice", 0),
          q("multiple_choice", 1),
        ],
        [
          section("multiple_choice", 0, "Set A"),
          section("multiple_choice", 1, "Set B"),
        ],
      );

      expect(parts.map((p) => [p.partNo, p.questions.length])).toEqual([
        [1, 2],
        [2, 1],
      ]);
      expect(parts.map((p) => p.section?.instructions)).toEqual([
        "Set A",
        "Set B",
      ]);
    });

    it("matches directions by position, not by order of arrival", () => {
      const parts = groupExamParts(
        [q("multiple_choice", 0), q("essay", 1), q("multiple_choice", 2)],
        // Deliberately shuffled — the rows come back in whatever order.
        [
          section("multiple_choice", 2, "third"),
          section("multiple_choice", 0, "first"),
          section("essay", 1, "second"),
        ],
      );

      expect(parts.map((p) => p.section?.instructions)).toEqual([
        "first",
        "second",
        "third",
      ]);
    });

    it("falls back to runs when the column is only half adopted", () => {
      // A half-adopted exam must read one way throughout, never split into two
      // groupings that disagree about where a part ends.
      const parts = groupExamParts(
        [q("multiple_choice", 0), q("multiple_choice", 1), q("essay", null)],
        [
          section("multiple_choice", 0),
          section("multiple_choice", 1),
          section("essay", 2),
        ],
      );
      expect(parts.map((p) => p.type)).toEqual(["multiple_choice", "essay"]);
    });
  });

  describe("missing or drifted section rows", () => {
    it("leaves a part with no section rather than borrowing another's", () => {
      const parts = groupExamParts(
        [q("multiple_choice", 0), q("essay", 1)],
        [section("multiple_choice", 0, "Encircle.")],
      );
      expect(parts[0].section?.instructions).toBe("Encircle.");
      expect(parts[1].section).toBeUndefined();
    });

    it("falls back to the first row of the type when the index disagrees", () => {
      const parts = groupExamParts(
        [q("essay"), q("multiple_choice")],
        // Only one row, and it is not at the index the essay part sits at.
        [section("multiple_choice", 0, "Encircle.")],
      );
      expect(parts[0].section).toBeUndefined();
      expect(parts[1].section?.instructions).toBe("Encircle.");
    });

    it("returns no parts for an exam with no questions", () => {
      expect(groupExamParts([], [section("essay", 0)])).toEqual([]);
      expect(groupExamParts([])).toEqual([]);
    });
  });
});
