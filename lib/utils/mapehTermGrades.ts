import { buildCardSubjectRows, type MapehSourceRow } from "@/lib/utils/mapeh";
import type { MapehComponent } from "@/lib/constants/mapeh";

/** One MAPEH component of one learner: grading period -> grade. */
export interface MapehComponentTerms {
  component: MapehComponent;
  terms: Record<number, number> | undefined;
  /** Approved points on this component's final (239). */
  finalPoints?: number;
}

export interface MapehTermGrades {
  /** grading period -> MAPEH grade; null until every component has that term */
  terms: Record<number, number | null>;
  /** null until every component has every term */
  final: number | null;
}

/**
 * The MAPEH grades of one learner, by the rule the report card / SF9 print
 * (`buildCardSubjectRows`). The card renormalises over whichever component is
 * encoded; here a term stays blank until all of them are, so one component's
 * grade never reads as a MAPEH grade.
 */
export function mapehTermGrades(
  components: MapehComponentTerms[],
  periods: number[],
): MapehTermGrades {
  const complete = (p: number) =>
    components.length > 0 && components.every((c) => c.terms?.[p] != null);
  const at = (c: MapehComponentTerms, p: number) =>
    periods.includes(p) && complete(p) ? (c.terms?.[p] ?? null) : null;
  const source: MapehSourceRow[] = components.map((c) => ({
    name: c.component,
    is_madrasah: false,
    mapeh_component: c.component,
    q1: at(c, 1),
    q2: at(c, 2),
    q3: at(c, 3),
    q4: at(c, 4),
    finalPoints: c.finalPoints ?? 0,
  }));
  const header = buildCardSubjectRows(source, {
    requirePeriods: periods.length,
  }).find((r) => r.kind === "header");
  const byPeriod = [header?.q1, header?.q2, header?.q3, header?.q4];
  return {
    terms: Object.fromEntries(periods.map((p) => [p, byPeriod[p - 1] ?? null])),
    final: header?.final ?? null,
  };
}
