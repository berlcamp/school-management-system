/**
 * Constants & helpers for the Examinations modules:
 *   - TOS           (Table of Specification)   this file's focus
 *   - Exam Creator  (built from a TOS)          later
 *   - Item Analysis (with MPS, from results)    later
 *
 * A TOS distributes exam items across the Most Essential Learning Competencies
 * (MELCs) and Bloom's six cognitive levels, grouped into three thinking-skill
 * tiers: LOTS / MOTS / HOTS.
 */

// ---------------------------------------------------------------------------
// Bloom cognitive levels + thinking-skill tiers
// ---------------------------------------------------------------------------
export type CognitiveLevel =
  | "remembering"
  | "understanding"
  | "applying"
  | "analyzing"
  | "evaluating"
  | "creating";

export type ThinkingSkillTier = "LOTS" | "MOTS" | "HOTS";

export interface BloomLevel {
  value: CognitiveLevel;
  label: string;
  tier: ThinkingSkillTier;
}

/** The six cognitive levels in canonical (column) order. */
export const BLOOM_LEVELS: BloomLevel[] = [
  { value: "remembering", label: "Remembering", tier: "LOTS" },
  { value: "understanding", label: "Understanding", tier: "LOTS" },
  { value: "applying", label: "Applying", tier: "MOTS" },
  { value: "analyzing", label: "Analyzing", tier: "MOTS" },
  { value: "evaluating", label: "Evaluation", tier: "HOTS" },
  { value: "creating", label: "Creating", tier: "HOTS" },
];

export const COGNITIVE_LEVEL_VALUES: CognitiveLevel[] = BLOOM_LEVELS.map(
  (l) => l.value,
);

export function getCognitiveLevelLabel(
  level: string | null | undefined,
): string {
  if (!level) return "-";
  return BLOOM_LEVELS.find((l) => l.value === level)?.label ?? level;
}

export interface ThinkingSkillTierInfo {
  key: ThinkingSkillTier;
  label: string;
  levels: CognitiveLevel[];
}

/** Grouped column headers for the TOS grid (LOTS / MOTS / HOTS). */
export const THINKING_SKILL_TIERS: ThinkingSkillTierInfo[] = [
  {
    key: "LOTS",
    label: "Lower-order Thinking Skills",
    levels: ["remembering", "understanding"],
  },
  {
    key: "MOTS",
    label: "Moderate-order Thinking Skills",
    levels: ["applying", "analyzing"],
  },
  {
    key: "HOTS",
    label: "Higher-order Thinking Skills",
    levels: ["evaluating", "creating"],
  },
];

// ---------------------------------------------------------------------------
// Exam types (label adapts to term- vs quarter-based school years app-side)
// ---------------------------------------------------------------------------
export const EXAM_TYPE_QUARTERLY = "Quarterly Examination";
export const EXAM_TYPE_TERM = "Term Examination";

export const EXAM_TYPE_OPTIONS = [
  EXAM_TYPE_QUARTERLY,
  EXAM_TYPE_TERM,
  "Midterm Examination",
  "Final Examination",
  "Unit Test",
  "Periodical Test",
] as const;

// Default footer legend shown on the printed TOS (editable per document).
export const TOS_DEFAULT_LEGEND =
  "*Problem Solving; **Information Literacy; ***Critical Thinking";

// ---------------------------------------------------------------------------
// Exam Creator — question types
// ---------------------------------------------------------------------------
export type ExamQuestionType =
  | "multiple_choice"
  | "true_false"
  | "modified_true_false"
  | "matching"
  | "short_answer"
  | "completion"
  | "essay";

export interface ExamQuestionTypeInfo {
  value: ExamQuestionType;
  label: string;
  /** MC choices / matching Column-B pool. */
  hasOptions: boolean;
  /** Matching premises (Column A) or completion blanks. */
  hasSubitems: boolean;
  /** A single free-text correct answer on the question itself. */
  hasAnswerKey: boolean;
  /** Auto-scorable per item (essay is not). */
  autoScorable: boolean;
}

export const EXAM_QUESTION_TYPES: ExamQuestionTypeInfo[] = [
  {
    value: "multiple_choice",
    label: "Multiple Choice",
    hasOptions: true,
    hasSubitems: false,
    hasAnswerKey: false,
    autoScorable: true,
  },
  {
    value: "true_false",
    label: "True / False",
    hasOptions: false,
    hasSubitems: false,
    hasAnswerKey: true,
    autoScorable: true,
  },
  {
    value: "modified_true_false",
    label: "Modified True / False",
    hasOptions: false,
    hasSubitems: false,
    hasAnswerKey: true,
    autoScorable: true,
  },
  {
    value: "matching",
    label: "Matching Type",
    hasOptions: true,
    hasSubitems: true,
    hasAnswerKey: false,
    autoScorable: true,
  },
  {
    value: "short_answer",
    label: "Short Answer (Identification)",
    hasOptions: false,
    hasSubitems: false,
    hasAnswerKey: true,
    autoScorable: true,
  },
  {
    value: "completion",
    label: "Completion Test",
    hasOptions: false,
    hasSubitems: true,
    hasAnswerKey: false,
    autoScorable: true,
  },
  {
    value: "essay",
    label: "Essay",
    hasOptions: false,
    hasSubitems: false,
    hasAnswerKey: true,
    autoScorable: false,
  },
];

export function getExamQuestionType(
  type: string | null | undefined,
): ExamQuestionTypeInfo | undefined {
  return EXAM_QUESTION_TYPES.find((t) => t.value === type);
}

export function getExamQuestionTypeLabel(
  type: string | null | undefined,
): string {
  if (!type) return "-";
  return getExamQuestionType(type)?.label ?? type;
}

/** A / B / C … label for a 0-based option index. */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index); // 65 = 'A'
}

export const TRUE_FALSE_ANSWERS = ["True", "False"] as const;

/** Default directions per question type (part instructions on the printed exam). */
export const EXAM_DEFAULT_DIRECTIONS: Record<ExamQuestionType, string> = {
  multiple_choice:
    "Read each item carefully and write the letter of the correct answer on the space provided.",
  true_false:
    "Write TRUE if the statement is correct and FALSE if it is incorrect.",
  modified_true_false:
    "Write TRUE if the statement is correct. If it is false, write the word or phrase that makes it correct.",
  matching:
    "Match Column A with Column B. Write the letter of the correct answer on the space provided.",
  short_answer:
    "Identify what is being asked. Write your answer on the space provided.",
  completion:
    "Complete each statement by writing the correct answer on the blank.",
  essay: "Answer the following comprehensively.",
};

const ROMAN: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** Roman numeral for a part number (1 -> "I", 4 -> "IV" …). */
export function toRoman(n: number): string {
  let num = n;
  let out = "";
  for (const [value, symbol] of ROMAN) {
    while (num >= value) {
      out += symbol;
      num -= value;
    }
  }
  return out || String(n);
}
