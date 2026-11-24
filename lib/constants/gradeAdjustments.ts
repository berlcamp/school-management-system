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

export type AdjustmentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "revoked";
