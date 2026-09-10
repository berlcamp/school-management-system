// Grouping a learning area's components into one printed subject.
//
// Three learning areas print as a single line carrying one grade, with their
// components indented beneath, counting ONCE toward the general average:
//
//   MAPEH    Music and Arts + PE and Health              (migrations 153, 155)
//   EPP/TLE  ICT + the term's specialisation             (migration 174)
//   Effective Communication / Mabisang Komunikasyon      (migration 185, SHS)
//
// Shared by the report card (lib/pdf/generateReportCard.ts) and SF9
// (lib/pdf/generateSf9.ts), which fetch identically shaped rows and, before
// this, each carried its own copy of the flat layout and the flat average.
// One implementation so the two forms cannot drift apart again — the same
// reason migration 128 collapsed the two GPA code paths into one.
//
// The two areas differ in exactly one respect, and it is data, not code:
// MAPEH's components are equally weighted, while EPP/TLE weights ICT at 0.25
// against the specialisation's 0.75, because ICT runs across all three terms
// while the specialisation rotates. Both resolve through the same weighted
// mean, so a school that tags neither, one or both gets one code path.
//
// The parent row is computed here and never stored. Its grade for a quarter is
// the weighted mean of whichever components have a grade for that quarter,
// renormalised over what is present: a card printed mid-year shows a figure
// built from the components encoded so far, matching how the existing
// per-subject final already averages whichever quarters exist rather than
// waiting for all four. (The DepEd workbook's own EPP-TLE formula errors when
// exactly one of its two components is blank; renormalising is the reading
// that keeps a half-encoded term printable.)
//
// Rounding happens at every level, which is what the rest of the card does
// and what a teacher reproduces by hand from the printed numbers.

import { getMapehComponent, MAPEH_LABEL, mapehComponentRank } from "@/lib/constants/mapeh";
import {
  COMM_PARENT_LABEL,
  commComponentRank,
  getCommComponent,
  getShsCategory,
  getShsCategoryLabel,
  shsCategoryRank,
  type ShsSubjectCategory,
} from "@/lib/constants/shsSubjects";
import {
  getTleComponent,
  tleComponentRank,
  tleComponentWeight,
  tleParentLabel,
} from "@/lib/constants/tle";

/** DepEd passing mark. */
export const PASSING_GRADE = 75;

/** One subject as fetched from sms_grades + sms_subjects, before grouping. */
export interface MapehSourceRow {
  name: string;
  /** Used for print order; falls back to the name when absent */
  code?: string | null;
  is_madrasah: boolean;
  mapeh_component?: string | null;
  /** Migration 174 — NULL for everything that is not part of EPP/TLE. */
  tle_component?: string | null;
  /** Migration 185 — NULL for everything outside that SHS learning area. */
  comm_component?: string | null;
  /** Migration 185 — the SHS SF9 Units column. Reported, never a weight. */
  units?: number | null;
  /** Migration 185 — core | elective, the SHS SF9 group heading. */
  shs_category?: string | null;
  q1: number | null;
  q2: number | null;
  q3: number | null;
  q4: number | null;
}

/**
 * One printed line. `header` is a computed parent row, `sub` its breakdown, and
 * `group` a Core / Elective heading carrying no grades (SHS only).
 */
export interface CardSubjectRow {
  name: string;
  kind: "plain" | "header" | "sub" | "group";
  q1: number | null;
  q2: number | null;
  q3: number | null;
  q4: number | null;
  /** Mean of the quarters present, rounded; null when nothing is encoded */
  final: number | null;
  /**
   * SHS SF9 Units (migration 185). A parent row carries its components'
   * units together; a component row and a group heading carry none.
   */
  units: number | null;
  remarks: string;
  /**
   * Whether this line's final feeds the general average. False for the
   * component rows — the header row carries them, once — and false for
   * madrasah/ALS subjects, which have been out of the average since 076.
   */
  countsTowardAverage: boolean;
}

const mean = (values: number[]): number =>
  values.reduce((a, b) => a + b, 0) / values.length;

const roundedMean = (values: (number | null)[]): number | null => {
  const present = values.filter((v): v is number => v != null);
  return present.length >= 1 ? Math.round(mean(present)) : null;
};

/**
 * The parent's grade for one period: the components' grades weighted by their
 * share of the learning area, renormalised over whichever are present, rounded.
 *
 * With equal weights this is exactly `roundedMean`, which is what MAPEH wants.
 * With EPP/TLE's 0.25 / 0.75 it reproduces the DepEd workbook's
 * `ROUND(ICT * 0.25 + specialisation * 0.75, 0)` when both are encoded.
 */
const weightedRoundedMean = (
  entries: { value: number | null; weight: number }[],
): number | null => {
  const present = entries.filter(
    (e): e is { value: number; weight: number } => e.value != null && e.weight > 0,
  );
  if (present.length === 0) return null;
  const totalWeight = present.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight <= 0) return null;
  return Math.round(
    present.reduce((sum, e) => sum + e.value * e.weight, 0) / totalWeight,
  );
};

/**
 * The learning areas that fold into a computed parent row. Each says how to
 * recognise a component, how the components order, what each weighs, and what
 * the parent line is called. Adding a third is a row here.
 */
const GROUPED_AREAS: {
  key: string;
  componentOf: (row: MapehSourceRow) => string | null;
  rank: (component: string | null) => number;
  weightOf: (component: string) => number;
  label: (gradeLevel?: number | null) => string;
}[] = [
  {
    key: "mapeh",
    componentOf: (row) => getMapehComponent(row),
    rank: (component) =>
      mapehComponentRank(component as Parameters<typeof mapehComponentRank>[0]),
    // Equal shares: MAPEH's components carry the same weight as each other.
    weightOf: () => 1,
    label: () => MAPEH_LABEL,
  },
  {
    key: "tle",
    componentOf: (row) => getTleComponent(row),
    rank: (component) =>
      tleComponentRank(component as Parameters<typeof tleComponentRank>[0]),
    weightOf: (component) =>
      tleComponentWeight(component as Parameters<typeof tleComponentWeight>[0]),
    label: (gradeLevel) => tleParentLabel(gradeLevel),
  },
  {
    // Senior High, migration 185. Equal shares: the issued Class Summary
    // carries a column for each language and one combined Term Grade, with
    // nothing to suggest either dominates.
    key: "comm",
    componentOf: (row) => getCommComponent(row),
    rank: (component) =>
      commComponentRank(component as Parameters<typeof commComponentRank>[0]),
    weightOf: () => 1,
    label: () => COMM_PARENT_LABEL,
  },
];

/** Units of a set of subjects, or null when not one of them carries a figure. */
const totalUnits = (rows: MapehSourceRow[]): number | null => {
  const present = rows
    .map((r) => r.units)
    .filter((u): u is number => typeof u === "number" && u > 0);
  return present.length > 0 ? present.reduce((a, b) => a + b, 0) : null;
};

const remarksFor = (final: number | null): string =>
  final === null ? "" : final >= PASSING_GRADE ? "Passed" : "Failed";

const sortKeyOf = (row: MapehSourceRow): string =>
  (row.code || row.name || "").toLowerCase();

function toCardRow(
  name: string,
  kind: CardSubjectRow["kind"],
  quarters: (number | null)[],
  countsTowardAverage: boolean,
  units: number | null = null,
): CardSubjectRow {
  const [q1, q2, q3, q4] = quarters;
  const final = roundedMean(quarters);
  return {
    name,
    kind,
    q1: q1 ?? null,
    q2: q2 ?? null,
    q3: q3 ?? null,
    q4: q4 ?? null,
    final,
    units,
    remarks: remarksFor(final),
    countsTowardAverage,
  };
}

/** A Core / Elective heading: a label, no grades, no units, no average. */
const toGroupRow = (name: string): CardSubjectRow =>
  toCardRow(name, "group", [null, null, null, null], false);

/** Options that affect how rows are labelled and ordered, never their grades. */
export interface BuildCardOptions {
  /** Grades 4-6 print the EPP/TLE parent as "EPP", Grades 7-10 as "TLE". */
  gradeLevel?: number | null;
  /**
   * Senior High only (migration 185): order the subjects Core then Elective
   * and print a heading row above each block, as the issued SF9 does. Ignored
   * when no subject at the grade level carries a category, so a school that
   * has not tagged anything keeps the flat list it prints today.
   */
  groupByShsCategory?: boolean;
}

/**
 * Order the subjects for print and fold any tagged components into a computed
 * parent row followed by its breakdown.
 *
 * Subjects sort by code — matching every other subject list in the app — and a
 * grouped block sits where its first component would have fallen. Before this
 * the report card imposed no subject order at all, so the print order was the
 * insertion order of sms_grades and could change when a teacher re-encoded.
 *
 * A subject can belong to at most one area (migration 174 makes that a CHECK),
 * so the areas are scanned in order and the first claim wins.
 */
export function buildCardSubjectRows(
  sourceRows: MapehSourceRow[],
  options: BuildCardOptions = {},
): CardSubjectRow[] {
  const claimed = new Set<MapehSourceRow>();
  const blocks: {
    sortKey: string;
    category: ShsSubjectCategory | null;
    rows: CardSubjectRow[];
  }[] = [];

  for (const area of GROUPED_AREAS) {
    const components = sourceRows.filter(
      (r) => !claimed.has(r) && area.componentOf(r) !== null,
    );
    if (components.length === 0) continue;
    components.forEach((r) => claimed.add(r));

    // Each period of the parent is the weighted mean of the components that
    // have a grade for it, so a half-encoded period still prints a figure.
    const parentPeriods = ([1, 2, 3, 4] as const).map((q) =>
      weightedRoundedMean(
        components.map((r) => ({
          value: r[`q${q}` as "q1" | "q2" | "q3" | "q4"],
          weight: area.weightOf(area.componentOf(r)!),
        })),
      ),
    );

    const ordered = [...components].sort((a, b) => {
      const rank = area.rank(area.componentOf(a)) - area.rank(area.componentOf(b));
      return rank !== 0 ? rank : sortKeyOf(a).localeCompare(sortKeyOf(b));
    });

    blocks.push({
      // Anchor the block where its earliest component would have sorted.
      sortKey: components.map(sortKeyOf).sort()[0],
      // The area sits in whichever block its components are filed under; the
      // first one that carries a category speaks for the rest.
      category:
        ordered.map((row) => getShsCategory(row)).find((c) => c !== null) ?? null,
      rows: [
        toCardRow(
          area.label(options.gradeLevel),
          "header",
          parentPeriods,
          true,
          // The parent line carries the learning area's units — its
          // components' together — and the component lines carry none, as the
          // issued sheet prints them.
          totalUnits(ordered),
        ),
        ...ordered.map((row) =>
          toCardRow(row.name, "sub", [row.q1, row.q2, row.q3, row.q4], false),
        ),
      ],
    });
  }

  const plain = sourceRows
    .filter((r) => !claimed.has(r))
    .map((row) => ({
      sortKey: sortKeyOf(row),
      category: getShsCategory(row),
      rows: [
        toCardRow(
          row.name,
          "plain",
          [row.q1, row.q2, row.q3, row.q4],
          !row.is_madrasah,
          row.units ?? null,
        ),
      ],
    }));

  const all = [...plain, ...blocks];

  // Senior High prints Core Subjects then Elective Subjects, each under a
  // heading. Anything untagged keeps sorting by code and follows both blocks
  // without a heading of its own, so turning grouping on can never hide a
  // learning area.
  const grouped =
    options.groupByShsCategory && all.some((b) => b.category !== null);

  const ordered = all.sort((a, b) => {
    if (grouped) {
      const rank = shsCategoryRank(a.category) - shsCategoryRank(b.category);
      if (rank !== 0) return rank;
    }
    return a.sortKey.localeCompare(b.sortKey);
  });

  if (!grouped) return ordered.flatMap((b) => b.rows);

  const rows: CardSubjectRow[] = [];
  let heading: ShsSubjectCategory | null = null;
  ordered.forEach((block) => {
    if (block.category !== null && block.category !== heading) {
      rows.push(toGroupRow(getShsCategoryLabel(block.category)));
    }
    heading = block.category;
    rows.push(...block.rows);
  });
  return rows;
}

/**
 * The general average: the mean of the per-subject finals that count, rounded.
 * A grouped learning area contributes once through its header row rather than
 * once per component.
 */
export function computeGeneralAverage(rows: CardSubjectRow[]): {
  average: number | null;
  remarks: string;
} {
  const finals = rows
    .filter((r) => r.countsTowardAverage)
    .map((r) => r.final)
    .filter((v): v is number => v != null);
  const average = finals.length >= 1 ? Math.round(mean(finals)) : null;
  return { average, remarks: remarksFor(average) };
}
