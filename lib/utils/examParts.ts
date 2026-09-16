/**
 * Recovering an exam's PARTS from its stored questions and section rows.
 *
 * A part is one printed block — "Part III. Multiple Choice" — with its own
 * directions. Since migration 187 a question type may open more than one part
 * (DepEd papers routinely run I. Multiple Choice / II. Essay / III. Multiple
 * Choice), so a part is identified by its POSITION, never by its type.
 *
 * Two readings, because the column that says so is nullable and nothing was
 * backfilled:
 *
 *   - `part_position` set   → group by it. Exact, and the only reading that can
 *                             tell two ADJACENT parts of the same type apart.
 *   - `part_position` NULL  → group by consecutive run of `question_type`, which
 *                             is what the builder and the printed paper did
 *                             before 187. Every pre-187 exam reads this way and
 *                             is unaffected.
 *
 * This lives in one place so the builder and the paper cannot drift: what a
 * teacher edits as Part III has to print as Part III.
 */

import type { ExamQuestionType } from "@/lib/constants/examinations";

/** A stored `sms_exam_sections` row, as much of it as grouping needs. */
export interface ExamPartSection {
  question_type: string;
  instructions: string | null;
  position: number | null;
}

/** The fields grouping reads off a question; callers pass their own richer row. */
export interface ExamPartQuestion {
  question_type: ExamQuestionType;
  part_position?: number | null;
}

export interface ExamPart<Q extends ExamPartQuestion> {
  /** 1-based printed part number — what `toRoman()` turns into I / II / III. */
  partNo: number;
  type: ExamQuestionType;
  /** The section row backing this part, when one was found. */
  section?: ExamPartSection;
  questions: Q[];
}

/**
 * Group an exam's questions into its printed parts.
 *
 * `questions` must already be in stored `position` order — that order IS the
 * paper. Section rows may arrive in any order; they are sorted here.
 */
export function groupExamParts<Q extends ExamPartQuestion>(
  questions: Q[],
  sections?: ExamPartSection[] | null,
): ExamPart<Q>[] {
  const sectionsInOrder = [...(sections || [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );

  // A single question with no part_position is enough to fall back: a half-
  // adopted exam must not split into one grouping for its old questions and
  // another for its new ones.
  const grouped: { type: ExamQuestionType; key: number | null; questions: Q[] }[] =
    [];
  const positioned =
    questions.length > 0 &&
    questions.every((q) => typeof q.part_position === "number");

  for (const q of questions) {
    const key = positioned ? (q.part_position as number) : null;
    const last = grouped[grouped.length - 1];
    const samePart = positioned
      ? last && last.key === key
      : last && last.type === q.question_type;
    if (last && samePart) last.questions.push(q);
    else grouped.push({ type: q.question_type, key, questions: [q] });
  }

  return grouped.map((g, i) => {
    // By position when the questions carry one; otherwise by index, which is
    // 1:1 because the builder writes one section per non-empty part. A section
    // row that has drifted out of step falls back to the first of its type —
    // the pre-187 reading — rather than attaching another part's directions.
    const byPosition =
      g.key === null
        ? undefined
        : sectionsInOrder.find((s) => (s.position ?? 0) === g.key);
    const byIndex = sectionsInOrder[i];
    const section =
      byPosition ??
      (byIndex && byIndex.question_type === g.type
        ? byIndex
        : sectionsInOrder.find((s) => s.question_type === g.type));

    return { partNo: i + 1, type: g.type, section, questions: g.questions };
  });
}
