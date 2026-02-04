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
