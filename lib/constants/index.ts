export const PER_PAGE = 10;

export {
  TERMINAL_ENROLLMENT_STATUSES,
  TERMINAL_GRADES,
  isTerminalEnrollmentStatus,
  isTerminalGrade,
} from "./enrollment";
export type { TerminalEnrollmentStatus } from "./enrollment";

export {
  SHS_TRACKS,
  SHS_STRANDS,
  SHS_SPECIALIZATION_SUGGESTIONS,
  getStrandLabel,
  getTrackLabel,
  getTrackForStrand,
} from "./shs";
export type { ShsTrack, ShsStrand } from "./shs";

export { LEARNING_AREAS, getLearningAreaLabel } from "./learningAreas";
export type { LearningArea } from "./learningAreas";

export {
  ASSESSMENT_PHASES,
  ASSESSMENT_PHASE_VALUES,
  getAssessmentPhaseLabel,
  CRLA_LANGUAGES,
  PHILIRI_LANGUAGES,
  CRLA_GRADES,
  PHILIRI_GRADES,
  RMA_GRADES,
  CRLA_DEFAULT_BANDS,
  CRLA_DEFAULT_TASKS,
  wordReadingLevel,
  comprehensionLevel,
  overallReadingLevel,
  PHILIRI_QUESTION_TYPES,
  RMA_DOMAINS,
  RMA_DEFAULT_BANDS,
  bandLabelForScore,
} from "./assessments";
export type {
  AssessmentType,
  AssessmentPhase,
  AssessmentBandSeed,
  CrlaLanguage,
  PhilIriLanguage,
  PhilIriLevel,
  PhilIriQuestionType,
  RmaDomain,
} from "./assessments";

/** Grade levels: -1 = SNED, 0 = Kindergarten, 1-12 = Grade 1 through Grade 12 */
export const GRADE_LEVEL_MIN = -1;
export const GRADE_LEVEL_MAX = 12;
export const GRADE_LEVELS = Array.from(
  { length: GRADE_LEVEL_MAX - GRADE_LEVEL_MIN + 1 },
  (_, i) => GRADE_LEVEL_MIN + i,
);

export function getGradeLevelLabel(level: number): string {
  if (level === -1) return "SNED";
  return level === 0 ? "Kindergarten" : `Grade ${level}`;
}

/** Display labels for section types. */
export const SECTION_TYPE_LABELS: Record<string, string> = {
  heterogeneous: "Heterogeneous",
  homogeneous_fast_learner: "Homogeneous - Fast learner",
  homogeneous_crack_section: "Homogeneous - Crack section",
  homogeneous_random: "Homogeneous - Random",
};

export function getSectionTypeLabel(
  sectionType: string | null | undefined,
): string | null {
  if (!sectionType) return null;
  return SECTION_TYPE_LABELS[sectionType] ?? sectionType;
}

export const SCHOOL_DISTRICTS = [
  "North District",
  "South District",
  "East District",
  "West District",
  "Central District",
] as const;

export const SCHOOL_TYPES = [
  { value: "elementary", label: "Elementary" },
  { value: "junior_high", label: "Junior High Only" },
  { value: "senior_high", label: "Senior High Only" },
  { value: "complete_secondary", label: "Complete Secondary" },
  { value: "integrated", label: "Integrated" },
] as const;

export const SCHOOL_TYPE_VALUES = SCHOOL_TYPES.map((t) => t.value);

export function getSchoolTypeLabel(
  type: string | null | undefined
): string {
  if (!type) return "-";
  const found = SCHOOL_TYPES.find((t) => t.value === type);
  return found ? found.label : type;
}

export const billingAgencies = [
  "DEPARTMENT OF SOCIAL WELFARE AND DEVELOPMENT (DSWD)",
  "LGU - SAN FRANCISCO",
  "PLGU - AGUSAN DEL SUR",
];

export const medicalAssistanceRequestTypes = [
  "Hospital Bill",
  "MAIP (DOH)",
  "MHARS-MC",
  "DSWD - Financial Assistance",
  "DSWD - Medicine Assistance",
  "DSWD - Hospital Bill Assistance",
  "DSWD - Burial Assistance",
  "Philippine Heart Center",
  "Others",
];

export const docRouting = [
  "Forwarded",
  "Forwarded to Accounting",
  "Forwarded to Agri",
  "Forwarded to Assesors",
  "Forwarded to Atty Cassie",
  "Forwarded to Atty Rhea",
  "Forwarded to BAC",
  "Forwarded to Budget",
  "Forwarded to CADM",
  "Forwarded to CCRO",
  "Forwarded to CDRRMO",
  "Forwarded to CEEDO",
  "Forwarded to CEO",
  "Forwarded to CHO",
  "Forwarded to CHRMO",
  "Forwarded to City Council",
  "Forwarded to COA",
  "Forwarded to CPDO",
  "Forwarded to CSWD",
  "Forwarded to CTO",
  "Forwarded to DILG",
  "Forwarded to GSO",
  "Forwarded to iBPLS",
  "Forwarded to Liga ng mga Barangay",
  "Forwarded to Nutrition",
  "Forwarded to OCM",
  "Forwarded to OCM 4th Floor",
  "Forwarded to OCIT",
  "Forwarded to Permit Div",
  "Forwarded to PNP",
  "Forwarded to SK Fed",
  "Forwarded to SM Lao",
  "Forwarded to SWEMO",
  "Forwarded to Tourism",
  "Forwarded to Vet",
  "Forwarded to Vice Mayor",
  "Received at CADM",
  "Received at OCM",
];

export const documentTypes = [
  "Letter",
  "Memo",
  "Resolution",
  "Ordinance",
  "Request",
  "Complaint",
  "Application",
  "Others",
];

export const trackerStatuses = [
  "Pending",
  "In Progress",
  "Completed",
  "Archived",
  "Returned",
];
