import type { BookReturnCode } from "@/types/database";

/** Grade levels 1–12 for book catalog filtering and selection */
export const BOOK_GRADE_LEVELS = Array.from({ length: 12 }, (_, i) => i + 1);

/** DepEd return codes for unreturned/lost books */
export const RETURN_CODE_OPTIONS: { value: BookReturnCode; label: string }[] = [
  { value: "FM", label: "FM - Force Majeure" },
  { value: "TDO", label: "TDO - Transferred/Dropout" },
  { value: "NEG", label: "NEG - Negligence" },
];

/** Physical condition options for book returns */
export const CONDITION_OPTIONS = ["Good", "Damaged", "Lost", "Other"] as const;
