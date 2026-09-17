// DepEd Senior High School taxonomy

export type ShsTrack = "academic" | "tvl" | "sports" | "arts_design";

export const SHS_TRACKS: { value: ShsTrack; label: string }[] = [
  { value: "academic", label: "Academic" },
  { value: "tvl", label: "TVL" },
  { value: "sports", label: "Sports" },
  { value: "arts_design", label: "Arts & Design" },
];

export interface ShsStrand {
  track: ShsTrack;
  code: string;
  label: string;
}

export const SHS_STRANDS: ShsStrand[] = [
  // Academic
  { track: "academic", code: "stem", label: "STEM" },
  { track: "academic", code: "abm", label: "ABM" },
  { track: "academic", code: "humss", label: "HUMSS" },
  { track: "academic", code: "gas", label: "GAS" },
  { track: "academic", code: "pbm", label: "Pre-Baccalaureate Maritime" },
  // TVL
  { track: "tvl", code: "tvl_he", label: "TVL – Home Economics" },
  { track: "tvl", code: "tvl_ict", label: "TVL – ICT" },
  { track: "tvl", code: "tvl_ia", label: "TVL – Industrial Arts" },
  { track: "tvl", code: "tvl_afa", label: "TVL – Agri-Fishery Arts" },
  { track: "tvl", code: "tvl_maritime", label: "TVL – Maritime" },
  // Sports
  { track: "sports", code: "sports", label: "Sports" },
  // Arts & Design
  { track: "arts_design", code: "arts_design", label: "Arts & Design" },
];

/**
 * Senior High is Grades 11-12. Strand, specialization and every other SHS
 * field is meaningful only here — migration 145 enforces the same rule in a
 * CHECK on sms_sections.
 */
export const isShsGrade = (gradeLevel: number | null | undefined): boolean =>
  gradeLevel === 11 || gradeLevel === 12;

export const getStrandLabel = (code: string): string =>
  SHS_STRANDS.find((s) => s.code === code)?.label ?? code;

export const getTrackLabel = (value: ShsTrack | string): string =>
  SHS_TRACKS.find((t) => t.value === value)?.label ?? value;

export const getTrackForStrand = (code: string): ShsTrack | undefined =>
  SHS_STRANDS.find((s) => s.code === code)?.track;

// Common SHS specializations under each strand (guidance only — schools may
// enter custom specializations since TVL specializations are legion).
export const SHS_SPECIALIZATION_SUGGESTIONS: Record<string, string[]> = {
  stem: [],
  abm: [],
  humss: [],
  gas: [],
  tvl_he: [
    "Cookery",
    "Bread and Pastry Production",
    "Food and Beverage Services",
    "Housekeeping",
    "Tourism Promotion Services",
    "Caregiving",
    "Beauty / Nail Care",
    "Dressmaking",
    "Tailoring",
  ],
  tvl_ict: [
    "Computer Systems Servicing",
    "Computer Programming",
    "Animation",
    "Contact Center Services",
  ],
  tvl_ia: [
    "Automotive Servicing",
    "Carpentry",
    "Electrical Installation & Maintenance",
    "Masonry",
    "Plumbing",
    "Shielded Metal Arc Welding",
    "Refrigeration and Air-Conditioning Servicing",
  ],
  tvl_afa: [
    "Agricultural Crops Production",
    "Animal Production",
    "Organic Agriculture Production",
    "Aquaculture",
    "Fish Capture",
    "Fish Processing",
  ],
  tvl_maritime: [
    "Ship's Catering Services",
    "Maritime Seafaring",
  ],
  sports: ["Sports"],
  arts_design: ["Visual Arts", "Performing Arts", "Media Arts"],
  pbm: [],
};

// ============================================================================
// CURRICULUM (migration 189)
// ============================================================================

/**
 * Which Senior High curriculum a section runs.
 *
 * `old` is the DO 8, s.2015 programme: **semestral**, two semesters of two
 * quarters each, with a different set of subjects offered per semester.
 * `strengthened` is the MATATAG Senior High programme, which grades on the
 * same three terms as the updated K-10 class record (migration 173) and is
 * what `getGradingPeriods()` assumes for every school year from 2026-2027.
 *
 * The two coexist for one school year: the strengthened programme reaches
 * Grade 11 in SY 2026-2027 and Grade 12 only in SY 2027-2028, so a Grade 12
 * learner in 2026-2027 finishes the curriculum they started Grade 11 on.
 *
 * **Stored on the section, never re-derived from the school year** — the
 * invariant 14 rule that `grading_scheme` (173) and `career_stage` (121)
 * already follow. A card printed for a semester, a class record already posted
 * and a transmutation already applied have to keep resolving the way they did
 * when they were signed; a cohort table consulted at print time would silently
 * rewrite them the year the rollout moves on.
 */
export type ShsCurriculum = "old" | "strengthened";

export const SHS_CURRICULUM_LABELS: Record<ShsCurriculum, string> = {
  old: "Old SHS Curriculum",
  strengthened: "Strengthened SHS Curriculum",
};

export const SHS_CURRICULUM_NOTES: Record<ShsCurriculum, string> = {
  old: "Semestral — two semesters of two quarters each, subjects offered per semester. DO 8, s.2015 transmutation and descriptors.",
  strengthened: "MATATAG — three terms across the year, updated transmutation table and descriptors.",
};

/**
 * The school year the strengthened programme reaches each SHS grade level.
 * A grade level is on the old curriculum for every school year before its
 * entry here. Used to SUGGEST a curriculum when a section is created — never
 * to resolve one that is already stored.
 */
export const STRENGTHENED_SHS_START_SY: Record<number, string> = {
  11: "2026-2027",
  12: "2027-2028",
};

/**
 * The curriculum a new SHS section most likely runs, from its grade level and
 * school year — a suggestion the registrar can override at creation, exactly
 * as `suggestCareerStage()` suggests a career stage (migration 121). NULL for
 * a grade level that is not Senior High.
 */
export function suggestShsCurriculum(
  gradeLevel: number | null | undefined,
  schoolYear: string
): ShsCurriculum | null {
  if (!isShsGrade(gradeLevel) || !schoolYear) return null;
  const start = STRENGTHENED_SHS_START_SY[gradeLevel as number];
  // "YYYY-YYYY" school years compare correctly as strings.
  return start && schoolYear >= start ? "strengthened" : "old";
}

/**
 * True only when the section is TAGGED as old-curriculum Senior High.
 *
 * An untagged section (NULL — every K-10 section, and any SHS section a
 * migration has not reached) answers false and keeps the behaviour it has
 * today. Nothing is inferred here on purpose: inferring is the bug this
 * column exists to stop.
 */
export function isOldShsCurriculum(
  shsCurriculum: string | null | undefined
): boolean {
  return shsCurriculum === "old";
}
