import type { PaceCompetency, PaceMacroSkill, PaceRating, PaceTerm } from "@/types";

/**
 * Grade 1 PACE form and Learner's Progress Report Card (migration 180).
 *
 * The rating scale, its bilingual descriptors and the term labels printed on
 * the issued SDO Bayugan City form. Kept here rather than in the database
 * because they are printed as a fixed legend on the card — they describe the
 * instrument, not a school's data, exactly as `kinderProgress.ts` keeps
 * BG/DV/CO. The competency lists themselves ARE data and live in
 * `sms_pace_competencies`, because a DepEd revision edits rows there.
 */

export const PACE_TERMS: PaceTerm[] = [1, 2, 3];

export const PACE_TERM_LABELS: Record<PaceTerm, string> = {
  1: "Term 1",
  2: "Term 2",
  3: "Term 3",
};

/** The bilingual heading over each narrative block ("TERM 1 (UNANG TERMINO)"). */
export const PACE_TERM_LABELS_FILIPINO: Record<PaceTerm, string> = {
  1: "Unang Termino",
  2: "Ikalawang Termino",
  3: "Ikatlong Termino",
};

export const PACE_RATINGS: PaceRating[] = ["A", "B", "C", "D", "E"];

export const PACE_RATING_LABELS: Record<PaceRating, string> = {
  A: "Advancing",
  B: "Benchmarking",
  C: "Connecting",
  D: "Developing",
  E: "Emerging",
};

/** The Filipino name printed beside each descriptor on the card's legend. */
export const PACE_RATING_LABELS_FILIPINO: Record<PaceRating, string> = {
  A: "Namumukod-tangi",
  B: "Naipamamalas",
  C: "Natutungo",
  D: "Nagpapaunlad",
  E: "Nagsisimula",
};

/**
 * "Performance levels used in monitoring" — the legend block, verbatim from
 * the issued card, best to lowest as printed.
 */
export const PACE_RATING_DESCRIPTIONS: Record<PaceRating, string> = {
  A: "Consistently demonstrates advanced skills, understanding, and values beyond expectations; applies learning independently, confidently, and with initiative across tasks and situations.",
  B: "Demonstrates expected skills, understanding, and values at grade level with consistency; performs tasks accurately and independently in most situations.",
  C: "Shows developing skills, understanding, and values; able to apply learning in familiar tasks with minimal guidance and support.",
  D: "Demonstrates emerging skills, understanding, and values; requires regular guidance, practice, and support to improve performance.",
  E: "Beginning to demonstrate basic skills, understanding, and values; requires close supervision, structured support, and targeted intervention.",
};

/** General instructions printed at the head of the PACE form, verbatim. */
export const PACE_GENERAL_INSTRUCTIONS =
  "Teachers shall accomplish this form on a regular basis throughout the term, not as a one-time entry, by recording the learner’s level of attainment for each learning competency using the appropriate descriptor: A (Advancing), B (Benchmarking), C (Connecting), D (Developing), or E (Emerging). Entries shall be made in the corresponding term only after the learner has engaged in a series of formative tasks and activities and has completed a relevant summative assessment. The assigned level shall be based on sufficient and varied evidence of learning, including learner outputs, observations, anecdotal records, and other assessment results, and shall reflect the learner’s most consistent level of performance.";

/** The two narrative blocks of the card, with the Filipino subtitle printed under each. */
export const GRADE1_NARRATIVE_BLOCKS = [
  { key: "can_do" as const, title: "What Your Child Can Do", filipino: "Mga Nagagawa" },
  {
    key: "to_improve" as const,
    title: "What Your Child Is Learning To Improve",
    filipino: "Dapat Linangin",
  },
];

/** The card's two opening paragraphs to the parent, verbatim. */
export const GRADE1_CARD_INTRO: string[] = [
  "This report provides a descriptive account of your child’s learning progress for each term. It highlights what your child can already do, what they are currently developing, and how they can be further supported.",
  "This report is based on varied evidence of learning, including classroom activities, observations, learner outputs, and assessments. It is designed to give a clearer and more meaningful understanding of your child’s development rather than relying on numerical or letter grades.",
];

/** The IMPORTANT NOTE TO PARENTS/GUARDIANS block, verbatim. */
export const GRADE1_CARD_IMPORTANT_NOTE =
  "A detailed record of your child’s progress across specific learning competencies is attached in the succeeding pages. This includes the monitoring of skills in Reading and Literacy, Language, Mathematics, Good Manners and Right Conduct, and Makabansa.";

/**
 * The months on the Grade 1 card's attendance record, June to April, each
 * with the term it belongs to when no term dates are set.
 *
 * The issued card prints TWELVE rows, splitting September across Terms 1 and
 * 2 because the term boundary falls inside that month. Where the school (or
 * the division) has entered its term dates (`sms_school_term_dates`,
 * migration 205), `grade1AttendanceRows` splits whichever month a boundary
 * falls inside into one row per term. Without them September prints once,
 * under the `term` given here — monthly and grand totals are the same either
 * way, only the Term 1/2 subtotals differ.
 */
export const GRADE1_ATTENDANCE_MONTHS: {
  term: PaceTerm;
  month: number;
  yearOffset: 0 | 1;
  label: string;
}[] = [
  { term: 1, month: 6, yearOffset: 0, label: "June" },
  { term: 1, month: 7, yearOffset: 0, label: "July" },
  { term: 1, month: 8, yearOffset: 0, label: "August" },
  { term: 1, month: 9, yearOffset: 0, label: "September" },
  { term: 2, month: 10, yearOffset: 0, label: "October" },
  { term: 2, month: 11, yearOffset: 0, label: "November" },
  { term: 2, month: 12, yearOffset: 0, label: "December" },
  { term: 3, month: 1, yearOffset: 1, label: "January" },
  { term: 3, month: 2, yearOffset: 1, label: "February" },
  { term: 3, month: 3, yearOffset: 1, label: "March" },
  { term: 3, month: 4, yearOffset: 1, label: "April" },
];

// ---------------------------------------------------------------------------
// Macro skills (migration 205)
// ---------------------------------------------------------------------------

/**
 * The language macro skills Reading and Literacy and Language are rated on,
 * in the order the legend prints them. `color` is the fill of the square on
 * the issued workbook, read off its cells, so the printed form matches the
 * paper the adviser already knows.
 */
export const PACE_MACRO_SKILLS: PaceMacroSkill[] = ["listening", "speaking", "reading", "writing"];

export const PACE_MACRO_SKILL_LABELS: Record<PaceMacroSkill, string> = {
  listening: "Listening",
  speaking: "Speaking",
  reading: "Reading",
  writing: "Copying and Guided Writing in response to Comprehension Questions",
};

/** Short names for a narrow column header or a cell's tooltip. */
export const PACE_MACRO_SKILL_SHORT: Record<PaceMacroSkill, string> = {
  listening: "Listening",
  speaking: "Speaking",
  reading: "Reading",
  writing: "Writing",
};

/** One letter per skill, for column headers too narrow for a word. */
export const PACE_MACRO_SKILL_LETTER: Record<PaceMacroSkill, string> = {
  listening: "L",
  speaking: "S",
  reading: "R",
  writing: "W",
};

/** The square's fill on the issued workbook. */
export const PACE_MACRO_SKILL_COLORS: Record<PaceMacroSkill, string> = {
  listening: "#FFE598",
  speaking: "#C9A6E6",
  reading: "#F7B083",
  writing: "#C4E0B3",
};

/** The note printed under the Reading and Literacy and Language lists, verbatim. */
export const PACE_MACRO_SKILL_NOTE =
  "Note: Each colored square represents a language macro skill. Refer to the legend to identify the skill, and write the learner’s rating directly on the colored square for each term.";

/**
 * `sms_pace_ratings`' unique key, for upserts. `macro_skill` is in it with
 * NULLS NOT DISTINCT (migration 205), so a whole-competency rating (NULL) is
 * still one row per term.
 */
export const PACE_RATING_CONFLICT =
  "student_id,competency_id,section_id,school_year,term,macro_skill";

/** A rating square: the skill it is coloured for (null = the competency as a whole) and its terms. */
export interface PaceRatingSlot {
  skill: PaceMacroSkill | null;
  terms: PaceTerm[];
}

/**
 * The squares a competency is rated on: one per macro skill where the form
 * colours them, otherwise a single whole-competency square over its terms.
 * Empty for a heading or a group parent, which carry no squares at all.
 */
export function ratingSlots(c: Pick<PaceCompetency, "is_heading" | "terms" | "macro_skills">): PaceRatingSlot[] {
  if (c.is_heading || !c.terms || c.terms.length === 0) return [];
  const skills = (c.macro_skills ?? []).filter(
    (s) => PACE_MACRO_SKILLS.includes(s.skill) && s.terms.length > 0,
  );
  if (skills.length === 0) return [{ skill: null, terms: c.terms }];
  return skills.map((s) => ({ skill: s.skill, terms: s.terms }));
}

/** Is this competency rated in the given term? */
export function isRatedInTerm(terms: PaceTerm[] | null, term: PaceTerm): boolean {
  return !!terms && terms.includes(term);
}

/** A competency with no terms carries no rating cells: a heading or a group parent. */
export function isRateable(terms: PaceTerm[] | null): boolean {
  return !!terms && terms.length > 0;
}

/**
 * Grade 1 reports no numeric grades: it is rated A–E on the PACE form and
 * reported on the Learner's Progress Report Card (migration 180), so the class
 * record, grade entry and the numeric report card all hand off to /teacher/pace.
 * `grade_level` has been seen stored as text (migration 157), hence the Number().
 */
export function usesPaceForm(gradeLevel: number | string | null | undefined): boolean {
  return gradeLevel !== null && gradeLevel !== undefined && gradeLevel !== "" &&
    Number(gradeLevel) === 1;
}

/** The PACE & Progress Card page, opened on one section and school year. */
export function pacePageHref(sectionId: string | number, schoolYear: string): string {
  return `/teacher/pace?section=${encodeURIComponent(String(sectionId))}&school_year=${encodeURIComponent(schoolYear)}`;
}
