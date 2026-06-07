import { GpaThresholds, sectionTypeMatchesGpa } from "./gpaThresholds";
import { SectionType } from "@/types";

// ---------------------------------------------------------------------------
// Data Structures
// ---------------------------------------------------------------------------

/** GPA distribution counts within a section */
export interface GpaDistribution {
  high: number;
  mid: number;
  low: number;
  unknown: number;
}

/** A section candidate with optional gender/GPA enrichment */
export interface SectionCandidate {
  id: string;
  name: string;
  sectionType: SectionType | null;
  maxStudents: number | null;
  enrolledCount: number;
  /** Number of male students currently enrolled */
  maleCount?: number;
  /** Number of female students currently enrolled */
  femaleCount?: number;
  /** GPA bucket distribution of currently enrolled students */
  gpaDistribution?: GpaDistribution;
}

/** Student data passed into the algorithm */
export interface StudentInput {
  studentId: string;
  gpa: number | null;
  gender?: "male" | "female" | null;
  /**
   * The section type the student came from in the PREVIOUS grade. When present,
   * section fit is decided by carrying this type forward (Fast Learner → Fast
   * Learner, Crack → Crack, Heterogeneous → Heterogeneous) instead of by GPA.
   * Leave null/undefined for brand-new students, Kindergarten promotions, or
   * transferees with no accessible record — those fall back to GPA-based fit.
   */
  previousSectionType?: SectionType | null;
}

/** Weight configuration for scoring factors */
export interface ScoringWeights {
  sectionTypeMatch: number;
  genderBalance: number;
  gpaDistribution: number;
  capacityAvailability: number;
}

/** Full algorithm configuration */
export interface SectionAssignmentConfig {
  weights: ScoringWeights;
  genderBalanceTolerance: number;
  heterogeneousWeightOverrides?: Partial<ScoringWeights>;
  homogeneousWeightOverrides?: Partial<ScoringWeights>;
}

export const DEFAULT_ASSIGNMENT_CONFIG: SectionAssignmentConfig = {
  weights: {
    sectionTypeMatch: 0.4,
    genderBalance: 0.25,
    gpaDistribution: 0.2,
    capacityAvailability: 0.15,
  },
  genderBalanceTolerance: 0.1,
  heterogeneousWeightOverrides: {
    sectionTypeMatch: 0.3,
    genderBalance: 0.3,
    gpaDistribution: 0.25,
    capacityAvailability: 0.15,
  },
  homogeneousWeightOverrides: {
    sectionTypeMatch: 0.5,
    genderBalance: 0.15,
    gpaDistribution: 0.2,
    capacityAvailability: 0.15,
  },
};

/** Ranked section suggestion with score breakdown */
export interface SectionSuggestion {
  sectionId: string;
  sectionName: string;
  /**
   * Primary ranking key. 2 = ideal specialized match (high→Fast Learner,
   * low→Crack), 1 = general section (Heterogeneous/Random), 0 = non-fit
   * fallback. Ungraded students are tier 0 for specialized sections.
   */
  fitTier: 0 | 1 | 2;
  /** Projected enrolled count used for load balancing (fewest wins). */
  effectiveCount: number;
  /** Gender + GPA-mix composite, 0–1. Tie-breaker only, after fit + balance. */
  qualityScore: number;
  /** Backward-compatible alias of qualityScore. */
  score: number;
  breakdown: {
    sectionTypeMatch: number;
    genderBalance: number;
    gpaDistribution: number;
    capacityAvailability: number;
  };
}

export type GpaBucket = "high" | "mid" | "low" | "unknown";

// ---------------------------------------------------------------------------
// Scoring Helpers (pure functions)
// ---------------------------------------------------------------------------

/**
 * Classify a GPA value into a bucket based on thresholds.
 */
export function classifyGpaBucket(
  gpa: number | null | undefined,
  thresholds: GpaThresholds
): GpaBucket {
  if (gpa == null) return "unknown";
  if (gpa >= thresholds.homogeneous_fast_learner.minGpa) return "high";
  if (gpa < thresholds.homogeneous_crack_section.maxGpa) return "low";
  return "mid";
}

/**
 * Score: does the section type match the student's GPA?
 * Returns 1.0 for match, 0.0 for mismatch.
 */
export function scoreSectionTypeMatch(
  sectionType: SectionType | null | undefined,
  gpa: number | null,
  thresholds: GpaThresholds
): number {
  return sectionTypeMatchesGpa(sectionType, gpa, thresholds) ? 1.0 : 0.0;
}

/**
 * Score: how well does adding this student maintain gender balance?
 * Returns 0.0–1.0 where 1.0 = perfectly balanced after adding.
 */
export function scoreGenderBalance(
  maleCount: number | undefined,
  femaleCount: number | undefined,
  studentGender: "male" | "female" | null | undefined
): number {
  // If gender data is unavailable, return neutral score
  if (maleCount == null || femaleCount == null || !studentGender) return 0.5;

  const total = maleCount + femaleCount;

  // Empty section — any student is fine
  if (total === 0) return 1.0;

  const addMale = studentGender === "male" ? 1 : 0;
  const addFemale = studentGender === "female" ? 1 : 0;

  const afterMale = maleCount + addMale;
  const afterTotal = total + 1;
  const afterRatio = afterMale / afterTotal;

  // Map deviation from 0.5 to a 0–1 score
  // deviation range: [0, 0.5] → score range: [1.0, 0.0]
  const deviation = Math.abs(afterRatio - 0.5);
  return Math.max(0, 1.0 - deviation * 2);
}

/**
 * Score: how well does adding this student affect GPA distribution?
 *
 * Heterogeneous: aims for equal distribution across HIGH/MID/LOW.
 * Homogeneous: aims to cluster similar GPAs together.
 */
export function scoreGpaDistribution(
  distribution: GpaDistribution | undefined,
  studentBucket: GpaBucket,
  isHeterogeneous: boolean
): number {
  if (!distribution) return 0.5;
  if (studentBucket === "unknown") return 0.5;

  const { high, mid, low } = distribution;
  const total = high + mid + low;

  // Empty section or no classified students — neutral
  if (total === 0) return 0.75;

  if (isHeterogeneous) {
    // Goal: equal distribution (1/3 each). Compute normalized deviation AFTER adding student.
    const addHigh = studentBucket === "high" ? 1 : 0;
    const addMid = studentBucket === "mid" ? 1 : 0;
    const addLow = studentBucket === "low" ? 1 : 0;

    const newHigh = high + addHigh;
    const newMid = mid + addMid;
    const newLow = low + addLow;
    const newTotal = total + 1;

    const ideal = 1 / 3;
    const pH = newHigh / newTotal;
    const pM = newMid / newTotal;
    const pL = newLow / newTotal;

    // Root mean square deviation from ideal
    const rmsd = Math.sqrt(
      ((pH - ideal) ** 2 + (pM - ideal) ** 2 + (pL - ideal) ** 2) / 3
    );

    // Max possible RMSD occurs when all students are in one bucket:
    // proportions = [1, 0, 0], rmsd = sqrt(((1-1/3)^2 + (0-1/3)^2 + (0-1/3)^2)/3) ≈ 0.3849
    const maxRmsd = Math.sqrt(
      ((2 / 3) ** 2 + (1 / 3) ** 2 + (1 / 3) ** 2) / 3
    );

    return Math.max(0, 1.0 - rmsd / maxRmsd);
  } else {
    // Homogeneous: prefer sections where the dominant bucket matches the student's bucket
    const buckets = { high, mid, low };
    const dominant = (Object.keys(buckets) as Array<keyof typeof buckets>).reduce(
      (a, b) => (buckets[a] >= buckets[b] ? a : b)
    );

    return studentBucket === dominant ? 1.0 : 0.2;
  }
}

/**
 * Score: how much capacity remains? Emptier sections score higher.
 */
export function scoreCapacity(
  enrolledCount: number,
  maxStudents: number | null | undefined
): number {
  if (maxStudents == null || maxStudents <= 0) return 1.0;
  const fillRatio = enrolledCount / maxStudents;
  return Math.max(0, 1.0 - fillRatio);
}

/**
 * Determine whether a section type is considered "heterogeneous" for weight resolution.
 */
function isHeterogeneousType(sectionType: SectionType | null | undefined): boolean {
  return (
    !sectionType ||
    sectionType === "heterogeneous" ||
    sectionType === "homogeneous_random"
  );
}

/**
 * Resolve effective weights based on section type and config.
 */
export function resolveWeights(
  sectionType: SectionType | null | undefined,
  config: SectionAssignmentConfig
): ScoringWeights {
  const overrides = isHeterogeneousType(sectionType)
    ? config.heterogeneousWeightOverrides
    : config.homogeneousWeightOverrides;

  return { ...config.weights, ...overrides };
}

// ---------------------------------------------------------------------------
// Core Algorithm
// ---------------------------------------------------------------------------

/**
 * Classify how well a section's type fits a student — the PRIMARY ranking key.
 *
 *   2 = ideal specialized match — high-GPA student into a Fast Learner section,
 *       or low-GPA student into a Crack section.
 *   1 = a general section (Heterogeneous / Random / untyped). Accepts ANY
 *       student, including those with no GPA recorded yet.
 *   0 = a specialized section the student does NOT qualify for. Used only as a
 *       last-resort fallback when no tier-1/2 section is available.
 *
 * The critical rule: a student with no GPA (unknown bucket) is tier 0 for Fast
 * Learner / Crack sections, so ungraded students are never funneled into them —
 * they flow to general sections instead. This is the fix for the case where an
 * entire cohort with missing grades piled into a single Fast Learner section.
 */
export function sectionFitTier(
  sectionType: SectionType | null | undefined,
  gpa: number | null,
  thresholds: GpaThresholds
): 0 | 1 | 2 {
  const bucket = classifyGpaBucket(gpa, thresholds);
  switch (sectionType) {
    case "homogeneous_fast_learner":
      return bucket === "high" ? 2 : 0;
    case "homogeneous_crack_section":
      return bucket === "low" ? 2 : 0;
    case "heterogeneous":
    case "homogeneous_random":
    default:
      // General / untyped sections accept everyone.
      return 1;
  }
}

/**
 * Classify how well a section's type fits a student by carrying their PREVIOUS
 * section type forward — used on promotion so streaming persists across grades.
 *
 *   2 = exact match — target section type equals the previous section type
 *       (Fast Learner → Fast Learner, Crack → Crack, Heterogeneous →
 *       Heterogeneous, Random → Random).
 *   1 = a general section (Heterogeneous / Random / untyped). Universal fallback
 *       used when no exact-type section exists in the target grade.
 *   0 = a specialized section (Fast Learner / Crack) that does NOT match the
 *       previous type — avoided unless nothing else is available.
 *
 * This keeps a Grade 1 Fast Learner in a Grade 2 Fast Learner section, while a
 * student whose previous type has no counterpart next grade flows to a general
 * section instead of being mis-streamed by GPA.
 */
export function sectionFitTierByType(
  sectionType: SectionType | null | undefined,
  previousSectionType: SectionType | null | undefined
): 0 | 1 | 2 {
  if (previousSectionType && sectionType === previousSectionType) return 2;
  if (isHeterogeneousType(sectionType)) return 1;
  return 0;
}

/**
 * Suggest sections for a student, ranked best-first.
 *
 * Ranking priority (this order is what keeps sections evenly sized while still
 * honouring section types):
 *   1. Fit tier      — ideal specialized match > general > non-fit fallback
 *   2. Fewest students — the load-balancing driver; works even when a section
 *                        has no max size, so sizes stay even
 *   3. Quality score  — gender + GPA mix, used ONLY to break ties between
 *                        sections of equal tier and equal size
 *   4. Name           — deterministic final tie-break
 *
 * Returns all eligible (not full) sections. Callers take the top result.
 */
export function suggestSections(
  student: StudentInput,
  sections: SectionCandidate[],
  thresholds: GpaThresholds,
  config: SectionAssignmentConfig = DEFAULT_ASSIGNMENT_CONFIG,
  overrides?: {
    counts?: Map<string, number>;
    gender?: Map<string, { male: number; female: number }>;
    gpa?: Map<string, GpaDistribution>;
  }
): SectionSuggestion[] {
  const studentBucket = classifyGpaBucket(student.gpa, thresholds);

  // When the student has a previous section type, fit is decided by carrying
  // that type forward (promotion streaming) rather than by GPA. In this mode we
  // also balance GPA EVENLY across the same-type sections — so the strongest
  // students are spread out instead of clustered in one section.
  const useTypeBased = student.previousSectionType != null;

  const suggestions: SectionSuggestion[] = [];

  for (const section of sections) {
    // Resolve effective counts (for batch tracking)
    const effectiveCount =
      overrides?.counts?.get(section.id) ?? section.enrolledCount;
    const effectiveGender = overrides?.gender?.get(section.id);
    const effectiveGpa = overrides?.gpa?.get(section.id);

    const maleCount = effectiveGender?.male ?? section.maleCount;
    const femaleCount = effectiveGender?.female ?? section.femaleCount;
    const gpaDist = effectiveGpa ?? section.gpaDistribution;

    // Filter: skip full sections
    if (section.maxStudents != null && effectiveCount >= section.maxStudents) {
      continue;
    }

    const fitTier = useTypeBased
      ? sectionFitTierByType(section.sectionType, student.previousSectionType)
      : sectionFitTier(section.sectionType, student.gpa, thresholds);

    // Individual factor scores (kept for the breakdown / UI explanation).
    const f1 = scoreSectionTypeMatch(section.sectionType, student.gpa, thresholds);
    const f2 = scoreGenderBalance(maleCount, femaleCount, student.gender);
    const hetero = isHeterogeneousType(section.sectionType);
    // In type-based mode, always aim for an even GPA spread (treat like
    // heterogeneous) so high-GPA students don't pile into one same-type section.
    const f3 = scoreGpaDistribution(gpaDist, studentBucket, useTypeBased || hetero);
    const f4 = scoreCapacity(effectiveCount, section.maxStudents);

    // Quality = gender + GPA mix only, normalised to 0–1. This is now purely a
    // tie-breaker (after fit tier and load balancing); section-type fit and
    // capacity are expressed through the tier and the fewest-students key.
    const w = resolveWeights(section.sectionType, config);
    const qualityDenom = w.genderBalance + w.gpaDistribution || 1;
    const qualityScore =
      (w.genderBalance * f2 + w.gpaDistribution * f3) / qualityDenom;

    suggestions.push({
      sectionId: section.id,
      sectionName: section.name,
      fitTier,
      effectiveCount,
      qualityScore,
      score: qualityScore,
      breakdown: {
        sectionTypeMatch: f1,
        genderBalance: f2,
        gpaDistribution: f3,
        capacityAvailability: f4,
      },
    });
  }

  // Rank: fit tier desc → fewest students asc → quality desc → name asc.
  suggestions.sort((a, b) => {
    if (b.fitTier !== a.fitTier) return b.fitTier - a.fitTier;
    if (a.effectiveCount !== b.effectiveCount)
      return a.effectiveCount - b.effectiveCount;
    if (b.qualityScore !== a.qualityScore)
      return b.qualityScore - a.qualityScore;
    return a.sectionName.localeCompare(b.sectionName);
  });

  return suggestions;
}

// ---------------------------------------------------------------------------
// Convenience Wrappers (backward compatible)
// ---------------------------------------------------------------------------

/**
 * Auto-assigns a section for a student based on GPA, gender balance,
 * and GPA distribution scoring.
 *
 * Returns the best section ID or null if no section is available.
 *
 * Backward compatible: calling with just (gpa, sections, thresholds) still works.
 */
export function autoAssignSection(
  gpa: number | null,
  sections: SectionCandidate[],
  thresholds: GpaThresholds,
  countOverrides?: Map<string, number>,
  gender?: "male" | "female" | null,
  config?: SectionAssignmentConfig,
  genderOverrides?: Map<string, { male: number; female: number }>,
  gpaOverrides?: Map<string, GpaDistribution>
): string | null {
  const student: StudentInput = {
    studentId: "__single__",
    gpa,
    gender: gender ?? null,
  };

  const suggestions = suggestSections(
    student,
    sections,
    thresholds,
    config ?? DEFAULT_ASSIGNMENT_CONFIG,
    {
      counts: countOverrides,
      gender: genderOverrides,
      gpa: gpaOverrides,
    }
  );

  return suggestions.length > 0 ? suggestions[0].sectionId : null;
}

/**
 * Batch auto-assign sections for multiple students.
 *
 * Maintains in-memory tracking of enrollment counts, gender counts,
 * and GPA distributions so each successive assignment reflects the
 * projected state of each section.
 */
export function batchAutoAssignSections(
  students: Array<StudentInput>,
  sections: SectionCandidate[],
  thresholds: GpaThresholds,
  config: SectionAssignmentConfig = DEFAULT_ASSIGNMENT_CONFIG
): Map<string, string> {
  const assignments = new Map<string, string>();

  // Initialize in-memory trackers from current section data
  const countOverrides = new Map<string, number>();
  const genderOverrides = new Map<string, { male: number; female: number }>();
  const gpaOverrides = new Map<string, GpaDistribution>();

  for (const s of sections) {
    countOverrides.set(s.id, s.enrolledCount);
    genderOverrides.set(s.id, {
      male: s.maleCount ?? 0,
      female: s.femaleCount ?? 0,
    });
    gpaOverrides.set(s.id, s.gpaDistribution ?? { high: 0, mid: 0, low: 0, unknown: 0 });
  }

  for (const student of students) {
    const suggestions = suggestSections(
      student,
      sections,
      thresholds,
      config,
      { counts: countOverrides, gender: genderOverrides, gpa: gpaOverrides }
    );

    if (suggestions.length === 0) continue;

    const sectionId = suggestions[0].sectionId;
    assignments.set(student.studentId, sectionId);

    // Update in-memory trackers
    countOverrides.set(sectionId, (countOverrides.get(sectionId) ?? 0) + 1);

    const gender = genderOverrides.get(sectionId) ?? { male: 0, female: 0 };
    if (student.gender === "male") gender.male++;
    else if (student.gender === "female") gender.female++;
    genderOverrides.set(sectionId, gender);

    const gpaDist = gpaOverrides.get(sectionId) ?? { high: 0, mid: 0, low: 0, unknown: 0 };
    const bucket = classifyGpaBucket(student.gpa, thresholds);
    gpaDist[bucket]++;
    gpaOverrides.set(sectionId, gpaDist);
  }

  return assignments;
}
