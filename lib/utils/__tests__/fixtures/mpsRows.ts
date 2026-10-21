import type { LearnerSexKey } from "@/lib/utils/learnerSex";

/** Raw `sms_exam_results` rows as the /mps page selects them (embedded joins may arrive as arrays). */
export const MPS_ROWS = [
  // Math / 7-A / period 1: two exam versions, averaged.
  {
    id: 1, mps: 80, total_items: 10, exam_id: 11, section_id: 100,
    section: { id: 100, name: "7-A", grade_level: 7 },
    exam: { tos: { subject_name: "Mathematics", subject_id: 5, grade_level: 7, grading_period: 1 } },
  },
  {
    id: 2, mps: "70.5", total_items: 10, exam_id: 12, section_id: 100,
    section: [{ id: 100, name: "7-A", grade_level: 7 }],
    exam: [{ tos: [{ subject_name: "Mathematics", subject_id: 5, grade_level: 7, grading_period: 1 }] }],
  },
  // Math / 7-B / period 1.
  {
    id: 3, mps: 92, total_items: 20, exam_id: 11, section_id: 101,
    section: { id: 101, name: "7-B", grade_level: 7 },
    exam: { tos: { subject_name: "Mathematics", subject_id: 5, grade_level: 7, grading_period: 1 } },
  },
  // Math / 7-A / period 2.
  {
    id: 4, mps: 65, total_items: 10, exam_id: 13, section_id: 100,
    section: { id: 100, name: "7-A", grade_level: 7 },
    exam: { tos: { subject_name: "Mathematics", subject_id: 5, grade_level: 7, grading_period: 2 } },
  },
  // Null subject id on the TOS (legacy), section grade overrides TOS grade.
  {
    id: 5, mps: 77, total_items: 10, exam_id: 14, section_id: 102,
    section: { id: 102, name: "8-A", grade_level: 8 },
    exam: { tos: { subject_name: "Science", subject_id: null, grade_level: 7, grading_period: 1 } },
  },
  // No section (falls back to TOS grade level).
  {
    id: 6, mps: 55, total_items: 10, exam_id: 15, section_id: 103,
    section: null,
    exam: { tos: { subject_name: "Science", subject_id: null, grade_level: 9, grading_period: 3 } },
  },
  // Skipped: null mps.
  {
    id: 7, mps: null, total_items: 10, exam_id: 16, section_id: 100,
    section: { id: 100, name: "7-A", grade_level: 7 },
    exam: { tos: { subject_name: "Mathematics", subject_id: 5, grade_level: 7, grading_period: 3 } },
  },
  // Skipped: no TOS.
  {
    id: 8, mps: 90, total_items: 10, exam_id: 17, section_id: 100,
    section: { id: 100, name: "7-A", grade_level: 7 },
    exam: { tos: null },
  },
];

type Mark = { sex: LearnerSexKey; correctItems: Set<number> };
const items = (n: number) => new Set(Array.from({ length: n }, (_, i) => i));

/** Learner marks per result id, the shape `fetchResultMarks` returns. */
export const MPS_MARKS = new Map<string, Mark[]>([
  ["1", [
    { sex: "male", correctItems: items(8) },
    { sex: "female", correctItems: items(6) },
    { sex: "unspecified", correctItems: items(2) },
  ]],
  ["2", [{ sex: "male", correctItems: items(7) }]],
  ["3", [
    { sex: "female", correctItems: items(18) },
    { sex: "female", correctItems: items(20) },
  ]],
  ["4", []],
  ["5", [{ sex: "male", correctItems: items(9) }]],
  ["6", [{ sex: "female", correctItems: items(5) }]],
]);
