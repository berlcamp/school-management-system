import { KinderProgressRating, KinderProgressTerm } from "@/types";

/**
 * Kindergarten Progress Report (migration 172).
 *
 * The rating scale and the term/month grouping printed on the SDO Bayugan City
 * form. Kept here rather than in the database because both are printed as a
 * fixed legend on page 2 of the issued form — they describe the instrument, not
 * a school's data.
 */

export const KINDER_PROGRESS_TERMS: KinderProgressTerm[] = [1, 2, 3];

export const KINDER_TERM_LABELS: Record<KinderProgressTerm, string> = {
  1: "Term 1",
  2: "Term 2",
  3: "Term 3",
};

/** The bilingual heading over each comments block ("TERM 1 (Unang Termino)"). */
export const KINDER_TERM_LABELS_FILIPINO: Record<KinderProgressTerm, string> = {
  1: "Unang Termino",
  2: "Ikalawang Termino",
  3: "Ikatlong Termino",
};

export const KINDER_RATINGS: KinderProgressRating[] = ["BG", "DV", "CO"];

export const KINDER_RATING_LABELS: Record<KinderProgressRating, string> = {
  BG: "Beginning",
  DV: "Developing",
  CO: "Consistent",
};

/**
 * The IMPORTANT NOTE TO PARENTS/GUARDIANS legend, verbatim from the form.
 * Printed best-to-lowest (CO, DV, BG), which is the order the issued form uses.
 */
export const KINDER_RATING_INDICATORS: {
  rating: KinderProgressRating;
  indicators: string[];
}[] = [
  {
    rating: "CO",
    indicators: [
      "Always demonstrates the expected competency",
      "Always participates in the different activities, works independently",
      "Always performs tasks. Advanced in some aspects",
    ],
  },
  {
    rating: "DV",
    indicators: [
      "Sometimes demonstrates the competency",
      "Sometimes participate, minimal supervision",
      "Progresses continuously in doing assigned tasks",
    ],
  },
  {
    rating: "BG",
    indicators: [
      "Rarely demonstrates the expected competency",
      "Rarely participates in class activities and/ or initiates independent works",
      "Shows interest in doing tasks but needs close supervision",
    ],
  },
];

/**
 * The ATTENDANCE RECORD block: which calendar months fall under which term.
 *
 * This is the printed form's own grouping (T1 Jun-Sep, T2 Oct-Dec, T3 Jan-Apr),
 * not a re-derivation of the school calendar — the calendar supplies how many
 * class days each month held, this says which term's row the month prints on.
 * `yearOffset` 0 is the opening year of the school year, 1 the closing one.
 */
export const KINDER_ATTENDANCE_MONTHS: {
  term: KinderProgressTerm;
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

/** The explanatory paragraph under the learner details, verbatim from the form. */
export const KINDER_PROGRESS_INTRO =
  "This progress report informs parents about their child’s learning achievements based on the Kindergarten Curriculum Guide. It provides a summary of the child’s performance and indicates their level of progress across different developmental domains every ten (10) weeks or each quarter. The report also helps determine whether additional time and follow-up support are needed for the child to achieve the expected competencies. Each competency is marked as BG-Beginning, DV-Developing and CO-Consistent.";
