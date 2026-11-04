import { GRADE_LEVELS } from "@/lib/constants";
import type { BookReturnCode, BookSource } from "@/types/database";

/**
 * Grade levels a title can be catalogued for. The same list every other module
 * offers — SNED (-1), Kindergarten (0), Grades 1-12 — rather than a second copy
 * that can drift: a book is catalogued for the grade of the section it will be
 * issued to, and both of those sections exist. See migration 184.
 */
export const BOOK_GRADE_LEVELS = GRADE_LEVELS;

/** Where a school received a title from. Stored on `sms_books.source` (migration 228). */
export const BOOK_SOURCE_OPTIONS: { value: BookSource; label: string }[] = [
  { value: "central_office", label: "Central Office" },
  { value: "regional_office", label: "Regional Office" },
  { value: "division_office", label: "Division Office" },
  { value: "library_hub", label: "Library Hub" },
];

export const getBookSourceLabel = (source?: string | null): string | null =>
  BOOK_SOURCE_OPTIONS.find((option) => option.value === source)?.label ?? null;

/** DepEd return codes for unreturned/lost books */
export const RETURN_CODE_OPTIONS: { value: BookReturnCode; label: string }[] = [
  { value: "FM", label: "FM - Force Majeure" },
  { value: "TDO", label: "TDO - Transferred/Dropout" },
  { value: "NEG", label: "NEG - Negligence" },
];

/** Physical condition options for book returns */
export const CONDITION_OPTIONS = ["Good", "Damaged", "Lost", "Other"] as const;
