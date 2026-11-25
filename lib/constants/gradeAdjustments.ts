// Additional points on a final grade (migration 239). Reasons are app-validated
// free TEXT, so adding one here needs no migration.

export const ADJUSTMENT_REASONS: { value: string; label: string }[] = [
  { value: "extracurricular", label: "Extra-curricular activity points" },
  { value: "competition", label: "Competition / contest award" },
  { value: "representation", label: "School representation" },
  { value: "leadership", label: "Leadership / service" },
  { value: "enrichment", label: "Remediation / enrichment output" },
  { value: "other", label: "Other (describe)" },
];

export const getAdjustmentReasonLabel = (value: string): string =>
  ADJUSTMENT_REASONS.find((r) => r.value === value)?.label ?? value;

export const MAX_ADJUSTMENT_POINTS = 10;
export const MAX_FINAL_GRADE = 100;

/**
 * `semester` of a request on one TERM grade (migration 240): 11-14 = grading
 * period 1-4, beside 0 (the year's final) and 1 / 2 (a semester final). Term
 * points are already inside sms_grades.grade; never add them again.
 */
export const TERM_SLOT_BASE = 10;
export const termSlot = (period: number): number => TERM_SLOT_BASE + period;
export const termOfSlot = (semester: number): number | null =>
  semester > TERM_SLOT_BASE ? semester - TERM_SLOT_BASE : null;

export type AdjustmentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "revoked";
