// MAPEH component taxonomy (migration 153, re-cut to two components by 155).
//
// MAPEH is one learning area printed as a single subject line carrying one
// grade, with its components indented beneath as the breakdown, and it counts
// ONCE toward the general average.
//
// Before 153 the app had no way to say which subjects were components, so:
//
//   * the report card and SF9 printed them flat and counted each as a full
//     subject, weighting MAPEH several times against Math;
//   * SF10 and Form 137 grouped them by running a regex over the subject
//     name (`generateSf10.ts` getJHSKey / getESKey), which misses a subject
//     called "P.E." or "MUSIC & ARTS G8", and dropped MAPEH from the general
//     average entirely.
//
// `sms_subjects.mapeh_component` replaces the guess with a stored fact. NULL
// (the default) means the subject is not part of MAPEH, so nothing that
// predates the column changes behaviour until a school tags something.
//
// The components are the two the schools actually timetable and grade —
// **Music and Arts** and **Physical Education and Health**. 153 modelled the
// acronym's four letters instead, which is the curriculum's breakdown but not
// the subject list: a school carries one "Music & Arts" subject with one
// teacher and one grade, not a Music subject and an Arts subject. Migration
// 155 folds the four old values onto these two; see LEGACY_COMPONENTS below.
//
// There is deliberately no MAPEH row in sms_subjects: the parent is computed
// at print time. A real parent row would need its own schedule and grade
// entry, and a teacher could then encode a MAPEH grade contradicting the one
// derived from its components.

export type MapehComponent = "music_arts" | "pe_health";

/** The label of the computed parent row. */
export const MAPEH_LABEL = "MAPEH";

/**
 * The components, in the order they print — which is the order the acronym
 * spells. A boolean column could not have expressed this, which is why the
 * subject form stores which component rather than merely whether.
 */
export const MAPEH_COMPONENTS: {
  value: MapehComponent;
  /** Shown in the dropdown and printed as the indented row label */
  label: string;
  /** Compact form, for badges beside a subject code */
  short: string;
}[] = [
  { value: "music_arts", label: "Music and Arts", short: "Music & Arts" },
  {
    value: "pe_health",
    label: "Physical Education and Health",
    short: "PE & Health",
  },
];

/**
 * The four values migration 153 allowed, mapped onto the two that replaced
 * them (migration 155). Read-side only: nothing writes these any more.
 *
 * Resolving them here rather than trusting the migration's UPDATE means a
 * card printed from a database where 155 has not been applied yet still
 * groups correctly instead of silently dropping a subject out of the MAPEH
 * block and back into the general average as a full subject of its own.
 */
const LEGACY_COMPONENTS: Record<string, MapehComponent> = {
  music: "music_arts",
  arts: "music_arts",
  pe: "pe_health",
  health: "pe_health",
};

/** Print order, by component. Anything untagged sorts after all of them. */
export const mapehComponentRank = (value: MapehComponent | null): number => {
  if (!value) return MAPEH_COMPONENTS.length;
  const index = MAPEH_COMPONENTS.findIndex((c) => c.value === value);
  return index === -1 ? MAPEH_COMPONENTS.length : index;
};

/**
 * Resolve the stored component of a subject, rejecting anything that is
 * neither a current value nor one of 153's four. The column is
 * CHECK-constrained, but historical rows read through loosely-typed queries
 * are not, and an unknown value must not silently pull a subject into the
 * parent grade.
 */
export function getMapehComponent(subject: {
  mapeh_component?: string | null;
}): MapehComponent | null {
  const stored = subject.mapeh_component;
  if (!stored) return null;
  if (MAPEH_COMPONENTS.some((c) => c.value === stored)) {
    return stored as MapehComponent;
  }
  return LEGACY_COMPONENTS[stored] ?? null;
}

export const getMapehComponentLabel = (value: MapehComponent): string =>
  MAPEH_COMPONENTS.find((c) => c.value === value)?.label ?? value;

export const getMapehComponentShortLabel = (value: MapehComponent): string =>
  MAPEH_COMPONENTS.find((c) => c.value === value)?.short ?? value;

/** True when the subject is tagged as one of the MAPEH components. */
export const isMapehComponent = (subject: {
  mapeh_component?: string | null;
}): boolean => getMapehComponent(subject) !== null;
