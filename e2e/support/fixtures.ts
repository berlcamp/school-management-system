/**
 * Shared seed data for the examinations e2e specs.
 *
 * One exam, one section, three learners — small enough to assert on exactly,
 * and shaped like what the real queries return (including the embedded `tos`,
 * which the workspace reads through a PostgREST join).
 */

import type { AnswerKeyItem } from "../../lib/omr/score";
import { TEST_USER } from "./supabaseMock";

export const SCHOOL_YEAR = "2026-2027";
export const EXAM_ID = 9001;
export const SECTION_ID = 3001;

export const LEARNERS = [
  { id: 70001, first_name: "Ana", last_name: "Bautista", lrn: "100000000001" },
  { id: 70002, first_name: "Ben", last_name: "Cruz", lrn: "100000000002" },
  { id: 70003, first_name: "Cely", last_name: "Dizon", lrn: "100000000003" },
];

/** An exam the test teacher owns, so the answer key is editable. */
export const OWNED_EXAM = {
  id: EXAM_ID,
  version_label: "Set A",
  title: "Periodical Test in Science 5",
  school_id: TEST_USER.schoolId,
  created_by: TEST_USER.systemUserId,
  is_active: true,
  tos: {
    subject_name: "Science",
    grade_level: 5,
    exam_type: "Periodical Test",
    grading_period: 1,
    school_year: SCHOOL_YEAR,
    title: "Science 5 TOS",
  },
};

/** The same exam authored by the division: shared, and read-only to a teacher. */
export const DIVISION_EXAM = {
  ...OWNED_EXAM,
  school_id: null,
  created_by: 999,
};

/**
 * Sections reach the page through the teacher's schedules, so the row carries
 * the columns that query filters on as well as the embedded section.
 */
export const SECTION_ROWS = [
  {
    section_id: SECTION_ID,
    teacher_id: TEST_USER.systemUserId,
    school_year: SCHOOL_YEAR,
    sections: {
      id: SECTION_ID,
      name: "Rizal",
      grade_level: 5,
      school_id: TEST_USER.schoolId,
    },
  },
];

export const ENROLLMENT_ROWS = LEARNERS.map((learner) => ({
  student_id: learner.id,
  section_id: SECTION_ID,
  school_year: SCHOOL_YEAR,
  status: "approved",
  enrollment_status: "active",
}));

export const STUDENT_ROWS = LEARNERS.map((learner) => ({
  id: learner.id,
  first_name: learner.first_name,
  last_name: learner.last_name,
  lrn: learner.lrn,
}));

/** A ten-item, four-choice key: the shape almost every periodical test has. */
export const TEN_ITEM_KEY: AnswerKeyItem[] = [
  "A",
  "C",
  "B",
  "D",
  "A",
  "B",
  "D",
  "C",
  "A",
  "B",
].map((correctAnswer, index) => ({
  itemNumber: index + 1,
  correctAnswer,
  choiceCount: 4,
  points: 1,
}));

export const TEN_ITEM_KEY_ROWS = TEN_ITEM_KEY.map((item) => ({
  id: 8000 + item.itemNumber,
  exam_id: EXAM_ID,
  item_number: item.itemNumber,
  correct_answer: item.correctAnswer,
  choice_count: item.choiceCount,
  points: item.points,
}));

export function learnerFullName(index: number): string {
  const learner = LEARNERS[index];
  return `${learner.last_name}, ${learner.first_name}`;
}
