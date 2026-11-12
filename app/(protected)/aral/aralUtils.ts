/**
 * ARAL candidate engine.
 *
 * Reads the diagnostic RESULTS already recorded by the Assessments module and
 * returns the learners in a set of sections who fall in an ARAL program's target
 * range. Nothing is scored here — each assessment's stored level column is mapped
 * to an ARAL tier via the resolvers in lib/constants/aral.ts.
 *
 * Queries are scoped to the sections of a single grade level (all passed section
 * ids share the same grade), so the grade level is a single number and no
 * material join is needed. Each candidate carries the section_id of the record it
 * came from, so an enrollment can be recorded under the learner's own section.
 *
 * Every fetcher reads one row per assessment RECORD, and a learner has one
 * record per material (grade + language + set) — so the lists are collapsed to
 * one row per learner by dedupeCandidates before they leave fetchCandidates.
 */
import {
  crlaTier,
  deriveFinalProfile,
  pabasaTier,
  philiriFinalProfileTier,
  philiriReadingTier,
  philiriScienceEligible,
  readingSourceForGrade,
  rmaScienceEligible,
  rmaTier,
  suggestedStartGrade,
  type PhilIriFinalProfile,
  type PhilIriLevel,
  type PhilIriPassageRead,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import type { AralProgram, AralSourceAssessment, AralTier } from "@/types";

export interface AralCandidate {
  student_id: string;
  section_id: string;
  source_assessment: AralSourceAssessment;
  source_level: string;
  tier: AralTier;
  suggested_start_grade: number | null;
}

/**
 * Collapse candidate lists to ONE row per learner, keeping the most severe
 * result.
 *
 * A learner legitimately holds several assessment records per phase / school
 * year, because every records table is keyed per MATERIAL and a material is one
 * grade level + LANGUAGE + set: CRLA (English / Filipino / Mother Tongue, 083),
 * Phil-IRI (English / Filipino, 084/090) and RMA (085) all behave this way. A
 * learner screened in both languages therefore produces two rows, and the table
 * showed them as two learners — with a different tier and suggested start each,
 * since the resolvers ran per record. Worse, `sms_aral_enrollments` is
 * `UNIQUE (student_id, program, school_year)` (097), so enrolling a selection
 * containing a repeat failed the whole insert and nobody was enrolled.
 *
 * Severity order: `priority` outranks `secondary`; on a tie the LOWER
 * suggested-start grade wins (the deeper gap is the one the intervention has to
 * close). A null start grade carries no information and loses to a known one.
 */
function isMoreSevere(c: AralCandidate, existing: AralCandidate): boolean {
  if (c.tier !== existing.tier) return c.tier === "priority";
  const a = c.suggested_start_grade;
  const b = existing.suggested_start_grade;
  if (a == null) return false;
  if (b == null) return true;
  return a < b;
}

function dedupeCandidates(...lists: AralCandidate[][]): AralCandidate[] {
  const byStudent = new Map<string, AralCandidate>();
  for (const list of lists) {
    for (const c of list) {
      const existing = byStudent.get(c.student_id);
      if (!existing || isMoreSevere(c, existing)) {
        byStudent.set(c.student_id, c);
      }
    }
  }
  return Array.from(byStudent.values());
}

/** One GST screening record, with the language of the material it was taken on. */
export interface PhiliriScreeningRow {
  student_id: string;
  section_id: string;
  language: string;
  screening_result: string | null;
  total_score: number | null;
}

/** One individual (oral-reading) passage read, with its material's grade + language. */
export interface PhiliriIndividualRead {
  student_id: string;
  language: string;
  grade: number;
  overall_reading_level: PhilIriLevel | null;
}

const profileKey = (studentId: string, language: string) =>
  `${studentId}|${language}`;

/**
 * Phil-IRI Reading candidates from GST screening + individual reads. Pure.
 *
 * Each language is its own ladder. A learner tested in both English and
 * Filipino has two screening rows and two independent sets of passage reads, and
 * the individual test refines only the screening result IN THE SAME LANGUAGE.
 * Pooling the reads (as this did before) took the highest grade read in EITHER
 * language as the frontier: a learner frustrating at Grade 4 in English but
 * reading Grade 6 in Filipino came out "Grade 6 — Independent" and was dropped
 * from ARAL altogether. Per language, the English row stays a candidate and
 * dedupeCandidates keeps the more severe of the two.
 */
export function philiriReadingCandidates(
  screening: PhiliriScreeningRow[],
  reads: PhiliriIndividualRead[],
  grade: number,
): AralCandidate[] {
  const readsByKey = new Map<string, PhilIriPassageRead[]>();
  reads.forEach((r) => {
    const key = profileKey(r.student_id, r.language);
    const list = readsByKey.get(key) ?? [];
    list.push({ grade: r.grade, overallLevel: r.overall_reading_level });
    readsByKey.set(key, list);
  });
  const profiles = new Map<string, PhilIriFinalProfile>();
  readsByKey.forEach((list, key) => profiles.set(key, deriveFinalProfile(list)));

  return screening.flatMap((r) => {
    const level = r.screening_result;
    const gstTier = philiriReadingTier(level);
    if (!gstTier) return []; // not flagged by the GST → not a candidate

    const profile = profiles.get(profileKey(r.student_id, r.language));
    if (profile && profile.profile !== null) {
      // Individual test recorded in this language → refine tier + suggested
      // start from the final profile; drop the row if they read at/above grade.
      const tier = philiriFinalProfileTier(profile, grade);
      if (!tier) return [];
      return [
        {
          student_id: r.student_id,
          section_id: r.section_id,
          source_assessment: "philiri" as const,
          source_level: profile.label,
          tier,
          suggested_start_grade: Math.max(1, profile.grade ?? grade),
        },
      ];
    }

    // No scored individual reads in this language → GST-based tier + start.
    return [
      {
        student_id: r.student_id,
        section_id: r.section_id,
        source_assessment: "philiri" as const,
        source_level: level ?? "",
        tier: gstTier,
        suggested_start_grade: suggestedStartGrade(
          "philiri",
          level,
          grade,
          r.total_score,
        ),
      },
    ];
  });
}

type MaterialJoin = { grade_level: number; language: string } | null;

async function fetchReadingCandidates(
  sectionIds: string[],
  schoolYear: string,
  phase: string,
  grade: number,
): Promise<AralCandidate[]> {
  const source = readingSourceForGrade(grade);

  if (source === "crla") {
    const { data } = await supabase
      .from("sms_crla_records")
      .select("student_id, profile_label, section_id")
      .in("section_id", sectionIds)
      .eq("school_year", schoolYear)
      .eq("phase", phase);
    return (data || []).flatMap((r) => {
      const level = r.profile_label as string | null;
      const tier = crlaTier(level);
      if (!tier) return [];
      return [
        {
          student_id: String(r.student_id),
          section_id: String(r.section_id),
          source_assessment: "crla" as const,
          source_level: level ?? "",
          tier,
          suggested_start_grade: suggestedStartGrade("crla", level, grade),
        },
      ];
    });
  }

  if (source === "philiri") {
    // GST screening gates who is a candidate; the individual oral-reading ladder
    // (form_type='individual'), when recorded, refines the tier and suggested
    // start of the screening row in the SAME language (philiriReadingCandidates).
    const [{ data: screening }, { data: individual }] = await Promise.all([
      supabase
        .from("sms_philiri_records")
        .select(
          "student_id, screening_result, total_score, section_id, material:sms_philiri_materials!inner(language)",
        )
        .in("section_id", sectionIds)
        .eq("school_year", schoolYear)
        .eq("phase", phase)
        .eq("form_type", "screening"),
      supabase
        .from("sms_philiri_records")
        .select(
          "student_id, overall_reading_level, material:sms_philiri_materials!inner(grade_level, language)",
        )
        .in("section_id", sectionIds)
        .eq("school_year", schoolYear)
        .eq("phase", phase)
        .eq("form_type", "individual"),
    ]);

    const screeningRows: PhiliriScreeningRow[] = (screening || []).flatMap((r) => {
      const mat = r.material as unknown as MaterialJoin;
      if (!mat) return [];
      return [
        {
          student_id: String(r.student_id),
          section_id: String(r.section_id),
          language: mat.language,
          screening_result: (r.screening_result as string | null) ?? null,
          total_score: r.total_score === null ? null : Number(r.total_score),
        },
      ];
    });
    const reads: PhiliriIndividualRead[] = (individual || []).flatMap((r) => {
      const mat = r.material as unknown as MaterialJoin;
      if (!mat) return [];
      return [
        {
          student_id: String(r.student_id),
          language: mat.language,
          grade: Number(mat.grade_level),
          overall_reading_level:
            (r.overall_reading_level as PhilIriLevel | null) ?? null,
        },
      ];
    });
    return philiriReadingCandidates(screeningRows, reads, grade);
  }

  // PABASA (Grades 11-12): a learner is tested in both languages; eligible if
  // Average in either. Dedup by student.
  const { data } = await supabase
    .from("sms_pabasa_records")
    .select("student_id, reading_level, section_id")
    .in("section_id", sectionIds)
    .eq("school_year", schoolYear)
    .eq("phase", phase);
  const seen = new Set<string>();
  const out: AralCandidate[] = [];
  (data || []).forEach((r) => {
    const tier = pabasaTier(r.reading_level as string | null);
    const sid = String(r.student_id);
    if (!tier || seen.has(sid)) return;
    seen.add(sid);
    out.push({
      student_id: sid,
      section_id: String(r.section_id),
      source_assessment: "pabasa",
      source_level: (r.reading_level as string) ?? "",
      tier,
      suggested_start_grade: suggestedStartGrade("pabasa", null, grade),
    });
  });
  return out;
}

async function fetchMathCandidates(
  sectionIds: string[],
  schoolYear: string,
  phase: string,
  grade: number,
): Promise<AralCandidate[]> {
  const { data } = await supabase
    .from("sms_rma_records")
    .select("student_id, mastery_label, section_id")
    .in("section_id", sectionIds)
    .eq("school_year", schoolYear)
    .eq("phase", phase);
  return (data || []).flatMap((r) => {
    const tier = rmaTier(r.mastery_label as string | null);
    if (!tier) return [];
    return [
      {
        student_id: String(r.student_id),
        section_id: String(r.section_id),
        source_assessment: "rma" as const,
        source_level: (r.mastery_label as string) ?? "",
        tier,
        suggested_start_grade: suggestedStartGrade("rma", null, grade),
      },
    ];
  });
}

async function fetchScienceCandidates(
  sectionIds: string[],
  schoolYear: string,
  phase: string,
  grade: number,
): Promise<AralCandidate[]> {
  // Cross-tab: learners at Frustration (Phil-IRI screening) AND Intervention (RMA).
  const [{ data: philiri }, { data: rma }] = await Promise.all([
    supabase
      .from("sms_philiri_records")
      .select("student_id, screening_result")
      .in("section_id", sectionIds)
      .eq("school_year", schoolYear)
      .eq("phase", phase)
      .eq("form_type", "screening"),
    supabase
      .from("sms_rma_records")
      .select("student_id, mastery_label, section_id")
      .in("section_id", sectionIds)
      .eq("school_year", schoolYear)
      .eq("phase", phase),
  ]);

  const philiriSet = new Set(
    (philiri || [])
      .filter((r) => philiriScienceEligible(r.screening_result as string | null))
      .map((r) => String(r.student_id)),
  );
  const out: AralCandidate[] = [];
  const seen = new Set<string>();
  (rma || []).forEach((r) => {
    const sid = String(r.student_id);
    if (
      rmaScienceEligible(r.mastery_label as string | null) &&
      philiriSet.has(sid) &&
      !seen.has(sid)
    ) {
      seen.add(sid);
      out.push({
        student_id: sid,
        section_id: String(r.section_id),
        source_assessment: "cross_tab",
        source_level: "Frustration (Phil-IRI) + Intervention (RMA)",
        tier: "priority",
        suggested_start_grade: suggestedStartGrade("cross_tab", null, grade),
      });
    }
  });
  return out;
}

/**
 * Eligible learners for a program across the sections of one grade level.
 * `phase` is the basis phase (BoSY / MoSY / EoSY). The Summer program always
 * reads the End-of-SY (EoSY) results and unions the Reading + Math target ranges.
 */
export async function fetchCandidates(
  program: AralProgram,
  sectionIds: string[],
  schoolYear: string,
  phase: string,
  grade: number,
): Promise<AralCandidate[]> {
  if (sectionIds.length === 0) return [];
  // Every branch is deduped here rather than inside each fetcher: a learner is
  // one candidate however many materials/languages they were assessed in.
  switch (program) {
    case "reading":
      return dedupeCandidates(
        await fetchReadingCandidates(sectionIds, schoolYear, phase, grade),
      );
    case "mathematics":
      return dedupeCandidates(
        await fetchMathCandidates(sectionIds, schoolYear, phase, grade),
      );
    case "science":
      return dedupeCandidates(
        await fetchScienceCandidates(sectionIds, schoolYear, phase, grade),
      );
    case "summer": {
      const [reading, math] = await Promise.all([
        fetchReadingCandidates(sectionIds, schoolYear, "EoSY", grade),
        fetchMathCandidates(sectionIds, schoolYear, "EoSY", grade),
      ]);
      return dedupeCandidates(reading, math);
    }
    default:
      return [];
  }
}

/** Student IDs already enrolled in this program for the school year (to exclude). */
export async function fetchEnrolledStudentIds(
  program: AralProgram,
  schoolYear: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("sms_aral_enrollments")
    .select("student_id")
    .eq("program", program)
    .eq("school_year", schoolYear);
  return new Set((data || []).map((r) => String(r.student_id)));
}
