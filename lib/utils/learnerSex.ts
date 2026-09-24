// Listing learners MALE first, then FEMALE.
//
// Every DepEd class list — SF1, SF2, the E-Class Record, the Phil-IRI matrix —
// prints the boys as one block and the girls as another, each numbered from 1
// and each carrying its own count. Screens and printables that list learners
// follow the same convention so a teacher reading the screen against the paper
// finds the same row in the same place.
//
// One implementation, shared by the UI and the PDF generators, so the order and
// the labels cannot drift between them. Order WITHIN a group is whatever order
// the caller passed in (normally surname), because the grouping is stable — the
// helper never re-sorts by name itself.
//
// A learner with no recorded sex is not silently filed as either: they land in
// a trailing UNSPECIFIED group, which is only emitted when it is non-empty, so a
// clean roster prints exactly MALE then FEMALE.

export type LearnerSexKey = "male" | "female" | "unspecified";

export const LEARNER_SEX_LABEL: Record<LearnerSexKey, string> = {
  male: "MALE",
  female: "FEMALE",
  unspecified: "UNSPECIFIED",
};

const ORDER: readonly LearnerSexKey[] = ["male", "female", "unspecified"];

/** Reads "male" / "Male" / "M" / "female" / "F" … into a group key. */
export function learnerSexKey(value: string | null | undefined): LearnerSexKey {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "male" || v === "m") return "male";
  if (v === "female" || v === "f") return "female";
  return "unspecified";
}

export interface LearnerSexGroup<T> {
  key: LearnerSexKey;
  label: string;
  rows: T[];
}

/**
 * Splits rows into MALE, FEMALE and (only when non-empty) UNSPECIFIED groups,
 * preserving the input order inside each group. MALE and FEMALE are always
 * returned, even when empty, so a printed form keeps both blocks.
 */
export function groupLearnersBySex<T>(
  rows: readonly T[],
  getSex: (row: T) => string | null | undefined,
): LearnerSexGroup<T>[] {
  const buckets: Record<LearnerSexKey, T[]> = {
    male: [],
    female: [],
    unspecified: [],
  };
  for (const row of rows) buckets[learnerSexKey(getSex(row))].push(row);
  return ORDER.filter((key) => key !== "unspecified" || buckets[key].length > 0)
    .map((key) => ({ key, label: LEARNER_SEX_LABEL[key], rows: buckets[key] }));
}

/** Stable re-order: all males, then all females, then unspecified. */
export function sortLearnersBySex<T>(
  rows: readonly T[],
  getSex: (row: T) => string | null | undefined,
): T[] {
  return groupLearnersBySex(rows, getSex).flatMap((g) => g.rows);
}

/**
 * For a flat list already in sex order (e.g. a paginated server list ordered
 * by gender): true when row `index` starts a new group and should be preceded
 * by a group heading.
 */
export function startsSexGroup<T>(
  rows: readonly T[],
  index: number,
  getSex: (row: T) => string | null | undefined,
): boolean {
  if (index === 0) return rows.length > 0;
  return learnerSexKey(getSex(rows[index])) !==
    learnerSexKey(getSex(rows[index - 1]));
}
