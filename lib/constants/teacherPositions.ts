// Plantilla positions offered for teaching staff on /staff. Stored verbatim in
// `sms_users.position` (free TEXT) with the Roman numerals DepEd prints, which
// is also what `suggestCareerStage()` in lib/constants/supervision.ts reads.
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;

export const TEACHER_POSITIONS: string[] = [
  ...ROMAN.slice(0, 7).map((r) => `Teacher ${r}`),
  ...ROMAN.slice(0, 4).map((r) => `Master Teacher ${r}`),
];

/**
 * The listed position a hand-typed value means, or null. Existing rows were
 * typed freely ("TEACHER III", "Teacher-I", "Teacher 1"), so editing one
 * should land on its option rather than looking blank. Whole-string match
 * only: "Special Science Teacher I" and "Head Teacher I" are not Teacher I.
 */
export function matchTeacherPosition(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const key = (s: string) =>
    s
      .toUpperCase()
      .replace(/[.\-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/ (\d)$/, (_, d: string) => ` ${ROMAN[Number(d) - 1] ?? d}`);
  const k = key(value);
  return TEACHER_POSITIONS.find((p) => key(p) === k) ?? null;
}
