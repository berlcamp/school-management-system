/**
 * Learner Manifestation Tagging — LSEN catalog and workflow labels.
 *
 * Mirrors the DepEd LIS "Classification/Type of Learner Special Educational
 * Needs (LSEN)" select shown in Division Memorandum No. 263, s. 2024,
 * Enclosure No. 1 ("Tagging of Learners with Special Educational Needs").
 * The LIS select has three option groups, reproduced here as `LSEN_CATEGORIES`:
 *
 *   Gifted Learner
 *   With Diagnosis from Licensed Medical Specialist
 *   With Manifestation                              ← the adviser's entry point
 *
 * The memo's own screenshots crop the dropdown after its first few options, so
 * the diagnosed and manifestation lists below follow the standard DepEd LIS /
 * EBEIS LWD classification. This file is the single place to correct them: the
 * database stores `code` as free TEXT precisely so the list can be revised
 * without a migration (see 119_learner_manifestation_tagging.sql).
 */

export type LsenCategory = "gifted" | "diagnosed" | "manifestation";

export interface LsenOption {
  code: string;
  label: string;
  category: LsenCategory;
}

export const LSEN_CATEGORY_LABELS: Record<LsenCategory, string> = {
  gifted: "Gifted Learner",
  diagnosed: "With Diagnosis from Licensed Medical Specialist",
  manifestation: "With Manifestation",
};

/** Short label for badges and table cells, where the full group name is too long. */
export const LSEN_CATEGORY_SHORT_LABELS: Record<LsenCategory, string> = {
  gifted: "Gifted",
  diagnosed: "Diagnosed",
  manifestation: "Manifestation",
};

export const LSEN_OPTIONS: LsenOption[] = [
  // ── Gifted Learner ────────────────────────────────────────────────────────
  { code: "gifted", label: "Gifted", category: "gifted" },
  { code: "talented", label: "Talented", category: "gifted" },

  // ── With Diagnosis from Licensed Medical Specialist ───────────────────────
  { code: "visual_impairment", label: "Visual Impairment", category: "diagnosed" },
  { code: "hearing_impairment", label: "Hearing Impairment", category: "diagnosed" },
  { code: "learning_disability", label: "Learning Disability", category: "diagnosed" },
  { code: "intellectual_disability", label: "Intellectual Disability", category: "diagnosed" },
  { code: "autism_spectrum_disorder", label: "Autism Spectrum Disorder", category: "diagnosed" },
  { code: "adhd", label: "Attention Deficit Hyperactivity Disorder (ADHD)", category: "diagnosed" },
  { code: "emotional_behavioral_disorder", label: "Emotional-Behavioral Disorder", category: "diagnosed" },
  { code: "speech_language_disorder", label: "Speech/Language Disorder", category: "diagnosed" },
  { code: "orthopedic_physical_handicap", label: "Orthopedic/Physical Handicap", category: "diagnosed" },
  { code: "cerebral_palsy", label: "Cerebral Palsy", category: "diagnosed" },
  { code: "special_health_problem", label: "Special Health Problem / Chronic Disease", category: "diagnosed" },
  { code: "cancer", label: "Cancer", category: "diagnosed" },
  { code: "multiple_disabilities", label: "Multiple Disabilities", category: "diagnosed" },

  // ── With Manifestation (observed by the adviser; no diagnosis yet) ─────────
  { code: "m_seeing", label: "Difficulty in Seeing", category: "manifestation" },
  { code: "m_hearing", label: "Difficulty in Hearing", category: "manifestation" },
  { code: "m_walking", label: "Difficulty in Walking / Moving / Climbing", category: "manifestation" },
  { code: "m_communicating", label: "Difficulty in Communicating", category: "manifestation" },
  { code: "m_remembering", label: "Difficulty in Remembering / Concentrating", category: "manifestation" },
  { code: "m_self_care", label: "Difficulty in Self-Care", category: "manifestation" },
  { code: "m_learning", label: "Difficulty in Applying Knowledge / Learning", category: "manifestation" },
  { code: "m_interpersonal", label: "Difficulty in Displaying Interpersonal Behavior", category: "manifestation" },
  { code: "m_mental_function", label: "Difficulty in Mental Functioning", category: "manifestation" },
];

const LSEN_BY_CODE = new Map(LSEN_OPTIONS.map((o) => [o.code, o]));

/** Human label for a stored LSEN code; falls back to the raw code if retired. */
export function getLsenLabel(code: string): string {
  return LSEN_BY_CODE.get(code)?.label ?? code;
}

export function getLsenOption(code: string): LsenOption | undefined {
  return LSEN_BY_CODE.get(code);
}

/** The options of one group, in catalog order. */
export function lsenOptionsFor(category: LsenCategory): LsenOption[] {
  return LSEN_OPTIONS.filter((o) => o.category === category);
}

export const LSEN_CATEGORY_ORDER: LsenCategory[] = [
  "manifestation",
  "diagnosed",
  "gifted",
];

// ── Class type / non-graded program (LIS branch) ────────────────────────────

export type ManifestationClassType = "graded" | "non_graded";

export const CLASS_TYPE_LABELS: Record<ManifestationClassType, string> = {
  graded: "Graded class",
  non_graded: "Non-graded / SPED class",
};

export type NonGradedProgram =
  | "kinder"
  | "primary_1"
  | "primary_2"
  | "primary_3"
  | "transition";

export const NON_GRADED_PROGRAM_LABELS: Record<NonGradedProgram, string> = {
  kinder: "Kinder",
  primary_1: "Primary Level I",
  primary_2: "Primary Level II",
  primary_3: "Primary Level III",
  transition: "Transition",
};

// ── Parent/guardian consent ─────────────────────────────────────────────────

export type ManifestationConsentStatus =
  | "pending"
  | "agree_lis_and_medical"
  | "agree_lis_only"
  | "disagree";

/** Wording follows the DepEd SNED Parent/Guardian Consent Form. */
export const CONSENT_STATUS_LABELS: Record<ManifestationConsentStatus, string> = {
  pending: "Awaiting response",
  agree_lis_and_medical: "Agrees — LIS tagging and medical assessment",
  agree_lis_only: "Agrees — LIS tagging only",
  disagree: "Does not agree",
};

export const CONSENT_STATUS_SHORT_LABELS: Record<
  ManifestationConsentStatus,
  string
> = {
  pending: "Pending",
  agree_lis_and_medical: "LIS + Medical",
  agree_lis_only: "LIS only",
  disagree: "Declined",
};

/**
 * A consent response that permits LIS tagging. Both "agree" options do — the
 * second only withholds the medical assessment — so both make a tagged learner
 * eligible for SNED identification.
 */
export function isConsentGranted(status: ManifestationConsentStatus): boolean {
  return status === "agree_lis_and_medical" || status === "agree_lis_only";
}

// ── Intervention ────────────────────────────────────────────────────────────

export type ManifestationInterventionStatus =
  | "planned"
  | "ongoing"
  | "completed"
  | "discontinued";

export const INTERVENTION_STATUS_LABELS: Record<
  ManifestationInterventionStatus,
  string
> = {
  planned: "Planned",
  ongoing: "Ongoing",
  completed: "Completed",
  discontinued: "Discontinued",
};
