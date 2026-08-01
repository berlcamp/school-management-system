/**
 * Key Performance Indicator formulas.
 *
 * Every function here implements a formula printed in the DepEd Memorandum of
 * 12 October 2022, "Guide in Computing Key Performance Indicators" (PS-EMISD).
 * Page references are given so each one can be checked against the source.
 *
 * All functions are pure: they take facts from the `kpi_enrollment_facts` /
 * `kpi_resource_facts` RPCs plus the typed-in reference data, and return
 * numbers. Nothing fetches, and nothing rounds — rounding is a display concern.
 *
 * A rate is `null`, never 0 or NaN, when its denominator is missing or zero.
 * The distinction matters: "no learners of that age were projected" is not the
 * same statement as "the rate is zero".
 */

import {
  KPI_COHORT_MAX_REPETITIONS,
  KPI_COHORT_SIZE,
  KPI_IQR_MIN_SCHOOLS,
  KpiCycle,
  KpiIntakeLevel,
  KpiLevel,
  KpiTransition,
} from "@/lib/constants/kpi";
import type {
  KpiEnrollmentFact,
  KpiReference,
  KpiResourceFact,
} from "@/types";

export type KpiSex = "male" | "female";

/** Which learners a fact query counts. Omitted keys mean "all". */
export interface KpiFactQuery {
  grades?: number[];
  /** Inclusive age band, applied to the age as of the school year opening. */
  ages?: [number, number];
  sex?: KpiSex;
}

type KpiFactField =
  | "enrollment"
  | "repeaters"
  | "promotes"
  | "graduates"
  | "dropouts";

/** Sum one field of the fact table over the learners a query selects. */
export function sumFacts(
  facts: KpiEnrollmentFact[],
  field: KpiFactField,
  query: KpiFactQuery = {}
): number {
  let total = 0;
  for (const f of facts) {
    if (query.grades && !query.grades.includes(f.grade_level)) continue;
    if (query.sex && f.sex !== query.sex) continue;
    if (query.ages && (f.age < query.ages[0] || f.age > query.ages[1])) continue;
    total += f[field];
  }
  return total;
}

/**
 * Percentage, or null when the denominator cannot support one. Denominators
 * are counts of people, so a negative or zero one is always meaningless.
 */
export function percent(
  numerator: number,
  denominator: number | null | undefined
): number | null {
  if (denominator === null || denominator === undefined) return null;
  if (denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

/** A computed rate together with the two figures it came from. */
export interface KpiRate {
  value: number | null;
  numerator: number;
  denominator: number | null;
}

function rate(numerator: number, denominator: number | null): KpiRate {
  return { value: percent(numerator, denominator), numerator, denominator };
}

/** Population column lookup, normalising 0 to null (0 is never a real PSA figure). */
function population(
  reference: KpiReference | null,
  key: keyof KpiReference
): number | null {
  if (!reference) return null;
  const value = reference[key];
  if (typeof value !== "number" || value <= 0) return null;
  return value;
}

// ============================================================================
// ACCESS INDICATORS (memo pp. 2–9)
// ============================================================================

/**
 * Gross Enrollment Rate — enrollment in a level REGARDLESS OF AGE over the
 * projected population of that level's official school age (memo pp. 3–4).
 */
export function grossEnrollmentRate(
  level: KpiLevel,
  facts: KpiEnrollmentFact[],
  reference: KpiReference | null,
  sex?: KpiSex
): KpiRate {
  const enrolled = sumFacts(facts, "enrollment", { grades: level.grades, sex });
  return rate(enrolled, population(reference, level.populationKey));
}

/**
 * Net Enrollment Rate — the same denominator, but the numerator counts only
 * learners OF the official school age (memo pp. 4–6).
 */
export function netEnrollmentRate(
  level: KpiLevel,
  facts: KpiEnrollmentFact[],
  reference: KpiReference | null,
  sex?: KpiSex
): KpiRate {
  const enrolled = sumFacts(facts, "enrollment", {
    grades: level.grades,
    ages: [level.ageMin, level.ageMax],
    sex,
  });
  return rate(enrolled, population(reference, level.populationKey));
}

/**
 * Gross Intake Rate — new entrants to the entrance grade, of any age, over the
 * projected population of the school-entrance age (memo p. 7).
 * New entrants = enrollment − repeaters.
 */
export function grossIntakeRate(
  intake: KpiIntakeLevel,
  facts: KpiEnrollmentFact[],
  reference: KpiReference | null,
  sex?: KpiSex
): KpiRate {
  const query: KpiFactQuery = { grades: [intake.gradeLevel], sex };
  const newEntrants =
    sumFacts(facts, "enrollment", query) - sumFacts(facts, "repeaters", query);
  return rate(newEntrants, population(reference, intake.populationKey));
}

/**
 * Net Intake Rate — new entrants OF the official school-entrance age only
 * (memo pp. 7–8). The memo notes the NIR shall not exceed 100%.
 */
export function netIntakeRate(
  intake: KpiIntakeLevel,
  facts: KpiEnrollmentFact[],
  reference: KpiReference | null,
  sex?: KpiSex
): KpiRate {
  const query: KpiFactQuery = {
    grades: [intake.gradeLevel],
    ages: [intake.officialAge, intake.officialAge],
    sex,
  };
  const newEntrants =
    sumFacts(facts, "enrollment", query) - sumFacts(facts, "repeaters", query);
  return rate(newEntrants, population(reference, intake.populationKey));
}

/**
 * Transition Rate — new entrants to the next grade this year over enrollment
 * in the feeding grade last year (memo pp. 8–9).
 */
export function transitionRate(
  transition: KpiTransition,
  current: KpiEnrollmentFact[],
  previous: KpiEnrollmentFact[],
  sex?: KpiSex
): KpiRate {
  const toQuery: KpiFactQuery = { grades: [transition.toGrade], sex };
  const newEntrants =
    sumFacts(current, "enrollment", toQuery) -
    sumFacts(current, "repeaters", toQuery);
  const feeding = sumFacts(previous, "enrollment", {
    grades: [transition.fromGrade],
    sex,
  });
  return rate(newEntrants, feeding > 0 ? feeding : null);
}

// ============================================================================
// EFFICIENCY INDICATORS — reconstructed cohort method (memo pp. 10–14)
// ============================================================================

/**
 * The three eventualities of a grade level in the reconstructed cohort method:
 * a learner is promoted, repeats, or leaves. The memo states the identity
 * 1 = promotion + repetition + school leaver (p. 12).
 */
export interface KpiGradeEfficiency {
  gradeLevel: number;
  /** BOSY enrollment in this grade, previous school year — every denominator. */
  enrollmentPrevious: number;
  /** BOSY enrollment in this grade, reference school year. */
  enrollmentCurrent: number;
  /** Repeaters in this grade, reference school year. */
  repeatersCurrent: number;
  /** EOSY dropouts in this grade, reference school year. */
  dropoutsCurrent: number;
  promotionRate: number | null;
  repetitionRate: number | null;
  schoolLeaverRate: number | null;
  simpleDropoutRate: number | null;
  /** The cycle's final grade: its promotion rate is a graduation/completion rate. */
  isTerminal: boolean;
}

/**
 * Per-grade promotion, repetition and school-leaver rates for one cycle.
 *
 * For a non-terminal grade X (memo pp. 11–12):
 *   promotion   = (Enrollment[X+1, N] − Repeaters[X+1, N]) / Enrollment[X, N−1]
 *   repetition  =  Repeaters[X, N]                          / Enrollment[X, N−1]
 *   leaver      = ((Enrollment[X, N−1] − Repeaters[X, N])
 *                  − (Enrollment[X+1, N] − Repeaters[X+1, N])) / Enrollment[X, N−1]
 *
 * For the cycle's final grade the memo replaces promotion with the graduation
 * rate (Grades 6 and 12) or the completion rate of Grade 10 completers, both
 * measured on the PREVIOUS school year's EOSY outcome over that year's BOSY
 * enrollment. There is no grade X+1 inside the cycle to carry the leaver
 * formula, so the leaver rate falls back to the memo's own identity.
 */
export function buildGradeEfficiency(
  cycle: KpiCycle,
  current: KpiEnrollmentFact[],
  previous: KpiEnrollmentFact[],
  sex?: KpiSex
): KpiGradeEfficiency[] {
  return cycle.grades.map((grade) => {
    const isTerminal = grade === cycle.finalGrade;
    const enrollmentPrevious = sumFacts(previous, "enrollment", {
      grades: [grade],
      sex,
    });
    const enrollmentCurrent = sumFacts(current, "enrollment", {
      grades: [grade],
      sex,
    });
    const repeatersCurrent = sumFacts(current, "repeaters", {
      grades: [grade],
      sex,
    });
    const dropoutsCurrent = sumFacts(current, "dropouts", {
      grades: [grade],
      sex,
    });

    const denominator = enrollmentPrevious > 0 ? enrollmentPrevious : null;
    const repetitionRate = percent(repeatersCurrent, denominator);

    let promotionRate: number | null;
    let schoolLeaverRate: number | null;

    if (isTerminal) {
      // Graduates (Grades 6, 12) or completers (Grade 10) of the PREVIOUS
      // school year — the only year whose EOSY outcome is complete.
      const finishers = sumFacts(
        previous,
        cycle.graduates ? "graduates" : "promotes",
        { grades: [grade], sex }
      );
      promotionRate = percent(finishers, denominator);
      schoolLeaverRate =
        promotionRate === null || repetitionRate === null
          ? null
          : 100 - promotionRate - repetitionRate;
    } else {
      const nextQuery: KpiFactQuery = { grades: [grade + 1], sex };
      const newEntrantsNext =
        sumFacts(current, "enrollment", nextQuery) -
        sumFacts(current, "repeaters", nextQuery);
      promotionRate = percent(newEntrantsNext, denominator);
      schoolLeaverRate = percent(
        enrollmentPrevious - repeatersCurrent - newEntrantsNext,
        denominator
      );
    }

    return {
      gradeLevel: grade,
      enrollmentPrevious,
      enrollmentCurrent,
      repeatersCurrent,
      dropoutsCurrent,
      promotionRate,
      repetitionRate,
      schoolLeaverRate,
      // Simple dropout rate: EOSY dropouts over BOSY enrollment, both in the
      // reference year. The memo stresses this is NOT the school leaver rate
      // (p. 18) — it excludes learners who finish but do not re-enroll.
      simpleDropoutRate: percent(
        dropoutsCurrent,
        enrollmentCurrent > 0 ? enrollmentCurrent : null
      ),
      isTerminal,
    };
  });
}

/** Output of the reconstructed cohort model for one cycle. */
export interface KpiCohortResult {
  cycleKey: string;
  /** Percentage of the notional cohort that reaches each grade. */
  survivalRates: { gradeLevel: number; value: number }[];
  /** Pupil-years the cohort spends in each grade. */
  pupilYears: { gradeLevel: number; value: number }[];
  /** Survival to the cycle's final grade — the Cohort Survival Rate. */
  cohortSurvivalRate: number | null;
  /** Share of the cohort that graduates/completes — the Completion Rate. */
  completionRate: number | null;
  coefficientOfEfficiency: number | null;
  yearsInputPerGraduate: number | null;
  totalPupilYears: number;
  graduates: number;
  /** True when a grade's rates were missing, so the model could not run. */
  incomplete: boolean;
}

/**
 * Reconstructed cohort model (memo pp. 10, 13–14).
 *
 * A notional cohort of 1,000 learners enters the cycle's first grade and is
 * followed through the per-grade promotion / repetition / school-leaver rates
 * until it graduates or leaves. Repetition is capped at
 * KPI_COHORT_MAX_REPETITIONS, after which remaining repeaters are treated as
 * leavers — the UIS template this memo is built on caps it the same way, and
 * without a cap the simulation never terminates.
 *
 *   Cohort Survival Rate    = survivors reaching the final grade / 1,000
 *   Completion Rate         = graduates / 1,000
 *   Coefficient of Efficiency = (graduates × years in cycle) / pupil-years
 *   Years Input per Graduate  = pupil-years / graduates
 */
export function reconstructCohort(
  cycle: KpiCycle,
  rows: KpiGradeEfficiency[]
): KpiCohortResult {
  const n = cycle.grades.length;
  const incomplete = rows.some(
    (r) => r.promotionRate === null || r.repetitionRate === null
  );

  const promotion = rows.map((r) => Math.max(0, (r.promotionRate ?? 0) / 100));
  const repetition = rows.map((r) => Math.max(0, (r.repetitionRate ?? 0) / 100));

  // pupils[gradeIndex][timesRepeated] — the repetition count has to be carried
  // per learner, not per grade, because the cap is on repetitions in the cycle.
  let pupils: number[][] = Array.from({ length: n }, () =>
    Array(KPI_COHORT_MAX_REPETITIONS + 1).fill(0)
  );
  pupils[0][0] = KPI_COHORT_SIZE;

  const reachedGrade = Array(n).fill(0);
  reachedGrade[0] = KPI_COHORT_SIZE;
  const pupilYearsByGrade = Array(n).fill(0);
  let graduates = 0;

  // The cohort can spend at most n + cap years in the cycle.
  const years = n + KPI_COHORT_MAX_REPETITIONS;

  for (let year = 0; year < years; year++) {
    const next: number[][] = Array.from({ length: n }, () =>
      Array(KPI_COHORT_MAX_REPETITIONS + 1).fill(0)
    );
    let alive = 0;

    for (let g = 0; g < n; g++) {
      for (let rep = 0; rep <= KPI_COHORT_MAX_REPETITIONS; rep++) {
        const count = pupils[g][rep];
        if (count <= 0) continue;
        alive += count;
        pupilYearsByGrade[g] += count;

        const promoted = count * promotion[g];
        const repeated = count * repetition[g];
        // The remainder left school; it is simply not carried forward.

        if (g === n - 1) {
          graduates += promoted;
        } else if (promoted > 0) {
          next[g + 1][rep] += promoted;
          reachedGrade[g + 1] += promoted;
        }

        if (repeated > 0 && rep < KPI_COHORT_MAX_REPETITIONS) {
          next[g][rep + 1] += repeated;
        }
      }
    }

    if (alive <= 0) break;
    pupils = next;
  }

  const totalPupilYears = pupilYearsByGrade.reduce((a, b) => a + b, 0);
  const cohortSurvivalRate = percent(reachedGrade[n - 1], KPI_COHORT_SIZE);
  const completionRate = percent(graduates, KPI_COHORT_SIZE);

  return {
    cycleKey: cycle.key,
    survivalRates: cycle.grades.map((gradeLevel, i) => ({
      gradeLevel,
      value: (reachedGrade[i] / KPI_COHORT_SIZE) * 100,
    })),
    pupilYears: cycle.grades.map((gradeLevel, i) => ({
      gradeLevel,
      value: pupilYearsByGrade[i],
    })),
    cohortSurvivalRate,
    completionRate,
    coefficientOfEfficiency:
      totalPupilYears > 0 ? ((graduates * n) / totalPupilYears) * 100 : null,
    yearsInputPerGraduate: graduates > 0 ? totalPupilYears / graduates : null,
    totalPupilYears,
    graduates,
    incomplete,
  };
}

// ============================================================================
// EFFICIENCY INDICATORS — old method (memo pp. 15–17)
// ============================================================================

/**
 * Old-method promotion rate: EOSY promotes over BOSY enrollment, same year
 * (memo p. 15). Grades 6 and 12 use `graduates` instead — the graduation rate.
 */
export function oldMethodPromotionRate(
  gradeLevel: number,
  facts: KpiEnrollmentFact[],
  options: { graduation?: boolean; sex?: KpiSex } = {}
): KpiRate {
  const query: KpiFactQuery = { grades: [gradeLevel], sex: options.sex };
  const finishers = sumFacts(
    facts,
    options.graduation ? "graduates" : "promotes",
    query
  );
  const enrolled = sumFacts(facts, "enrollment", query);
  return rate(finishers, enrolled > 0 ? enrolled : null);
}

/**
 * Old-method Cohort Survival Rate: enrollment in the final grade now over
 * enrollment in the entry grade when this cohort started (memo p. 16).
 * `lagged` is the fact table for SY N − cycle.lagYears.
 */
export function oldMethodCohortSurvival(
  cycle: KpiCycle,
  current: KpiEnrollmentFact[],
  lagged: KpiEnrollmentFact[],
  sex?: KpiSex
): KpiRate {
  const finalEnrollment = sumFacts(current, "enrollment", {
    grades: [cycle.finalGrade],
    sex,
  });
  const entryEnrollment = sumFacts(lagged, "enrollment", {
    grades: [cycle.entryGrade],
    sex,
  });
  return rate(finalEnrollment, entryEnrollment > 0 ? entryEnrollment : null);
}

/**
 * Old-method Completion Rate: this year's graduates (or Grade 10 completers)
 * over the entry-grade enrollment of the cohort that started the cycle
 * (memo pp. 16–17).
 */
export function oldMethodCompletionRate(
  cycle: KpiCycle,
  current: KpiEnrollmentFact[],
  lagged: KpiEnrollmentFact[],
  sex?: KpiSex
): KpiRate {
  const finishers = sumFacts(
    current,
    cycle.graduates ? "graduates" : "promotes",
    { grades: [cycle.finalGrade], sex }
  );
  const entryEnrollment = sumFacts(lagged, "enrollment", {
    grades: [cycle.entryGrade],
    sex,
  });
  return rate(finishers, entryEnrollment > 0 ? entryEnrollment : null);
}

// ============================================================================
// RATIO AND PROPORTION (memo pp. 19–23)
// ============================================================================

/**
 * Total seats, per the memo's composition (p. 20):
 *   kinder seats + arm chairs + (school desks × 2) + (2-seater desks × 2).
 * Null when nothing has been entered, so the ratio shows as unavailable rather
 * than as zero seats.
 */
export function seatTotal(reference: KpiReference | null): number | null {
  if (!reference) return null;
  const parts = [
    reference.seats_kindergarten,
    reference.seats_arm_chairs,
    reference.seats_school_desks,
    reference.seats_two_seater_desks,
  ];
  if (parts.every((p) => p === null || p === undefined)) return null;
  return (
    (reference.seats_kindergarten ?? 0) +
    (reference.seats_arm_chairs ?? 0) +
    (reference.seats_school_desks ?? 0) * 2 +
    (reference.seats_two_seater_desks ?? 0) * 2
  );
}

/** Learners per unit of a resource. */
export interface KpiLearnerRatio {
  learners: number;
  units: number | null;
  /** Learners per unit; null when there are no units to divide by. */
  value: number | null;
}

export function learnerRatio(
  learners: number,
  units: number | null | undefined
): KpiLearnerRatio {
  const safeUnits = units === null || units === undefined || units <= 0 ? null : units;
  return {
    learners,
    units: safeUnits,
    value: safeUnits === null ? null : learners / safeUnits,
  };
}

/** Colon form, the way DepEd reports ratios: "1 : 27". */
export function formatRatio(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `1 : ${Math.round(value)}`;
}

/**
 * Gender Parity Index — female value over male value of any indicator
 * (memo p. 21).
 */
export function genderParityIndex(
  femaleValue: number | null,
  maleValue: number | null
): number | null {
  if (femaleValue === null || maleValue === null) return null;
  if (maleValue <= 0) return null;
  return femaleValue / maleValue;
}

/** One school's row in the IQR working table. */
export interface KpiIqrRow {
  schoolId: string;
  schoolName: string;
  enrollment: number;
  resources: number;
  /** Learners per unit of resource — the sort key, ascending = most favored. */
  ratio: number;
  cumulativeEnrollment: number;
  cumulativeEnrollmentPercent: number;
  cumulativeResources: number;
}

export interface KpiIqrResult {
  rows: KpiIqrRow[];
  totalEnrollment: number;
  totalResources: number;
  /** Resources held by the most favored quartile, t(Q1). */
  q1Resources: number | null;
  /** Resources held up to Q3, t(Q3). */
  q3Resources: number | null;
  /** Resources held by the least favored quartile, t(Q4) = total − t(Q3). */
  q4Resources: number | null;
  iqr: number | null;
  /** False when fewer than eight schools have data — the memo's floor. */
  eligible: boolean;
  schoolCount: number;
}

/**
 * Inter-Quartile Ratio (memo pp. 21–23) — the resources held by the most
 * favored quartile of learners over those held by the least favored quartile.
 *
 * The memo's nine steps: compute each school's learner-per-resource ratio, sort
 * ascending (best served first), accumulate enrollment and resources, find the
 * rows where cumulative enrollment crosses 25% and 75%, interpolate the
 * resources at those exact points, and divide t(Q1) by t(Q4).
 *
 * ONE DEVIATION, deliberate: the memo prints the interpolation as
 *   t(Q1) = CF below Q1 − [(25 − %CF below Q1) / (%CF in Q1 − %CF below Q1)]
 *           × resources in Q1
 * Read literally the bracket is subtracted, which returns a value BELOW the
 * cumulative resources already counted before the quartile — impossible for a
 * running total. The bracket is the fraction of the crossing school's learners
 * needed to reach exactly 25%, so it is added to the resources accumulated
 * below that school. That is the only reading under which t(Q1) is monotone and
 * t(Q4) = total − t(Q3) is non-negative.
 *
 * Schools with no enrollment are dropped: they cannot shift a quartile of
 * learners, and they would divide by zero.
 */
export function computeIqr(
  facts: KpiResourceFact[],
  resourceOf: (fact: KpiResourceFact) => number
): KpiIqrResult {
  const scored = facts
    .filter((f) => f.enrollment > 0)
    .map((f) => {
      const resources = resourceOf(f);
      return {
        schoolId: f.school_id,
        schoolName: f.school_name,
        enrollment: f.enrollment,
        resources,
        // No resources means infinitely many learners per unit: the least
        // favored school there can be, so it sorts last.
        ratio: resources > 0 ? f.enrollment / resources : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => a.ratio - b.ratio);

  const totalEnrollment = scored.reduce((sum, r) => sum + r.enrollment, 0);
  const totalResources = scored.reduce((sum, r) => sum + r.resources, 0);

  let cumulativeEnrollment = 0;
  let cumulativeResources = 0;
  const rows: KpiIqrRow[] = scored.map((r) => {
    cumulativeEnrollment += r.enrollment;
    cumulativeResources += r.resources;
    return {
      ...r,
      cumulativeEnrollment,
      cumulativeEnrollmentPercent:
        totalEnrollment > 0 ? (cumulativeEnrollment / totalEnrollment) * 100 : 0,
      cumulativeResources,
    };
  });

  const eligible = rows.length >= KPI_IQR_MIN_SCHOOLS && totalResources > 0;

  /** Resources accumulated at the exact percentile of the learner distribution. */
  const resourcesAtPercentile = (target: number): number | null => {
    if (rows.length === 0 || totalEnrollment <= 0) return null;
    const index = rows.findIndex(
      (r) => r.cumulativeEnrollmentPercent >= target
    );
    if (index === -1) return totalResources;
    const row = rows[index];
    const below = index > 0 ? rows[index - 1] : null;
    const percentBelow = below ? below.cumulativeEnrollmentPercent : 0;
    const resourcesBelow = below ? below.cumulativeResources : 0;
    const span = row.cumulativeEnrollmentPercent - percentBelow;
    if (span <= 0) return resourcesBelow;
    const fraction = (target - percentBelow) / span;
    return resourcesBelow + fraction * row.resources;
  };

  const q1Resources = resourcesAtPercentile(25);
  const q3Resources = resourcesAtPercentile(75);
  const q4Resources =
    q3Resources === null ? null : Math.max(0, totalResources - q3Resources);

  return {
    rows,
    totalEnrollment,
    totalResources,
    q1Resources,
    q3Resources,
    q4Resources,
    iqr:
      eligible && q1Resources !== null && q4Resources !== null && q4Resources > 0
        ? q1Resources / q4Resources
        : null,
    eligible,
    schoolCount: rows.length,
  };
}

// ============================================================================
// FORMATTING
// ============================================================================

/** Percentage for display; "—" when the rate could not be computed. */
export function formatPercent(
  value: number | null | undefined,
  digits = 2
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(digits)}%`;
}

/** Plain number for display; "—" when unavailable. */
export function formatNumber(
  value: number | null | undefined,
  digits = 0
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * School year N − k in "YYYY-YYYY" form. Used for the previous-year and lagged
 * cohort fact tables the efficiency indicators need.
 */
export function shiftSchoolYear(schoolYear: string, years: number): string {
  const start = parseInt(schoolYear.split("-")[0], 10);
  if (Number.isNaN(start)) return schoolYear;
  return `${start - years}-${start - years + 1}`;
}
