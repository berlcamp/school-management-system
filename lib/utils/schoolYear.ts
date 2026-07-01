/**
 * Get the current school year based on the current date
 * School year runs from June to May
 * If current month is June or later, it's the start of a new school year
 */
export function getCurrentSchoolYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 5) {
    // June (5) onwards - new school year starts
    return `${year}-${year + 1}`;
  } else {
    // January to May - still in previous school year
    return `${year - 1}-${year}`;
  }
}

/**
 * Generate school year options for dropdowns
 * Returns an array of school year strings in format "YYYY-YYYY"
 * @param yearsBefore Number of years before current year to include (default: 2)
 * @param yearsAfter Number of years after current year to include (default: 2)
 */
export function getSchoolYearOptions(
  yearsBefore: number = 2,
  yearsAfter: number = 2
): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const options: string[] = [];

  for (let i = -yearsBefore; i <= yearsAfter; i++) {
    const startYear = year + i;
    options.push(`${startYear}-${startYear + 1}`);
  }

  return options;
}

/**
 * Grading-period coexistence helpers.
 *
 * The DepEd MATATAG curriculum (SY 2026-2027 onward) uses 3 terms instead of
 * the legacy 4 quarters. `sms_grades.grading_period` is reused (terms map to
 * 1-3); whether a school year is term- or quarter-based is derived here.
 */
export const TERM_SYSTEM_START_SY = "2026-2027";

export type GradingPeriodType = "quarter" | "term";

export interface GradingPeriodOption {
  value: number; // 1-4 (quarters) or 1-3 (terms)
  label: string; // "1st Quarter" / "1st Term"
  short: string; // "Q1" / "T1"
}

/** Parse the starting year from a "YYYY-YYYY" school year string. */
function schoolYearStartYear(schoolYear: string): number {
  return parseInt(schoolYear.split("-")[0], 10);
}

/** True for SY 2026-2027 onward (3-term MATATAG grading). */
export function isTermBasedSchoolYear(schoolYear: string): boolean {
  if (!schoolYear) return false;
  return (
    schoolYearStartYear(schoolYear) >=
    schoolYearStartYear(TERM_SYSTEM_START_SY)
  );
}

export function getGradingPeriodType(schoolYear: string): GradingPeriodType {
  return isTermBasedSchoolYear(schoolYear) ? "term" : "quarter";
}

const TERM_PERIODS: GradingPeriodOption[] = [
  { value: 1, label: "1st Term", short: "T1" },
  { value: 2, label: "2nd Term", short: "T2" },
  { value: 3, label: "3rd Term", short: "T3" },
];

const QUARTER_PERIODS: GradingPeriodOption[] = [
  { value: 1, label: "1st Quarter", short: "Q1" },
  { value: 2, label: "2nd Quarter", short: "Q2" },
  { value: 3, label: "3rd Quarter", short: "Q3" },
  { value: 4, label: "4th Quarter", short: "Q4" },
];

/**
 * Grading periods for a school year: 3 terms for MATATAG (2026-2027+),
 * otherwise the legacy 4 quarters.
 */
export function getGradingPeriods(schoolYear: string): GradingPeriodOption[] {
  return isTermBasedSchoolYear(schoolYear) ? TERM_PERIODS : QUARTER_PERIODS;
}

/** Label for a single grading period in the context of a school year. */
export function getGradingPeriodLabel(
  schoolYear: string,
  period: number
): string {
  return (
    getGradingPeriods(schoolYear).find((p) => p.value === period)?.label ??
    `Period ${period}`
  );
}
