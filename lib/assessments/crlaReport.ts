/**
 * CRLA reporting roll-up — one row per learner combining Part 1 (Word Reading)
 * and Part 2 (Reading Fluency & Comprehension) into the shape the three DepEd
 * workbook printables need: Reading Scoresheet, Class Record, Class Summary.
 *
 * Everything except the reading time and the learner-experience rating is
 * derived here rather than stored:
 *   words read   = total words in the story - total miscues
 *   accuracy %   = words read / total words
 *   WPM          = words read * 60 / reading time
 *   reading profile = crlaReadingProfile(part 1 band, accuracy, comprehension)
 */

import {
  crlaReadingProfile,
  type CrlaReadingProfile,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { usableMaterialsFilter } from "@/lib/assessments/scope";
import type {
  CrlaBand,
  CrlaMaterial,
  CrlaMaterialTask,
  Student,
} from "@/types";
import {
  effectiveScores,
  hasAnyScore,
  profileForScore,
  totalScore,
  type CrlaScoreMap,
} from "@/app/(protected)/teacher/assessments/crla/crlaUtils";

/** Enrollment statuses that count a learner as on the section roster. */
const ROSTER_STATUSES = [
  "active",
  "promoted",
  "graduated",
  "retained",
  "completed",
];

export interface CrlaReportLearner {
  student: Student;
  dateAssessed: string | null;
  // Part 1 — Word Reading
  taskScores: Record<string, number | null>; // taskId -> effective score
  part1Total: number | null;
  part1Pct: number | null; // total / max total, 0-100
  part1Label: string | null; // Full / Moderate / Light Refresher | Grade Ready
  // Part 2 — Reading Fluency & Comprehension
  storyTitle: string | null;
  totalWords: number | null;
  miscues: number | null;
  wordsRead: number | null;
  readingTimeSeconds: number | null;
  wpm: number | null;
  accuracyPct: number | null; // % of correct words read, 0-100
  comprehensionCorrect: number | null;
  comprehensionTotal: number | null;
  comprehensionPct: number | null; // 0-100
  learnerExperience: number | null; // 1-5
  observationLevel: number | null; // 1-4
  readingProfile: CrlaReadingProfile | null;
  remarks: string | null;
}

export interface CrlaReportSection {
  id: string;
  name: string;
  gradeLevel: number;
  schoolId: string;
  /** Adviser name, for the Class Summary's Teacher column. */
  teacherName: string;
}

export interface CrlaReport {
  section: CrlaReportSection;
  material: CrlaMaterial | null;
  tasks: CrlaMaterialTask[];
  bands: CrlaBand[];
  maxTotal: number;
  learners: CrlaReportLearner[];
}

export interface BuildCrlaReportParams {
  section: CrlaReportSection;
  schoolYear: string;
  phase: string;
  language: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

interface Part2Row {
  id: number | string;
  student_id: number | string;
  record_form_id: number | string;
  date_assessed: string | null;
  total_miscues: number | null;
  comprehension_correct: number | null;
  comprehension_total: number | null;
  reading_time_seconds: number | null;
  learner_experience: number | null;
  observation_level: number | null;
  remarks: string | null;
}

/**
 * Assemble the per-learner report rows for one section / school year / phase /
 * language. Returns an empty learner list when the section has no roster.
 */
export async function buildCrlaReport(
  params: BuildCrlaReportParams,
): Promise<CrlaReport> {
  const { section, schoolYear, phase, language } = params;
  const schoolId = Number(section.schoolId);

  // ---- Roster -------------------------------------------------------------
  const { data: enrollments, error: enrollmentError } = await supabase
    .from("sms_enrollments")
    .select("student_id")
    .eq("section_id", Number(section.id))
    .eq("school_year", schoolYear)
    .eq("status", "approved")
    .in("enrollment_status", ROSTER_STATUSES);
  if (enrollmentError) throw enrollmentError;

  const studentIds = (enrollments || []).map((e) => Number(e.student_id));

  let students: Student[] = [];
  if (studentIds.length > 0) {
    const { data, error } = await supabase
      .from("sms_students")
      .select("*")
      .in("id", studentIds)
      .order("last_name")
      .order("first_name");
    if (error) throw error;
    students = (data || []) as Student[];
  }

  // ---- Part 1 material (same resolution as the scoresheet screen) ---------
  const { data: materials, error: materialError } = await supabase
    .from("sms_crla_materials")
    .select("*")
    .or(usableMaterialsFilter(schoolId))
    .eq("grade_level", section.gradeLevel)
    .eq("language", language)
    .eq("is_active", true);
  if (materialError) throw materialError;

  const candidates = (materials || []) as CrlaMaterial[];
  // A material naming this phase wins over an "any phase" one; a school's own
  // material wins over the division's.
  const material =
    candidates.find((m) => m.phases?.includes(phase) && m.school_id !== null) ??
    candidates.find((m) => m.phases?.includes(phase)) ??
    candidates.find((m) => m.school_id !== null) ??
    candidates[0] ??
    null;

  let tasks: CrlaMaterialTask[] = [];
  let bands: CrlaBand[] = [];
  if (material) {
    const [taskRes, bandRes] = await Promise.all([
      supabase
        .from("sms_crla_material_tasks")
        .select("*")
        .eq("material_id", material.id)
        .order("position"),
      supabase
        .from("sms_crla_bands")
        .select("*")
        .eq("material_id", material.id)
        .order("position"),
    ]);
    if (taskRes.error) throw taskRes.error;
    if (bandRes.error) throw bandRes.error;
    tasks = (taskRes.data || []) as CrlaMaterialTask[];
    bands = (bandRes.data || []) as CrlaBand[];
  }
  const maxTotal = tasks.reduce((sum, t) => sum + Number(t.max_score), 0);

  // ---- Part 1 scores ------------------------------------------------------
  const scoreMap: CrlaScoreMap = {};
  const part1Meta = new Map<
    string,
    { date_assessed: string | null; remarks: string | null }
  >();

  if (material && studentIds.length > 0) {
    const { data: records, error } = await supabase
      .from("sms_crla_records")
      .select("id, student_id, date_assessed, remarks")
      .eq("material_id", material.id)
      .eq("phase", phase)
      .eq("school_year", schoolYear)
      .in("student_id", studentIds);
    if (error) throw error;

    const byRecordId = new Map<string, string>(); // recordId -> studentId
    (records || []).forEach((r) => {
      const sid = String(r.student_id);
      byRecordId.set(String(r.id), sid);
      part1Meta.set(sid, {
        date_assessed: r.date_assessed,
        remarks: r.remarks ?? null,
      });
      scoreMap[sid] = {};
    });

    const recordIds = (records || []).map((r) => Number(r.id));
    if (recordIds.length > 0) {
      const { data: rawScores, error: scoreError } = await supabase
        .from("sms_crla_record_scores")
        .select("record_id, task_id, raw_score")
        .in("record_id", recordIds);
      if (scoreError) throw scoreError;

      (rawScores || []).forEach((s) => {
        const sid = byRecordId.get(String(s.record_id));
        if (!sid) return;
        (scoreMap[sid] ||= {})[String(s.task_id)] =
          s.raw_score === null ? null : Number(s.raw_score);
      });
    }
  }

  // ---- Part 2 record forms ------------------------------------------------
  // A grade + language may have several stories; a learner reads one. Pull the
  // section's forms, then keep each learner's most recently assessed record.
  const { data: formRows, error: formError } = await supabase
    .from("sms_crla_record_forms")
    .select("id, story_title, title")
    .or(usableMaterialsFilter(schoolId))
    .eq("grade_level", section.gradeLevel)
    .eq("language", language)
    .eq("is_active", true);
  if (formError) throw formError;

  const forms = formRows || [];
  const formIds = forms.map((f) => Number(f.id));
  const formTitle = new Map<string, string>();
  forms.forEach((f) => {
    formTitle.set(
      String(f.id),
      (f.story_title as string | null) || (f.title as string),
    );
  });

  const part2 = new Map<string, Part2Row>();
  const formWords = new Map<string, number>();

  if (formIds.length > 0 && studentIds.length > 0) {
    const [recordRes, lineRes] = await Promise.all([
      supabase
        .from("sms_crla_record_form_records")
        .select(
          "id, student_id, record_form_id, date_assessed, total_miscues, comprehension_correct, comprehension_total, reading_time_seconds, learner_experience, observation_level, remarks",
        )
        .in("record_form_id", formIds)
        .eq("phase", phase)
        .eq("school_year", schoolYear)
        .in("student_id", studentIds),
      supabase
        .from("sms_crla_record_form_lines")
        .select("record_form_id, word_count")
        .in("record_form_id", formIds),
    ]);
    if (recordRes.error) throw recordRes.error;
    if (lineRes.error) throw lineRes.error;

    (lineRes.data || []).forEach((l) => {
      const key = String(l.record_form_id);
      formWords.set(key, (formWords.get(key) ?? 0) + (Number(l.word_count) || 0));
    });

    (recordRes.data as unknown as Part2Row[]).forEach((r) => {
      const sid = String(r.student_id);
      const prev = part2.get(sid);
      // Keep the latest read: newest date_assessed, falling back to the newest row.
      if (
        !prev ||
        (r.date_assessed ?? "") > (prev.date_assessed ?? "") ||
        ((r.date_assessed ?? "") === (prev.date_assessed ?? "") &&
          Number(r.id) > Number(prev.id))
      ) {
        part2.set(sid, r);
      }
    });
  }

  // ---- Compose ------------------------------------------------------------
  const learners: CrlaReportLearner[] = students.map((student) => {
    const raw = scoreMap[student.id] ?? {};
    const scored = hasAnyScore(tasks, raw);
    const effective = effectiveScores(tasks, raw);
    const part1Total = scored ? totalScore(tasks, effective) : null;
    const part1Label =
      part1Total === null ? null : profileForScore(bands, part1Total);
    const part1Pct =
      part1Total === null || maxTotal <= 0
        ? null
        : round2((part1Total / maxTotal) * 100);

    const p2 = part2.get(student.id) ?? null;
    const totalWords = p2 ? (formWords.get(String(p2.record_form_id)) ?? 0) : null;
    const miscues = p2?.total_miscues === null || p2 === null
      ? null
      : Number(p2.total_miscues);
    const wordsRead =
      totalWords === null || totalWords <= 0 || miscues === null
        ? null
        : Math.max(0, totalWords - miscues);
    const accuracyPct =
      wordsRead === null || totalWords === null || totalWords <= 0
        ? null
        : round2((wordsRead / totalWords) * 100);
    const readingTimeSeconds = p2?.reading_time_seconds ?? null;
    const wpm =
      wordsRead === null || !readingTimeSeconds || readingTimeSeconds <= 0
        ? null
        : Math.round((wordsRead * 60) / readingTimeSeconds);

    const comprehensionCorrect = p2?.comprehension_correct ?? null;
    const comprehensionTotal = p2?.comprehension_total ?? null;
    const comprehensionPct =
      comprehensionCorrect === null ||
      comprehensionTotal === null ||
      comprehensionTotal <= 0
        ? null
        : round2((comprehensionCorrect / comprehensionTotal) * 100);

    const meta = part1Meta.get(student.id);

    return {
      student,
      dateAssessed: p2?.date_assessed ?? meta?.date_assessed ?? null,
      taskScores: effective,
      part1Total,
      part1Pct,
      part1Label,
      storyTitle: p2 ? (formTitle.get(String(p2.record_form_id)) ?? null) : null,
      totalWords,
      miscues,
      wordsRead,
      readingTimeSeconds,
      wpm,
      accuracyPct,
      comprehensionCorrect,
      comprehensionTotal,
      comprehensionPct,
      learnerExperience: p2?.learner_experience ?? null,
      observationLevel: p2?.observation_level ?? null,
      readingProfile: crlaReadingProfile({
        part1Label,
        accuracyPct,
        comprehensionCorrect,
      }),
      remarks: p2?.remarks ?? meta?.remarks ?? null,
    };
  });

  return { section, material, tasks, bands, maxTotal, learners };
}

/** A learner counts as assessed once Part 1 has any score. */
export function isAssessed(l: CrlaReportLearner): boolean {
  return l.part1Total !== null;
}
