/**
 * School-Based Feeding Program (SBFP) — the vocabulary of SBFP Forms 1A–6
 * (2026 issue) and of migration 209.
 *
 * The value lists here are the ones the database CHECKs (classification, milk
 * tolerance, delivery component, contact kind, feeding code). Labels are
 * transcribed from the issued workbook so a school reading the screen against
 * the paper finds the same words.
 */

/**
 * The programme's three weighings. Learner Health (SF8) keeps only baseline and
 * endline; the feeding programme also weighs part-way (migration 209).
 */
export type SbfpWeighingPeriod = "baseline" | "midline" | "endline";

export const SBFP_WEIGHING_PERIODS: {
  value: SbfpWeighingPeriod;
  label: string;
  /** Wording on Form 2's title: "... & Start of Feeding". */
  form2Caption: string;
}[] = [
  { value: "baseline", label: "Baseline", form2Caption: "Start" },
  { value: "midline", label: "Midline", form2Caption: "Midline" },
  { value: "endline", label: "Endline", form2Caption: "End" },
];

/** Form 1A column N — "Classification of Beneficiary (Primary or Secondary)". */
export type SbfpClassification = "primary" | "secondary";

export const SBFP_CLASSIFICATION_OPTIONS: {
  value: SbfpClassification;
  label: string;
}[] = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
];

/**
 * Form 5 (milk component) — "Classification of Students in terms of Milk
 * Tolerance (Please check one)".
 */
export type SbfpMilkTolerance = "none" | "intolerant_willing" | "not_allowed";

export const SBFP_MILK_TOLERANCE_OPTIONS: {
  value: SbfpMilkTolerance;
  label: string;
  shortLabel: string;
}[] = [
  {
    value: "none",
    label: "Without milk intolerance and will participate in milk feeding",
    shortLabel: "No intolerance",
  },
  {
    value: "intolerant_willing",
    label: "With milk intolerance but willing to participate in milk feeding",
    shortLabel: "Intolerant, willing",
  },
  {
    value: "not_allowed",
    label: "Not allowed by parents to participate in milk feeding",
    shortLabel: "Not allowed by parents",
  },
];

/** Form 6 prints one table per component: NFP deliveries, then milk. */
export type SbfpDeliveryComponent = "nfp" | "milk";

export const SBFP_DELIVERY_COMPONENT_OPTIONS: {
  value: SbfpDeliveryComponent;
  label: string;
}[] = [
  { value: "nfp", label: "Nutritious Food Products (NFP)" },
  { value: "milk", label: "Milk" },
];

/** Form 4 prints two lists: authorized consignees, then the inspection team. */
export type SbfpContactKind = "consignee" | "inspection";

export const SBFP_CONTACT_KIND_LABELS: Record<SbfpContactKind, string> = {
  consignee: "Authorized Consignees",
  inspection: "School Inspection Team",
};

/**
 * Form 3 — "D. Actual Feeding" legend, verbatim:
 *   (H or N)  Present, served with Hot meals or Nutritious Food Products
 *   (M)       Present, served with Milk
 *   (H/N + M) Present, served with Hot meals or NFP & Milk
 *   (A)       Absent, not served
 *   (H2/N2+M2 or H/N+M2) Present, served twice
 *
 * Every code but A is a day the learner was present and fed. The database
 * CHECK (migration 209) accepts exactly the shapes listed here.
 */
export const SBFP_FEEDING_CODES = [
  "H",
  "N",
  "M",
  "H+M",
  "N+M",
  "H2",
  "N2",
  "M2",
  "H+M2",
  "N+M2",
  "H2+M2",
  "N2+M2",
  "A",
] as const;

export type SbfpFeedingCode = (typeof SBFP_FEEDING_CODES)[number];

export const SBFP_ABSENT_CODE: SbfpFeedingCode = "A";

export const SBFP_FEEDING_LEGEND: { code: string; meaning: string }[] = [
  {
    code: "H or N",
    meaning: "Present, served with Hot meals or Nutritious Food Products",
  },
  { code: "M", meaning: "Present, served with Milk" },
  {
    code: "H/N + M",
    meaning: "Present, served with Hot meals or Nutritious Food Products & Milk",
  },
  { code: "A", meaning: "Absent, not served" },
  { code: "H2/N2+M2 or H/N+M2", meaning: "Present, served twice" },
];

/**
 * Who runs the programme at a school without being its designated focal
 * person. The focal person (`sms_sbfp_programs.focal_person_id`) is a
 * designation, not a role — usually a teacher — and is admitted on top of these
 * by `sbfp_can_manage` in the database.
 */
export const SBFP_MANAGER_TYPES = [
  "school_head",
  "assistant_school_head",
  "admin",
  "school_nurse",
  "super admin",
] as const;

/** The division office reads every school's programme; it does not encode. */
export const SBFP_DIVISION_VIEWER_TYPES = [
  "division_admin",
  "division_type",
] as const;

/** The issued forms, in the order the workbook files them. */
export type SbfpFormKey =
  | "1A"
  | "1M"
  | "1B"
  | "2"
  | "3"
  | "4"
  | "5"
  | "5C"
  | "6";

export const SBFP_FORMS: {
  key: SbfpFormKey;
  code: string;
  title: string;
  description: string;
}[] = [
  {
    key: "1A",
    code: "SBFP Form 1A",
    title: "Master List of Beneficiaries — Baseline",
    description:
      "Every beneficiary with the baseline weighing, classification and the programme flags.",
  },
  {
    key: "1M",
    code: "SBFP Master List",
    title: "Master List of Beneficiaries — Midline",
    description:
      "The midline weighing beside attendance to date. Laid out like Form 1B; the 2026 workbook issues no midline sheet.",
  },
  {
    key: "1B",
    code: "SBFP Form 1B",
    title: "Master List of Beneficiaries — Endline",
    description:
      "The endline weighing beside each beneficiary's feeding attendance (days present ÷ feeding days).",
  },
  {
    key: "2",
    code: "SBFP Form 2",
    title: "Summary of Beneficiaries & Start / End of Feeding",
    description:
      "Counts by grade level and sex at the start, midline or end of feeding. Elementary and Junior/Senior High print on their own sheets.",
  },
  {
    key: "3",
    code: "SBFP Form 3",
    title: "Record of Daily Feeding",
    description: "One sheet per section for the month, with the deworming mark.",
  },
  {
    key: "4",
    code: "SBFP Form 4",
    title: "List of Authorized Consignees & School Inspection Team",
    description: "Names, designations and contact details, with signature spaces.",
  },
  {
    key: "5",
    code: "SBFP Form 5",
    title: "Milk Component — List of Beneficiaries",
    description: "Each beneficiary's milk-tolerance classification.",
  },
  {
    key: "5C",
    code: "SBFP Form 5",
    title: "Consolidated Nutritional Status and Attendance Report",
    description:
      "Per section: learners dewormed, BMI bands before and after, and percentage attendance.",
  },
  {
    key: "6",
    code: "SBFP Form 6",
    title: "NFP and Milk Deliveries",
    description: "Beneficiaries per grade level beside each delivery received.",
  },
];
