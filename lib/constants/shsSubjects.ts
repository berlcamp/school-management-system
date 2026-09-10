// Senior High subject fields that exist for the SF9 (migration 185).
//
// The issued *SF9 - GRADE 11 ACADEMIC* / *GRADE 12 ACADEMIC* sheets are the
// same Learner's Performance Report the K-10 card prints, plus three things:
// a Units column, Core / Elective group headings, and Effective Communication
// / Mabisang Komunikasyon printed as one learning area with the two languages
// beneath it.
//
// Everything here is presentation. None of it feeds a grade, a general average
// or a promotion decision — see `units` below, which is the one that looks as
// though it should.

import { isShsGrade } from "@/lib/constants/shs";

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * The Units column is **reported, never multiplied**: the General Average on
 * the SHS card is the plain mean of the per-subject finals, exactly as the
 * K-10 card computes it, and the total on that row is the sum of the units of
 * the subjects that counted (39 on the issued Grade 11 sheet, 36 on Grade 12).
 *
 * The stored figure is the subject's units for the whole school year, as it
 * prints — a core subject is 2 units per term on the DepEd HELPER sheet and 6
 * on the card; a one-term academic elective is 3 on both. It is transcribed
 * once and printed back verbatim rather than derived from "units per term x
 * the terms encoded so far", which would report a third of the units on a card
 * printed after Term 1.
 */
export const UNITS_MIN = 1;
export const UNITS_MAX = 50;

export const isValidUnits = (value: number | null | undefined): boolean =>
  value == null || (Number.isInteger(value) && value >= UNITS_MIN && value <= UNITS_MAX);

/** Units print bare, and an untagged subject prints an empty cell. */
export const formatUnits = (value: number | null | undefined): string =>
  value == null ? "" : String(value);

// ---------------------------------------------------------------------------
// Core / Elective grouping
// ---------------------------------------------------------------------------

export type ShsSubjectCategory = "core" | "elective";

/** The two blocks, in the order the card prints them. */
export const SHS_SUBJECT_CATEGORIES: {
  value: ShsSubjectCategory;
  /** The heading row on the card */
  label: string;
  /** Shown in the Subjects form */
  hint: string;
}[] = [
  {
    value: "core",
    label: "Core Subjects",
    hint: "Taken by every SHS learner — the five Grade 11 core learning areas.",
  },
  {
    value: "elective",
    label: "Elective Subjects",
    hint: "Academic or TechPro electives from the learner's cluster.",
  },
];

/** Print order. An untagged subject sorts after both blocks and gets no heading. */
export const shsCategoryRank = (value: ShsSubjectCategory | null): number => {
  if (!value) return SHS_SUBJECT_CATEGORIES.length;
  const index = SHS_SUBJECT_CATEGORIES.findIndex((c) => c.value === value);
  return index === -1 ? SHS_SUBJECT_CATEGORIES.length : index;
};

export const getShsCategoryLabel = (value: ShsSubjectCategory): string =>
  SHS_SUBJECT_CATEGORIES.find((c) => c.value === value)?.label ?? value;

/**
 * Resolve the stored category, rejecting anything unknown — the column is
 * CHECK-constrained but rows read through loosely-typed queries are not, and
 * an unrecognised value must not invent a heading.
 */
export function getShsCategory(subject: {
  shs_category?: string | null;
}): ShsSubjectCategory | null {
  const stored = subject.shs_category;
  if (!stored) return null;
  return SHS_SUBJECT_CATEGORIES.some((c) => c.value === stored)
    ? (stored as ShsSubjectCategory)
    : null;
}

// ---------------------------------------------------------------------------
// Effective Communication / Mabisang Komunikasyon
// ---------------------------------------------------------------------------

export type CommComponent = "effective_communication" | "mabisang_komunikasyon";

/** The parent line, as the issued sheet titles it. */
export const COMM_PARENT_LABEL =
  "Effective Communication / Mabisang Komunikasyon";

/**
 * The two languages, in the order they print beneath the parent. They weigh
 * equally — the workbook's Class Summary carries a column for each and one
 * combined Term Grade, with nothing to suggest either dominates.
 */
export const COMM_COMPONENTS: {
  value: CommComponent;
  label: string;
  short: string;
}[] = [
  {
    value: "effective_communication",
    label: "Effective Communication",
    short: "EC",
  },
  {
    value: "mabisang_komunikasyon",
    label: "Mabisang Komunikasyon",
    short: "MK",
  },
];

export const commComponentRank = (value: CommComponent | null): number => {
  if (!value) return COMM_COMPONENTS.length;
  const index = COMM_COMPONENTS.findIndex((c) => c.value === value);
  return index === -1 ? COMM_COMPONENTS.length : index;
};

export function getCommComponent(subject: {
  comm_component?: string | null;
}): CommComponent | null {
  const stored = subject.comm_component;
  if (!stored) return null;
  return COMM_COMPONENTS.some((c) => c.value === stored)
    ? (stored as CommComponent)
    : null;
}

export const getCommComponentLabel = (value: CommComponent): string =>
  COMM_COMPONENTS.find((c) => c.value === value)?.label ?? value;

export const isCommComponent = (subject: {
  comm_component?: string | null;
}): boolean => getCommComponent(subject) !== null;

/**
 * The three fields are meaningful only in Grades 11-12, which is where the
 * Units column and the group headings exist on the issued form. Nothing
 * refuses them elsewhere — the Subjects form simply does not offer them.
 */
export const usesShsCardFields = (gradeLevel: number | null | undefined): boolean =>
  isShsGrade(gradeLevel);
