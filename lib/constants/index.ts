export const PER_PAGE = 10;

/** Grade levels: 0 = Kindergarten, 1-12 = Grade 1 through Grade 12 */
export const GRADE_LEVEL_MIN = 0;
export const GRADE_LEVEL_MAX = 12;
export const GRADE_LEVELS = Array.from(
  { length: GRADE_LEVEL_MAX - GRADE_LEVEL_MIN + 1 },
  (_, i) => GRADE_LEVEL_MIN + i,
);

export function getGradeLevelLabel(level: number): string {
  return level === 0 ? "Kindergarten" : `Grade ${level}`;
}

export const SCHOOL_DISTRICTS = [
  "North District",
  "South District",
  "East District",
  "West District",
  "Central District",
] as const;

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
