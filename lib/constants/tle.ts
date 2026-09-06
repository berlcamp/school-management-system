// EPP / TLE component taxonomy (migration 174).
//
// The same shape migration 153 gave MAPEH, on a second learning area: EPP-TLE
// prints as one subject line carrying one grade, with its components indented
// beneath, and it counts ONCE toward the general average. Before this the
// components were ordinary subjects, so a school teaching ICT alongside a
// specialisation weighted the learning area twice against Mathematics.
//
// WHAT DIFFERS FROM MAPEH: the components are NOT equally weighted. The
// updated DepEd per-component workbook combines them as
//
//   ROUND( ICT x 0.25 + <specialisation> x 0.75, 0 )
//
// every term, because ICT runs across all three terms while the specialisation
// rotates (AFA, then FCS, then IA in the issued file). The rotation itself is
// not stored anywhere — the term's grades already say which specialisation the
// school offered that term.
//
// There is deliberately no EPP/TLE row in sms_subjects: like MAPEH's, the
// parent is computed at print time, so no teacher can encode a parent grade
// contradicting its components.

export type TleComponent = "ict" | "afa" | "fcs" | "ia";

/**
 * Grades 4-6 call the learning area EPP and Grades 7-10 call it TLE. It is the
 * same area with the same components, so the label is chosen at print time
 * rather than stored — a subject does not change when it is reused a grade up.
 */
export function tleParentLabel(gradeLevel?: number | null): string {
  if (gradeLevel != null && gradeLevel >= 1 && gradeLevel <= 6) return "EPP";
  return "TLE";
}

/**
 * The components, in the order they print, with the weight each carries in the
 * term grade. ICT is the quarter and the specialisation the three quarters;
 * a term offering more than one specialisation renormalises over whichever are
 * present, which is also what makes a half-encoded term print a figure at all.
 */
export const TLE_COMPONENTS: {
  value: TleComponent;
  /** Printed as the indented row label */
  label: string;
  /** Compact form, for badges beside a subject code */
  short: string;
  /** Share of the term grade, before renormalising over what is present */
  weight: number;
}[] = [
  {
    value: "ict",
    label: "Information and Communications Technology",
    short: "ICT",
    weight: 0.25,
  },
  {
    value: "afa",
    label: "Agri-Fishery Arts",
    short: "AFA",
    weight: 0.75,
  },
  {
    // DepEd's MATATAG name for what schools have long called Home Economics.
    value: "fcs",
    label: "Family and Consumer Science (Home Economics)",
    short: "FCS",
    weight: 0.75,
  },
  {
    value: "ia",
    label: "Industrial Arts",
    short: "IA",
    weight: 0.75,
  },
];

/** Print order, by component. Anything untagged sorts after all of them. */
export const tleComponentRank = (value: TleComponent | null): number => {
  if (!value) return TLE_COMPONENTS.length;
  const index = TLE_COMPONENTS.findIndex((c) => c.value === value);
  return index === -1 ? TLE_COMPONENTS.length : index;
};

/**
 * Resolve the stored component of a subject, rejecting anything unknown. The
 * column is CHECK-constrained, but rows read through loosely-typed queries are
 * not, and an unknown value must not silently pull a subject into the parent.
 */
export function getTleComponent(subject: {
  tle_component?: string | null;
}): TleComponent | null {
  const stored = subject.tle_component;
  if (!stored) return null;
  return TLE_COMPONENTS.some((c) => c.value === stored)
    ? (stored as TleComponent)
    : null;
}

export const getTleComponentLabel = (value: TleComponent): string =>
  TLE_COMPONENTS.find((c) => c.value === value)?.label ?? value;

export const getTleComponentShortLabel = (value: TleComponent): string =>
  TLE_COMPONENTS.find((c) => c.value === value)?.short ?? value;

export const tleComponentWeight = (value: TleComponent): number =>
  TLE_COMPONENTS.find((c) => c.value === value)?.weight ?? 0.75;

/** True when the subject is tagged as one of the EPP/TLE components. */
export const isTleComponent = (subject: {
  tle_component?: string | null;
}): boolean => getTleComponent(subject) !== null;
