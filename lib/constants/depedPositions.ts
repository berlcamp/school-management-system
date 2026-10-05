// Common DepEd plantilla positions, offered on /profile. Stored verbatim in
// `sms_users.position` (free TEXT) with the Roman numerals DepEd prints — the
// form `suggestCareerStage()` (lib/constants/supervision.ts) and Staff by
// Position (lib/utils/positionSummary.ts) read. A position not listed is typed
// in and stored as written.

import { TEACHER_POSITIONS } from "./teacherPositions";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;
const ranks = (title: string, n: number) =>
  ROMAN.slice(0, n).map((r) => `${title} ${r}`);

export interface DepedPositionGroup {
  label: string;
  positions: string[];
}

export const DEPED_POSITION_GROUPS: DepedPositionGroup[] = [
  { label: "Teaching", positions: TEACHER_POSITIONS },
  {
    label: "Special Teaching",
    positions: [
      ...ranks("Special Science Teacher", 2),
      ...ranks("Special Education Teacher", 3),
      "Volunteer Teacher",
    ],
  },
  {
    label: "School Leadership",
    positions: [
      ...ranks("Head Teacher", 6),
      ...ranks("Assistant School Principal", 3),
      ...ranks("School Principal", 4),
    ],
  },
  {
    label: "Non-Teaching",
    positions: [
      ...ranks("Administrative Officer", 5),
      ...ranks("Administrative Assistant", 3),
      ...ranks("Administrative Aide", 6),
      ...ranks("Project Development Officer", 2),
      ...ranks("Guidance Counselor", 3),
      ...ranks("Nurse", 2),
      "Registrar I",
      ...ranks("Librarian", 2),
      ...ranks("Security Guard", 2),
      ...ranks("Watchman", 2),
    ],
  },
];

const ALL_POSITIONS = DEPED_POSITION_GROUPS.flatMap((g) => g.positions);

// Abbreviations and older titles seen in hand-typed rows.
const ALIASES: [RegExp, string][] = [
  [/^AO /, "ADMINISTRATIVE OFFICER "],
  [/^ADAS /, "ADMINISTRATIVE ASSISTANT "],
  [/^PRINCIPAL /, "SCHOOL PRINCIPAL "],
  [/^SPET /, "SPECIAL EDUCATION TEACHER "],
];

const key = (s: string) => {
  let k = s
    .toUpperCase()
    .replace(/[.\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ (\d)$/, (_, d: string) => ` ${ROMAN[Number(d) - 1] ?? d}`);
  for (const [re, to] of ALIASES) k = k.replace(re, to);
  return k;
};

/**
 * The listed position a hand-typed value means, or null. Whole-string match
 * only, so "Head Teacher I" is never read as Teacher I.
 */
export function matchDepedPosition(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const k = key(value);
  return ALL_POSITIONS.find((p) => key(p) === k) ?? null;
}
