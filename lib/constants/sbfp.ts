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

/**
 * Form 6 prints one table per packed component: NFP deliveries, then milk.
 * Hot meals (migration 220) are counted in viands and servings, not packs, and
 * print on their own report.
 */
export type SbfpDeliveryComponent = "nfp" | "milk" | "hot_meals";

export const SBFP_DELIVERY_COMPONENT_OPTIONS: {
  value: SbfpDeliveryComponent;
  label: string;
  shortLabel: string;
}[] = [
  { value: "nfp", label: "Nutritious Food Products (NFP)", shortLabel: "NFP" },
  { value: "milk", label: "Milk", shortLabel: "Milk" },
  { value: "hot_meals", label: "Hot Meals", shortLabel: "Hot Meals" },
];

/** A hot-meals delivery line: what came new, as a replacement, or was sent back. */
export type SbfpMealKind = "new" | "replacement" | "rejected";

export const SBFP_MEAL_KIND_OPTIONS: { value: SbfpMealKind; label: string }[] = [
  { value: "new", label: "Meal / Viand Received – New" },
  { value: "replacement", label: "Meal / Viand Received – Replacement" },
  { value: "rejected", label: "Meal / Viand – For Replacement / Rejected" },
];

/** Suggestions for the unit field; it is free text. */
export const SBFP_MEAL_UNITS = ["tray", "pot", "kg", "pack", "container", "serving"] as const;

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
  | "HM"
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
  {
    key: "HM",
    code: "SBFP Hot Meals",
    title: "Hot Meals Deliveries",
    description:
      "Each hot-meals delivery: viands received new and as replacement, those rejected, with quantity, unit and servings yielded.",
  },
];

// ---------------------------------------------------------------------------
// Feedback Mechanism (migration 212)
// ---------------------------------------------------------------------------

/** Status is CHECK-constrained: the tab and the printout count by it. */
export type SbfpFeedbackStatus = "open" | "in_progress" | "resolved";

export const SBFP_FEEDBACK_STATUS_OPTIONS: {
  value: SbfpFeedbackStatus;
  label: string;
}[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

/**
 * Who raised it, and what it is about. Free TEXT in the database (the 119
 * precedent), so these lists can change without touching logged entries; a
 * stored value no longer listed prints as typed.
 */
export const SBFP_FEEDBACK_SOURCES = [
  "Parent / Guardian",
  "Learner",
  "Teacher",
  "School Personnel",
  "Supplier / Caterer",
  "Barangay / LGU",
  "Community",
  "Other",
] as const;

export const SBFP_FEEDBACK_CATEGORIES = [
  "Food quality / safety",
  "Food quantity",
  "Menu / food preference",
  "Milk feeding",
  "Delivery / supplies",
  "Health / allergic reaction",
  "Sanitation / facilities",
  "Learner attendance",
  "Parent / community participation",
  "Funds / procurement",
  "Other",
] as const;

// ---------------------------------------------------------------------------
// Monitoring tools (migration 220)
// ---------------------------------------------------------------------------
// Checklist answers are stored as JSONB keyed by these codes, so a revised
// list never invalidates a filed log; a stored code no longer listed is simply
// not shown.

export interface SbfpChecklistItem {
  code: string;
  label: string;
  /** Ask for a name when the answer is Yes. */
  askName?: boolean;
}

/** The five districts, as the division issued the grid. */
export const SBFP_DISTRICTS = ["Central", "North", "South", "East", "West"] as const;

/** Daily Monitoring Tool for Kitchens — food preparation. */
export const SBFP_KITCHEN_HYGIENE_ITEMS: SbfpChecklistItem[] = [
  { code: "hairnets", label: "Food handlers wearing hairnets" },
  { code: "masks", label: "Food handlers wearing masks" },
  { code: "handwashing", label: "Handwashing station functional" },
  { code: "drinking_water", label: "Safe drinking water available" },
  { code: "ingredients_inspected", label: "Raw ingredients inspected" },
  { code: "cooked_thoroughly", label: "Food cooked thoroughly" },
  { code: "packed_hygienically", label: "Food packed hygienically" },
  { code: "sanitized_before", label: "Kitchen sanitized before operation" },
  { code: "sanitized_after", label: "Kitchen sanitized after operation" },
];

/** Daily Monitoring Tool for Kitchens — delivery vehicle inspection. */
export const SBFP_VEHICLE_ITEMS: SbfpChecklistItem[] = [
  { code: "clean", label: "Vehicle is clean" },
  { code: "containers_secured", label: "Food containers secured" },
  { code: "covered", label: "Vehicle covered/protected from weather" },
  {
    code: "personnel_identified",
    label: "Delivery personnel properly identified",
    askName: true,
  },
];

/** Food Dispatch Daily Monitoring Tool — type of vehicle assigned. */
export const SBFP_VEHICLE_TYPES = [
  "Four-wheeled vehicle",
  "Tricycle (motored)",
  "Bao-Bao",
  "Single Motorcycle",
  "Others",
] as const;

export const SBFP_VEHICLE_OTHER = "Others";

/** Weather at dispatch / arrival. Free text in the database. */
export const SBFP_WEATHER_OPTIONS = [
  "Fair",
  "Sunny",
  "Cloudy",
  "Raining (light)",
  "Raining (heavy)",
  "Windy",
] as const;

/** School Recipient tool — food condition upon receipt. */
export type SbfpConditionRating = "good" | "fair" | "poor";

export const SBFP_CONDITION_RATINGS: { value: SbfpConditionRating; label: string }[] = [
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

export const SBFP_FOOD_CONDITION_ITEMS: SbfpChecklistItem[] = [
  { code: "temperature", label: "Food Temperature" },
  { code: "packaging", label: "Packaging Condition" },
  { code: "appearance", label: "Food Appearance" },
  { code: "aroma", label: "Food Aroma" },
  { code: "portion", label: "Portion Size" },
  { code: "cleanliness", label: "Food Cleanliness" },
];

/** School Recipient tool — food safety and handling compliance. */
export const SBFP_RECEIVING_SAFETY_ITEMS: SbfpChecklistItem[] = [
  { code: "stored", label: "Food stored appropriately upon arrival" },
  { code: "area_clean", label: "Distribution area is clean" },
  { code: "potable_water", label: "Potable water (safe water) available" },
  { code: "handwashing", label: "Learners washed hands before eating" },
  { code: "served_on_time", label: "Food served within allowable time" },
  { code: "waste_disposed", label: "Waste properly disposed" },
];

/**
 * Daily Hot Meals Quality Evaluation — the smiley scale. The questions live in
 * the database (sms_sbfp_quality_questions) so the division can change them;
 * a face answer is stored as one of these values.
 */
export const SBFP_FACE_SCALE: { value: number; emoji: string; label: string }[] = [
  { value: 1, emoji: "😞", label: "Dili gyud" },
  { value: 2, emoji: "🙁", label: "Dili kaayo" },
  { value: 3, emoji: "😐", label: "Medyo" },
  { value: 4, emoji: "🙂", label: "Oo" },
  { value: 5, emoji: "😄", label: "Oo gyud" },
];

export type SbfpQualityQuestionKind = "face" | "text";

/** Who maintains the division-wide kitchen list and evaluation questions. */
export const SBFP_DIVISION_MANAGER_TYPES = ["super admin", "division_admin"] as const;
