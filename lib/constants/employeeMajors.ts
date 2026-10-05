/**
 * Employee majors (migration 198) — parts 1 and 2 of the /profile
 * Specialization section. Part 3, the specialization at DepEd, is
 * `sms_users.learning_area` and lives in ./learningAreas.
 *
 * Sources: CHED CMO 74-82 s.2017 teacher-education PSGs (BEEd, BECEd, BSNEd,
 * BTLEd, BPEd, BCAEd; BSEd majors English, Filipino, Mathematics, Science,
 * Social Studies, Values Education), the pre-2017 BSEd/BEEd majors serving
 * teachers still hold, and the MAEd/MEd/EdD/PhD majors Philippine graduate
 * schools offer. Free TEXT, app-validated (119/132 precedent): revising a list
 * is a change here, never a migration. A stored code no longer listed still
 * prints as itself rather than disappearing.
 *
 * Stored value: the code, or `other:<typed text>` when the person picked Other.
 */

export interface MajorOption {
  code: string;
  label: string;
  group: string;
}

export const OTHER_CODE = "other";
export const OTHER_PREFIX = "other:";
export const OTHER_TEXT_MAX = 120;

const G_GENERAL = "General";
const G_ELEM = "Elementary / Early Childhood Education";
const G_SEC = "Secondary Education (BSEd)";
const G_TECH = "Technology, PE, Arts & Library Education";
const G_NON = "Non-Education Degree";
const G_OTHER = "Other";

export const UNDERGRAD_MAJORS: readonly MajorOption[] = [
  { code: "general", label: "General Education (BEEd General Curriculum)", group: G_GENERAL },
  { code: "beed_ece", label: "BEEd – Pre-school / Early Childhood", group: G_ELEM },
  { code: "beed_sped", label: "BEEd – Special Education", group: G_ELEM },
  { code: "beed_english", label: "BEEd – Content Area: English", group: G_ELEM },
  { code: "beed_filipino", label: "BEEd – Content Area: Filipino", group: G_ELEM },
  { code: "beed_math", label: "BEEd – Content Area: Mathematics", group: G_ELEM },
  { code: "beed_science", label: "BEEd – Content Area: Science", group: G_ELEM },
  { code: "beed_social_studies", label: "BEEd – Content Area: Social Studies", group: G_ELEM },
  { code: "beced", label: "BECEd – Early Childhood Education", group: G_ELEM },
  { code: "bsned", label: "BSNEd – Special Needs Education", group: G_ELEM },
  { code: "bsed_english", label: "BSEd – English", group: G_SEC },
  { code: "bsed_filipino", label: "BSEd – Filipino", group: G_SEC },
  { code: "bsed_math", label: "BSEd – Mathematics", group: G_SEC },
  { code: "bsed_science", label: "BSEd – Science (General)", group: G_SEC },
  { code: "bsed_biology", label: "BSEd – Biological Science", group: G_SEC },
  { code: "bsed_physical_science", label: "BSEd – Physical Science", group: G_SEC },
  { code: "bsed_social_studies", label: "BSEd – Social Studies", group: G_SEC },
  { code: "bsed_values", label: "BSEd – Values Education", group: G_SEC },
  { code: "bsed_mapeh", label: "BSEd – MAPEH", group: G_SEC },
  { code: "bsed_tle", label: "BSEd – Technology and Livelihood Education", group: G_SEC },
  { code: "bsed_religious", label: "BSEd – Religious Education", group: G_SEC },
  { code: "btled_he", label: "BTLEd – Home Economics", group: G_TECH },
  { code: "btled_ia", label: "BTLEd – Industrial Arts", group: G_TECH },
  { code: "btled_ict", label: "BTLEd – Information and Communication Technology", group: G_TECH },
  { code: "btvted", label: "BTVTEd – Technical-Vocational Teacher Education", group: G_TECH },
  { code: "bped", label: "BPEd – Physical Education", group: G_TECH },
  { code: "bcaed", label: "BCAEd – Culture and Arts Education", group: G_TECH },
  { code: "blis", label: "Library and Information Science", group: G_TECH },
  { code: "non_nursing", label: "Nursing / Allied Health", group: G_NON },
  { code: "non_business", label: "Business / Accountancy", group: G_NON },
  { code: "non_engineering", label: "Engineering / Industrial Technology", group: G_NON },
  { code: "non_it", label: "Information Technology / Computer Science", group: G_NON },
  { code: "non_agriculture", label: "Agriculture / Forestry", group: G_NON },
  { code: "non_arts_sciences", label: "Arts and Sciences (AB / BS)", group: G_NON },
  { code: "non_criminology", label: "Criminology", group: G_NON },
  { code: OTHER_CODE, label: "Other (specify)", group: G_OTHER },
];

const G_MA = "Master's / Graduate Major";
const G_DOC = "Doctorate";

export const GRADUATE_MAJORS: readonly MajorOption[] = [
  { code: "none", label: "None / not yet pursued", group: G_GENERAL },
  { code: "general", label: "General Education", group: G_GENERAL },
  { code: "ed_management", label: "Educational Management / Administration and Supervision", group: G_MA },
  { code: "guidance", label: "Guidance and Counseling", group: G_MA },
  { code: "english", label: "English / Language Teaching", group: G_MA },
  { code: "filipino", label: "Filipino", group: G_MA },
  { code: "math", label: "Mathematics Education", group: G_MA },
  { code: "science", label: "Science Education", group: G_MA },
  { code: "social_studies", label: "Social Studies", group: G_MA },
  { code: "values", label: "Values Education", group: G_MA },
  { code: "mapeh", label: "MAPEH / Physical Education", group: G_MA },
  { code: "tle", label: "TLE / Home Economics", group: G_MA },
  { code: "reading", label: "Reading", group: G_MA },
  { code: "sped", label: "Special Education", group: G_MA },
  { code: "ece", label: "Early Childhood Education", group: G_MA },
  { code: "ict", label: "ICT / Computer Education", group: G_MA },
  { code: "library", label: "Library Science", group: G_MA },
  { code: "public_admin", label: "Public Administration", group: G_MA },
  { code: "nursing", label: "Nursing / Health", group: G_MA },
  { code: "doc_ed_management", label: "Doctorate – Educational Management (EdD / PhD)", group: G_DOC },
  { code: "doc_other", label: "Doctorate – Other field", group: G_DOC },
  { code: OTHER_CODE, label: "Other (specify)", group: G_OTHER },
];

/** The value to store, or null when nothing (or an empty Other) was chosen. */
export function encodeMajor(
  code: string | null | undefined,
  otherText?: string,
): string | null {
  if (!code) return null;
  if (code !== OTHER_CODE) return code;
  const text = (otherText ?? "").trim().slice(0, OTHER_TEXT_MAX);
  return text ? `${OTHER_PREFIX}${text}` : null;
}

export function decodeMajor(value: string | null | undefined): {
  code: string | null;
  otherText: string;
} {
  if (!value) return { code: null, otherText: "" };
  if (value.startsWith(OTHER_PREFIX)) {
    return { code: OTHER_CODE, otherText: value.slice(OTHER_PREFIX.length) };
  }
  return { code: value, otherText: "" };
}

/** Group key for the report: every Other answer counts together. */
export function majorGroupCode(value: string | null | undefined): string | null {
  return decodeMajor(value).code;
}

export function majorLabel(
  list: readonly MajorOption[],
  value: string | null | undefined,
): string {
  const { code, otherText } = decodeMajor(value);
  if (!code) return "—";
  if (code === OTHER_CODE) return otherText ? `Other: ${otherText}` : "Other";
  return list.find((m) => m.code === code)?.label ?? code;
}

/** Distinct groups in list order, for a grouped <Select>. */
export function majorGroups(list: readonly MajorOption[]): string[] {
  return Array.from(new Set(list.map((m) => m.group)));
}
