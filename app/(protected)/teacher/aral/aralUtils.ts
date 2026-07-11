/**
 * ARAL candidate engine.
 *
 * Reads the diagnostic RESULTS already recorded by the Assessments module and
 * returns the learners in a section who fall in an ARAL program's target range.
 * Nothing is scored here — each assessment's stored level column is mapped to an
 * ARAL tier via the resolvers in lib/constants/aral.ts.
 *
 * All queries are scoped to a single section (the adviser's advisory), so the
 * grade level is implied by the section and no material join is needed.
 */
import {
  crlaTier,
  pabasaTier,
  philiriReadingTier,
  philiriScienceEligible,
  readingSourceForGrade,
  rmaScienceEligible,
  rmaTier,
  suggestedStartGrade,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import type { AralProgram, AralSourceAssessment, AralTier } from "@/types";

export interface AralCandidate {
  student_id: string;
  source_assessment: AralSourceAssessment;
  source_level: string;
  tier: AralTier;
  suggested_start_grade: number | null;
}

/** Merge candidate lists, keeping the higher (priority) tier on collisions. */
function mergeCandidates(lists: AralCandidate[][]): AralCandidate[] {
  const byStudent = new Map<string, AralCandidate>();
  for (const list of lists) {
    for (const c of list) {
      const existing = byStudent.get(c.student_id);
      if (!existing || (existing.tier === "secondary" && c.tier === "priority")) {
        byStudent.set(c.student_id, c);
      }
    }
  }
  return Array.from(byStudent.values());
}

async function fetchReadingCandidates(
  sectionId: string,
  schoolYear: string,
  phase: string,
  grade: number,
): Promise<AralCandidate[]> {
  const source = readingSourceForGrade(grade);

  if (source === "crla") {
    const { data } = await supabase
      .from("sms_crla_records")
      .select("student_id, profile_label")
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .eq("phase", phase);
    return (data || []).flatMap((r) => {
      const level = r.profile_label as string | null;
      const tier = crlaTier(level);
      if (!tier) return [];
      return [
        {
          student_id: String(r.student_id),
          source_assessment: "crla" as const,
          source_level: level ?? "",
          tier,
          suggested_start_grade: suggestedStartGrade("crla", level, grade),
        },
      ];
    });
  }

  if (source === "philiri") {
    const { data } = await supabase
      .from("sms_philiri_records")
      .select("student_id, screening_result, total_score")
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .eq("phase", phase)
      .eq("form_type", "screening");
    return (data || []).flatMap((r) => {
      const level = r.screening_result as string | null;
      const tier = philiriReadingTier(level);
      if (!tier) return [];
      return [
        {
          student_id: String(r.student_id),
          source_assessment: "philiri" as const,
          source_level: level ?? "",
          tier,
          suggested_start_grade: suggestedStartGrade(
            "philiri",
            level,
            grade,
            r.total_score as number | null,
          ),
        },
      ];
    });
  }

  // PABASA (Grades 11-12): a learner is tested in both languages; eligible if
  // Average in either. Dedup by student.
  const { data } = await supabase
    .from("sms_pabasa_records")
    .select("student_id, reading_level")
    .eq("section_id", sectionId)
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
      source_assessment: "pabasa",
      source_level: (r.reading_level as string) ?? "",
      tier,
      suggested_start_grade: null,
    });
  });
  return out;
}

async function fetchMathCandidates(
  sectionId: string,
  schoolYear: string,
  phase: string,
): Promise<AralCandidate[]> {
  const { data } = await supabase
    .from("sms_rma_records")
    .select("student_id, mastery_label")
    .eq("section_id", sectionId)
    .eq("school_year", schoolYear)
    .eq("phase", phase);
  return (data || []).flatMap((r) => {
    const tier = rmaTier(r.mastery_label as string | null);
    if (!tier) return [];
    return [
      {
        student_id: String(r.student_id),
        source_assessment: "rma" as const,
        source_level: (r.mastery_label as string) ?? "",
        tier,
        suggested_start_grade: null,
      },
    ];
  });
}

async function fetchScienceCandidates(
  sectionId: string,
  schoolYear: string,
  phase: string,
): Promise<AralCandidate[]> {
  // Cross-tab: learners at Frustration (Phil-IRI screening) AND Intervention (RMA).
  const [{ data: philiri }, { data: rma }] = await Promise.all([
    supabase
      .from("sms_philiri_records")
      .select("student_id, screening_result")
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .eq("phase", phase)
      .eq("form_type", "screening"),
    supabase
      .from("sms_rma_records")
      .select("student_id, mastery_label")
      .eq("section_id", sectionId)
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
        source_assessment: "cross_tab",
        source_level: "Frustration (Phil-IRI) + Intervention (RMA)",
        tier: "priority",
        suggested_start_grade: null,
      });
    }
  });
  return out;
}

/**
 * Eligible learners for a program in one section. `phase` is the basis phase
 * (BoSY / MoSY / EoSY). The Summer program always reads the End-of-SY (EoSY)
 * results and unions the Reading + Math target ranges.
 */
export async function fetchCandidates(
  program: AralProgram,
  sectionId: string,
  schoolYear: string,
  phase: string,
  grade: number,
): Promise<AralCandidate[]> {
  switch (program) {
    case "reading":
      return fetchReadingCandidates(sectionId, schoolYear, phase, grade);
    case "mathematics":
      return fetchMathCandidates(sectionId, schoolYear, phase);
    case "science":
      return fetchScienceCandidates(sectionId, schoolYear, phase);
    case "summer": {
      const [reading, math] = await Promise.all([
        fetchReadingCandidates(sectionId, schoolYear, "EoSY", grade),
        fetchMathCandidates(sectionId, schoolYear, "EoSY"),
      ]);
      return mergeCandidates([reading, math]);
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
