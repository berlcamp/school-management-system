import { GRADE_LEVELS } from "@/lib/constants";
import type { BookReturnCode } from "@/types/database";

/**
 * Grade levels a title can be catalogued for. The same list every other module
 * offers — SNED (-1), Kindergarten (0), Grades 1-12 — rather than a second copy
 * that can drift: a book is catalogued for the grade of the section it will be
 * issued to, and both of those sections exist. See migration 184.
 */
export const BOOK_GRADE_LEVELS = GRADE_LEVELS;

/** DepEd return codes for unreturned/lost books */
export const RETURN_CODE_OPTIONS: { value: BookReturnCode; label: string }[] = [
  { value: "FM", label: "FM - Force Majeure" },
  { value: "TDO", label: "TDO - Transferred/Dropout" },
  { value: "NEG", label: "NEG - Negligence" },
];

/** Physical condition options for book returns */
export const CONDITION_OPTIONS = ["Good", "Damaged", "Lost", "Other"] as const;
