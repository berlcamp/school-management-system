/**
 * Question Bank (migration 195). The SQL is the enforcement —
 * `llc_count()` and `bank_supported_types()` in 195. Keep these in step.
 */
import type { ExamQuestionType } from "@/lib/constants/examinations";

/** How many least learned competencies a list shows (ties at the cut kept). */
export const LLC_COUNT = 3;

export const BANK_SUPPORTED_TYPES = ["multiple_choice", "true_false"] as const satisfies readonly ExamQuestionType[];
export type BankQuestionType = (typeof BANK_SUPPORTED_TYPES)[number];

export function isBankSupportedType(t: string): t is BankQuestionType {
  return (BANK_SUPPORTED_TYPES as readonly string[]).includes(t);
}

export const NEW_QUESTION_WORDING =
  "New question — stays in this exam only and is reviewed with the questionnaire.";

export const LLC_COVERAGE_NOTE =
  "Only Summative Test results whose TOS was built from the competency catalogue are counted.";

export const BANK_LEVEL_MISMATCH_CONFIRM =
  "Use anyway — this level mismatch is intentional";

/** Catalogue grades: K (0) through 12. SNED (-1) is not a catalogue grade. */
export const CATALOGUE_GRADES: readonly number[] = Array.from({ length: 13 }, (_, i) => i);

export function catalogueGradeLabel(g: number): string {
  return g === 0 ? "Kindergarten" : `Grade ${g}`;
}
