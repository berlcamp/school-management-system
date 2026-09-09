import type { PaceRating, PaceTerm } from "@/types";

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
 * The attendance rows of the Grade 1 card, grouped by term.
 *
 * ⚠ The issued workbook prints TWELVE rows, splitting September across Terms 1
 * and 2 because the ten-week term boundary falls inside that month. Nothing in
 * this system records where the boundary lies — terms are period numbers on a
 * grade row, not date ranges — so September is printed once, under Term 1,
 * exactly as the Kindergarten Progress Report (172) already resolves the same
 * question. The monthly totals and the grand total are unaffected; only the
 * per-term subtotal for Terms 1 and 2 differs from a hand-filled sheet whose
 * adviser split the month.
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

/** Is this competency rated in the given term? */
export function isRatedInTerm(terms: PaceTerm[] | null, term: PaceTerm): boolean {
  return !!terms && terms.includes(term);
}

/** A competency with no terms carries no rating cells: a heading or a group parent. */
export function isRateable(terms: PaceTerm[] | null): boolean {
  return !!terms && terms.length > 0;
}
