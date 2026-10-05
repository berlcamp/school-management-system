/** MM/DD/YYYY, as the workbook prints a birthdate. */
export function formatDob(date: string | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = String(date).slice(0, 10).split("-");
  return y && m && d ? `${m}/${d}/${y}` : "—";
}
