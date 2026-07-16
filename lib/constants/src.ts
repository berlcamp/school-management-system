import type {
  SrcAwardCategory,
  SrcAwardLevel,
  SrcSectionKey,
  SrcSignatoryRole,
} from "@/types";

/**
 * School Report Card (SRC) — section metadata and column specs.
 * The annual school-level accountability document, not the learner's SF9.
 */

export type SrcSectionGroup = "profile" | "access_quality" | "governance" | "ratios";

export interface SrcSectionMeta {
  key: SrcSectionKey;
  numeral: string;
  title: string;
  group: SrcSectionGroup;
  /** Prefilled by the src_autofill RPC; the school head can still override. */
  autofilled: boolean;
}

export const SRC_SECTIONS: SrcSectionMeta[] = [
  { key: "enrollment", numeral: "I", title: "Enrollment", group: "profile", autofilled: true },
  { key: "health", numeral: "II", title: "Health and Nutritional Status", group: "profile", autofilled: true },
  { key: "materials", numeral: "III", title: "Learners' Materials", group: "profile", autofilled: false },
  { key: "professional_development", numeral: "IV", title: "Teachers' Professional Development", group: "profile", autofilled: false },
  { key: "funding", numeral: "V", title: "Funding Sources", group: "profile", autofilled: false },
  { key: "awards", numeral: "VI", title: "School Awards and Recognitions", group: "profile", autofilled: false },
  { key: "dropouts", numeral: "VII", title: "Number and Rate of Dropouts by Cause", group: "access_quality", autofilled: true },
  { key: "promotion", numeral: "VIII", title: "Promotion / Graduation Rate", group: "access_quality", autofilled: true },
  { key: "academic_performance", numeral: "IX", title: "Academic Performance Per Learning Area", group: "access_quality", autofilled: true },
  { key: "sbm", numeral: "X", title: "School-Based Management Assessment Level", group: "governance", autofilled: false },
  { key: "cfss", numeral: "XI", title: "Child-Friendly School Survey Result", group: "governance", autofilled: false },
  { key: "stakeholder_participation", numeral: "XII", title: "Stakeholders' Participation", group: "governance", autofilled: false },
  { key: "learner_teacher", numeral: "XIII", title: "Learner-Teacher Ratio", group: "ratios", autofilled: true },
  { key: "learner_classroom", numeral: "XIV", title: "Learner-Classroom Ratio", group: "ratios", autofilled: true },
  { key: "learner_toilet", numeral: "XV", title: "Learner-Toilet Ratio", group: "ratios", autofilled: false },
  { key: "learner_seat", numeral: "XVI", title: "Learner-Seat Ratio", group: "ratios", autofilled: false },
];

export const SRC_SECTION_GROUPS: { value: SrcSectionGroup; label: string }[] = [
  { value: "profile", label: "School Profile (I–VI)" },
  { value: "access_quality", label: "Access & Quality (VII–IX)" },
  { value: "governance", label: "Governance (X–XII)" },
  { value: "ratios", label: "Ratios (XIII–XVI)" },
];

export const SRC_AWARD_LEVELS: { value: SrcAwardLevel; label: string }[] = [
  { value: "international", label: "International" },
  { value: "national", label: "National" },
  { value: "region", label: "Region" },
  { value: "division", label: "Division" },
  { value: "school", label: "School" },
];

export const SRC_AWARD_CATEGORIES: { value: SrcAwardCategory; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "teacher", label: "Teacher" },
  { value: "school_head", label: "School Head" },
  { value: "school", label: "School" },
];

export const SRC_SIGNATORY_ROLES: {
  value: SrcSignatoryRole;
  label: string;
  defaultTitle: string;
}[] = [
  { value: "school_head", label: "School Head", defaultTitle: "School Head" },
  { value: "teacher_representative", label: "Teacher Representative", defaultTitle: "Teacher Representative" },
  { value: "gpta_president", label: "GPTA President", defaultTitle: "GPTA President" },
  { value: "ssg_president", label: "SSG President", defaultTitle: "SSG President" },
];

/**
 * SBM Level of Practice bands (DepEd Order 83 s. 2012). Derived from the
 * stored rating rather than typed in, so the level can never disagree with
 * the number printed beside it.
 */
export const SBM_BANDS: {
  min: number;
  max: number;
  level: string;
  description: string;
}[] = [
  { min: 0, max: 1.49, level: "I", description: "Developing" },
  { min: 1.5, max: 2.49, level: "II", description: "Maturing" },
  { min: 2.5, max: 3, level: "III", description: "Advanced (Accredited)" },
];

export const SRC_BMI_BANDS: { value: string; label: string }[] = [
  { value: "severely_wasted", label: "Severely Wasted" },
  { value: "wasted", label: "Wasted" },
  { value: "normal", label: "Normal" },
  { value: "overweight", label: "Overweight" },
  { value: "obese", label: "Obese" },
];

export const SRC_HFA_BANDS: { value: string; label: string }[] = [
  { value: "severely_stunted", label: "Severely Stunted" },
  { value: "stunted", label: "Stunted" },
  { value: "normal", label: "Normal" },
  { value: "tall", label: "Tall" },
];

// ============================================================================
// Column specs — drive the generic SrcRowsEditor so the 16 sections share one
// table implementation instead of sixteen bespoke ones.
// ============================================================================

export type SrcFieldType =
  | "text"
  | "integer"
  | "decimal"
  | "money"
  | "percent"
  | "grade_level"
  | "select";

export interface SrcColumn {
  key: string;
  label: string;
  type: SrcFieldType;
  options?: { value: string; label: string }[];
  /** Tailwind width class for the cell. */
  className?: string;
}

export const SRC_ENROLLMENT_COLUMNS: SrcColumn[] = [
  { key: "school_year", label: "School Year", type: "text" },
  { key: "grade_level", label: "Grade Level", type: "grade_level" },
  { key: "semester", label: "Semester", type: "integer", className: "w-24" },
  { key: "male", label: "Male", type: "integer", className: "w-24" },
  { key: "female", label: "Female", type: "integer", className: "w-24" },
];

export const SRC_HEALTH_COLUMNS: SrcColumn[] = [
  { key: "grade_level", label: "Grade Level", type: "grade_level" },
  {
    key: "sex",
    label: "Sex",
    type: "select",
    options: [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" },
    ],
  },
  {
    key: "band_type",
    label: "Measure",
    type: "select",
    options: [
      { value: "bmi", label: "BMI for Age" },
      { value: "hfa", label: "Height for Age" },
    ],
  },
  { key: "band", label: "Band", type: "text" },
  { key: "count", label: "Count", type: "integer", className: "w-24" },
];

export const SRC_MATERIAL_COLUMNS: SrcColumn[] = [
  { key: "grade_level", label: "Grade Level", type: "grade_level" },
  { key: "subject", label: "Subject", type: "text" },
  { key: "copies_received", label: "Printed SLMs Received", type: "integer" },
];

export const SRC_PD_COLUMNS: SrcColumn[] = [
  { key: "activity", label: "Professional Development", type: "text" },
  { key: "frequency", label: "Frequency", type: "integer", className: "w-32" },
];

export const SRC_PARTNER_COLUMNS: SrcColumn[] = [
  { key: "fiscal_year", label: "Fiscal Year", type: "integer", className: "w-32" },
  { key: "partners_count", label: "Number of Partners", type: "integer" },
  { key: "resources_generated", label: "Resources Generated", type: "money" },
];

export const SRC_CONTRIBUTION_COLUMNS: SrcColumn[] = [
  { key: "activity", label: "Activity", type: "text" },
  { key: "amount", label: "Contribution", type: "money" },
  { key: "volunteers", label: "Volunteers", type: "integer", className: "w-32" },
];

export const SRC_AWARD_COLUMNS: SrcColumn[] = [
  { key: "title", label: "Title of Award", type: "text" },
  { key: "giving_body", label: "Award Giving Body", type: "text" },
  { key: "level", label: "Level", type: "select", options: SRC_AWARD_LEVELS },
  { key: "category", label: "Category of Awardee", type: "select", options: SRC_AWARD_CATEGORIES },
  { key: "awardee", label: "Awardee", type: "text" },
];

export const SRC_RATE_COLUMNS: SrcColumn[] = [
  { key: "school_year", label: "School Year", type: "text" },
  { key: "frequency", label: "Frequency", type: "integer", className: "w-32" },
  { key: "percentage", label: "Percentage", type: "percent", className: "w-32" },
];

export const SRC_DROPOUT_CAUSE_COLUMNS: SrcColumn[] = [
  { key: "cause", label: "Cause", type: "text" },
  { key: "count", label: "Count", type: "integer", className: "w-32" },
];

export const SRC_PERFORMANCE_COLUMNS: SrcColumn[] = [
  { key: "grade_level", label: "Grade Level", type: "grade_level" },
  { key: "semester", label: "Semester", type: "integer", className: "w-24" },
  { key: "subject", label: "Subject", type: "text" },
  { key: "general_average", label: "General Average", type: "decimal", className: "w-36" },
];

export const SRC_PARTICIPATION_COLUMNS: SrcColumn[] = [
  { key: "activity", label: "Activity", type: "text" },
  { key: "percentage", label: "Percentage", type: "percent", className: "w-32" },
];

export const SRC_RATIO_COLUMNS: SrcColumn[] = [
  { key: "grade_level", label: "Grade Level", type: "grade_level" },
  { key: "learners", label: "Learners", type: "integer", className: "w-32" },
  { key: "units", label: "Units", type: "integer", className: "w-32" },
];
