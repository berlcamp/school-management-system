"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import {
  ASSESSMENT_PHASES,
  CRLA_LANGUAGES,
  crlaEnrolmentRecommendation,
  getGradeLevelLabel,
} from "@/lib/constants";
import { generateCrlaScoresheet } from "@/lib/pdf/generateCrlaScoresheet";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { CrlaBand, CrlaMaterial, CrlaMaterialTask, Student } from "@/types";
import { Download, FileText, Info, Loader2, Printer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { AdviserSection } from "../page";
import {
  CRLA_TASK1_AUTOFILL_THRESHOLD,
  CrlaScoreMap,
  effectiveScores,
  hasAnyScore,
  isTask2HEnabled,
  isTask2LAutoFilled,
  needsRecordForm,
  profileForScore,
  totalScore,
} from "../crlaUtils";

interface RecordMeta {
  recordId?: string;
  date_assessed: string | null;
  remarks: string | null;
  profile_label: string | null;
}

interface Props {
  sections: AdviserSection[];
  selectedSection: string;
  setSelectedSection: (value: string) => void;
  schoolYear: string;
  setSchoolYear: (value: string) => void;
  schoolYearOptions: string[];
  teacherId: number;
  teacherName: string;
  schoolId: number | null;
  focusStudentId?: string;
  onOpenRecordForm?: (studentId: string) => void;
}

export function CrlaScoresheetTable({
  sections,
  selectedSection,
  setSelectedSection,
  schoolYear,
  setSchoolYear,
  schoolYearOptions,
  teacherId,
  teacherName,
  schoolId,
  focusStudentId,
  onOpenRecordForm,
}: Props) {
  const [language, setLanguage] = useState<string>(CRLA_LANGUAGES[0]);
  const [phase, setPhase] = useState<string>("BoSY");
  const [material, setMaterial] = useState<CrlaMaterial | null>(null);
  const [tasks, setTasks] = useState<CrlaMaterialTask[]>([]);
  const [bands, setBands] = useState<CrlaBand[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<CrlaScoreMap>({});
  const [meta, setMeta] = useState<Record<string, RecordMeta>>({});
  const [loading, setLoading] = useState(false);

  const scoresRef = useRef<CrlaScoreMap>({});
  const metaRef = useRef<Record<string, RecordMeta>>({});
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);

  const fullUser = useAppSelector((state) => state.user.user);
  const { settings } = useSchoolSettings(true, fullUser?.school_id);
  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const locked = isPreviousYear && !settings.allow_edit_previous_school_year;

  const section = sections.find((s) => s.id === selectedSection) || null;

  const syncRefs = (s: CrlaScoreMap, m: Record<string, RecordMeta>) => {
    scoresRef.current = s;
    metaRef.current = m;
  };

  const load = useCallback(async () => {
    if (!section) {
      setMaterial(null);
      setTasks([]);
      setBands([]);
      setStudents([]);
      setScores({});
      setMeta({});
      return;
    }
    setLoading(true);

    // Resolve the material: a material listing this phase wins over an
    // "any-phase" one (empty phases array).
    const { data: materials } = await supabase
      .from("sms_crla_materials")
      .select("*")
      .eq("grade_level", section.grade_level)
      .eq("language", language)
      .eq("is_active", true);

    const chosen =
      (materials || []).find((m) => (m.phases || []).includes(phase)) ||
      (materials || []).find((m) => (m.phases || []).length === 0) ||
      null;

    if (!chosen) {
      setMaterial(null);
      setTasks([]);
      setBands([]);
      setStudents([]);
      setScores({});
      setMeta({});
      setLoading(false);
      return;
    }
    setMaterial(chosen as CrlaMaterial);

    const [{ data: taskRows }, { data: bandRows }] = await Promise.all([
      supabase
        .from("sms_crla_material_tasks")
        .select("*")
        .eq("material_id", chosen.id)
        .order("position"),
      supabase
        .from("sms_crla_bands")
        .select("*")
        .eq("material_id", chosen.id)
        .order("position"),
    ]);
    const loadedTasks = (taskRows || []) as CrlaMaterialTask[];
    setTasks(loadedTasks);
    setBands((bandRows || []) as CrlaBand[]);

    // Students enrolled in the section.
    const { data: enrollments } = await supabase
      .from("sms_enrollments")
      .select("student_id")
      .eq("section_id", section.id)
      .eq("school_year", schoolYear)
      .eq("status", "approved")
      .in("enrollment_status", [
        "active",
        "promoted",
        "graduated",
        "retained",
        "completed",
      ]);
    const studentIds = (enrollments || []).map((e) => String(e.student_id));
    let studentRows: Student[] = [];
    if (studentIds.length > 0) {
      const { data } = await supabase
        .from("sms_students")
        .select("*")
        .in("id", studentIds)
        .order("last_name")
        .order("first_name");
      studentRows = (data || []) as Student[];
    }
    setStudents(studentRows);

    // Existing records + scores for this material/phase/SY.
    const nextScores: CrlaScoreMap = {};
    const nextMeta: Record<string, RecordMeta> = {};
    studentRows.forEach((s) => {
      nextScores[s.id] = {};
      nextMeta[s.id] = {
        date_assessed: null,
        remarks: null,
        profile_label: null,
      };
    });

    if (studentIds.length > 0) {
      const { data: records } = await supabase
        .from("sms_crla_records")
        .select("id, student_id, date_assessed, remarks, profile_label")
        .eq("material_id", chosen.id)
        .eq("phase", phase)
        .eq("school_year", schoolYear)
        .in("student_id", studentIds);

      const recordIds = (records || []).map((r) => String(r.id));
      (records || []).forEach((r) => {
        nextMeta[String(r.student_id)] = {
          recordId: String(r.id),
          date_assessed: r.date_assessed,
          remarks: r.remarks,
          profile_label: r.profile_label ?? null,
        };
      });

      if (recordIds.length > 0) {
        const recordToStudent: Record<string, string> = {};
        (records || []).forEach(
          (r) => (recordToStudent[String(r.id)] = String(r.student_id)),
        );
        const { data: scoreRows } = await supabase
          .from("sms_crla_record_scores")
          .select("record_id, task_id, raw_score")
          .in("record_id", recordIds);
        (scoreRows || []).forEach((row) => {
          const sid = recordToStudent[String(row.record_id)];
          if (!sid) return;
          if (!nextScores[sid]) nextScores[sid] = {};
          nextScores[sid][String(row.task_id)] =
            row.raw_score === null ? null : Number(row.raw_score);
        });
      }
    }

    setScores(nextScores);
    setMeta(nextMeta);
    syncRefs(nextScores, nextMeta);
    setLoading(false);
  }, [section, language, phase, schoolYear]);

  useEffect(() => {
    load();
  }, [load]);

  // Scroll the deep-linked learner into view once the roster renders.
  useEffect(() => {
    if (focusStudentId && !loading && focusRowRef.current) {
      focusRowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusStudentId, students, loading, material]);

  // ----- mutations ----------------------------------------------------------
  const ensureRecord = async (studentId: string): Promise<string | null> => {
    const existing = metaRef.current[studentId]?.recordId;
    if (existing) return existing;
    // Scope the record to the section's own school (matters for super admins,
    // who may be recording against another school's section).
    const recordSchoolId = section ? Number(section.school_id) : schoolId;
    if (!recordSchoolId || !material || !section) {
      toast.error("This section has no school assigned.");
      return null;
    }
    const { data, error } = await supabase
      .from("sms_crla_records")
      .insert({
        material_id: Number(material.id),
        school_id: recordSchoolId,
        section_id: Number(section.id),
        student_id: Number(studentId),
        teacher_id: teacherId,
        phase,
        school_year: schoolYear,
      })
      .select("id")
      .single();
    if (error || !data) {
      toast.error("Could not open the learner record.");
      return null;
    }
    const recordId = String(data.id);
    const nextMeta = {
      ...metaRef.current,
      [studentId]: { ...metaRef.current[studentId], recordId },
    };
    metaRef.current = nextMeta;
    setMeta(nextMeta);
    return recordId;
  };

  const persistTotals = async (studentId: string, recordId: string) => {
    const eff = effectiveScores(tasks, scoresRef.current[studentId] || {});
    const total = totalScore(tasks, eff);
    const anyScore = hasAnyScore(tasks, eff);

    // Reading Profile is always auto-banded from the 0–30 total.
    const profile = anyScore ? profileForScore(bands, total) : null;

    // Mirror the resolved profile into meta so the UI stays in sync.
    const nextMeta = {
      ...metaRef.current,
      [studentId]: { ...metaRef.current[studentId], profile_label: profile },
    };
    metaRef.current = nextMeta;
    setMeta(nextMeta);

    await supabase
      .from("sms_crla_records")
      .update({
        total_score: anyScore ? total : null,
        profile_label: profile,
      })
      .eq("id", recordId);
  };

  const setLocalScore = (studentId: string, taskId: string, value: string) => {
    const next = {
      ...scoresRef.current,
      [studentId]: {
        ...(scoresRef.current[studentId] || {}),
        [taskId]: value === "" ? null : Number(value),
      },
    };
    scoresRef.current = next;
    setScores(next);
  };

  const persistScore = async (studentId: string, taskId: string) => {
    if (locked) return;
    const recordId = await ensureRecord(studentId);
    if (!recordId) return;
    const raw = scoresRef.current[studentId]?.[taskId];
    const { error } = await supabase.from("sms_crla_record_scores").upsert(
      {
        record_id: Number(recordId),
        task_id: Number(taskId),
        raw_score: raw === undefined ? null : raw,
      },
      { onConflict: "record_id,task_id" },
    );
    if (error) {
      toast.error("Failed to save score.");
      return;
    }
    await persistTotals(studentId, recordId);
  };

  // Task input change: editing Task 1 flips the branch — when it reaches the
  // threshold Task 2L is auto-awarded full marks (Task 2H unlocks); when it
  // drops below, Task 2H is cleared (it is disabled again).
  const handleTaskChange = (
    studentId: string,
    taskIndex: number,
    taskId: string,
    value: string,
  ) => {
    setLocalScore(studentId, taskId, value);
    if (taskIndex === 0 && tasks.length >= 3) {
      if (Number(value) >= CRLA_TASK1_AUTOFILL_THRESHOLD) {
        setLocalScore(
          studentId,
          tasks[1].id,
          String(Number(tasks[1].max_score)),
        );
      } else {
        setLocalScore(studentId, tasks[2].id, "");
      }
    } else if (
      taskIndex === 0 &&
      tasks.length === 2 &&
      Number(value) >= CRLA_TASK1_AUTOFILL_THRESHOLD
    ) {
      setLocalScore(studentId, tasks[1].id, String(Number(tasks[1].max_score)));
    }
  };

  const handleTaskBlur = async (
    studentId: string,
    taskIndex: number,
    taskId: string,
  ) => {
    await persistScore(studentId, taskId);
    if (taskIndex === 0 && tasks.length >= 3) {
      // Persist the dependent task the branch just changed (2L full or 2H cleared).
      if (
        Number(scoresRef.current[studentId]?.[taskId]) >=
        CRLA_TASK1_AUTOFILL_THRESHOLD
      ) {
        await persistScore(studentId, tasks[1].id);
      } else {
        await persistScore(studentId, tasks[2].id);
      }
    } else if (
      taskIndex === 0 &&
      tasks.length === 2 &&
      Number(scoresRef.current[studentId]?.[taskId]) >=
        CRLA_TASK1_AUTOFILL_THRESHOLD
    ) {
      await persistScore(studentId, tasks[1].id);
    }
  };

  const setLocalMeta = (studentId: string, patch: Partial<RecordMeta>) => {
    const next = {
      ...metaRef.current,
      [studentId]: { ...metaRef.current[studentId], ...patch },
    };
    metaRef.current = next;
    setMeta(next);
  };

  const persistMeta = async (
    studentId: string,
    field: "date_assessed" | "remarks",
  ) => {
    if (locked) return;
    const recordId = await ensureRecord(studentId);
    if (!recordId) return;
    const value = metaRef.current[studentId]?.[field] ?? null;
    const { error } = await supabase
      .from("sms_crla_records")
      .update({ [field]: value })
      .eq("id", recordId);
    if (error) toast.error("Failed to save.");
  };

  const printScoresheet = () => {
    if (!material || !section) return;
    generateCrlaScoresheet({
      schoolId: Number(section.school_id),
      material,
      tasks,
      bands,
      students,
      scores: scoresRef.current,
      meta: metaRef.current,
      sectionName: section.name,
      teacherName,
      phase,
    }).catch(() => toast.error("Failed to generate scoresheet."));
  };

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <div className="flex flex-wrap gap-3">
        <div className="w-40">
          <label className="text-sm font-medium mb-1.5 block">School Year</label>
          <Select value={schoolYear} onValueChange={setSchoolYear}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {schoolYearOptions.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-56">
          <label className="text-sm font-medium mb-1.5 block">Section</label>
          <Select value={selectedSection} onValueChange={setSelectedSection}>
            <SelectTrigger>
              <SelectValue placeholder="Select advisory section" />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} — {getGradeLevelLabel(s.grade_level)}
                  {s.school_name ? ` · ${s.school_name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <label className="text-sm font-medium mb-1.5 block">Language</label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRLA_LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <label className="text-sm font-medium mb-1.5 block">Phase</label>
          <Select value={phase} onValueChange={setPhase}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSESSMENT_PHASES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground py-6">
          You have no Grade 1–3 advisory section for {schoolYear}.
        </p>
      )}

      {section && loading && (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {section && !loading && !material && (
        <p className="text-sm text-amber-600 py-6">
          No CRLA material is configured for {getGradeLevelLabel(section.grade_level)}{" "}
          {language}
          {". "}
          Ask the division office to add one.
        </p>
      )}

      {section && !loading && material && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="text-sm">
              <span className="font-semibold">{material.title}</span>
              <span className="text-muted-foreground">
                {" "}
                · {getGradeLevelLabel(section.grade_level)} · {language} · {phase}
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={printScoresheet}>
                <Printer className="h-4 w-4 mr-1" /> Scoresheet
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Enter Task 1 (0–10). If Task 1 is 0–6, record Task 2L and leave
              Task 2H blank. If Task 1 is 7 or higher, Task 2L is set to 10
              automatically and Task 2H becomes inputable. When Task 2H is 7 or
              higher, open the learner&apos;s Record Form (Part 2). The Reading
              Level is computed from the 30-point total. Full &amp; Moderate
              Refresher need mandatory enrolment; Light Refresher is optional
              (encouraged if tutors permit).
            </p>
          </div>

          {tasks.some((t) => t.file_url) && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
              <span className="font-medium text-muted-foreground">
                Task materials:
              </span>
              {tasks
                .filter((t) => t.file_url)
                .map((t) => (
                  <a
                    key={t.id}
                    href={t.file_url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={t.file_name ?? undefined}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-primary hover:bg-primary/5"
                    title={t.file_name ?? undefined}
                  >
                    <Download className="h-3.5 w-3.5" /> {t.label}
                  </a>
                ))}
            </div>
          )}

          {locked && (
            <p className="text-xs text-amber-600">
              Editing previous school-year records is disabled in Settings.
            </p>
          )}

          {(() => {
            const summary: Record<string, number> = {};
            students.forEach((s) => {
              const eff = effectiveScores(tasks, scores[s.id] || {});
              if (!hasAnyScore(tasks, eff)) return;
              const total = totalScore(tasks, eff);
              const label = profileForScore(bands, total);
              if (label) summary[label] = (summary[label] ?? 0) + 1;
            });
            const entries = Object.entries(summary);
            if (entries.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-2">
                {entries.map(([label, count]) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  >
                    {label}: {count}
                  </span>
                ))}
              </div>
            );
          })()}

          <div className="overflow-x-auto border rounded-md">
            <table className="text-sm border-collapse min-w-full">
              <thead>
                <tr className="bg-muted/60">
                  <th className="border px-3 py-2 text-left min-w-56 sticky left-0 bg-muted/60 z-10">
                    Learners&apos; Names
                  </th>
                  {tasks.map((t) => (
                    <th key={t.id} className="border px-2 py-2 text-center w-16">
                      {t.label}
                      <div className="text-[10px] font-normal text-muted-foreground">
                        ({Number(t.max_score)})
                      </div>
                    </th>
                  ))}
                  <th className="border px-2 py-2 text-center w-16">Total</th>
                  <th className="border px-2 py-2 text-center w-40">
                    Reading Profile
                  </th>
                  <th className="border px-2 py-2 text-center w-44">
                    Refresher Enrolment
                  </th>
                  <th className="border px-2 py-2 text-center w-36">
                    Date Assessed
                  </th>
                  <th className="border px-2 py-2 text-center w-48">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => {
                  const studentScores = scores[s.id] || {};
                  const eff = effectiveScores(tasks, studentScores);
                  const anyScore = hasAnyScore(tasks, eff);
                  const total = totalScore(tasks, eff);
                  const t1 = Number(studentScores[tasks[0]?.id] ?? NaN);
                  // Legacy 2-task auto-fill (kept for pre-migration materials).
                  const legacyAutoTask2 =
                    tasks.length === 2 && t1 >= CRLA_TASK1_AUTOFILL_THRESHOLD;
                  const t2lAuto = isTask2LAutoFilled(tasks, studentScores);
                  const t2hEnabled = isTask2HEnabled(tasks, studentScores);
                  const showRecordForm = needsRecordForm(tasks, studentScores);
                  const displayProfile = anyScore
                    ? profileForScore(bands, total)
                    : null;
                  const enrolment = crlaEnrolmentRecommendation(displayProfile);
                  const m = meta[s.id] || {
                    date_assessed: null,
                    remarks: null,
                    profile_label: null,
                  };
                  return (
                    <tr
                      key={s.id}
                      ref={s.id === focusStudentId ? focusRowRef : undefined}
                      className={`hover:bg-muted/30 ${s.id === focusStudentId ? "bg-primary/5 ring-2 ring-inset ring-primary" : ""}`}
                    >
                      <td className="border px-3 py-1.5 sticky left-0 bg-background z-10 whitespace-nowrap">
                        <span className="text-muted-foreground mr-1">
                          {idx + 1}.
                        </span>
                        {s.last_name}, {s.first_name}
                        <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                          {formatLrn(s.lrn)}
                        </span>
                      </td>
                      {tasks.map((t, i) => {
                        // Task 2L auto-filled to full marks & locked (Task 1 >= 7);
                        // Task 2H disabled/blank until Task 1 >= 7.
                        const auto =
                          i === 1 && (t2lAuto || legacyAutoTask2);
                        const disabledEmpty =
                          i === 2 && tasks.length >= 3 && !t2hEnabled;
                        const v = auto
                          ? Number(t.max_score)
                          : disabledEmpty
                            ? ""
                            : studentScores[t.id];
                        return (
                          <td key={t.id} className="border p-0">
                            <Input
                              type="number"
                              min={0}
                              max={Number(t.max_score)}
                              className="h-8 w-16 rounded-none border-0 text-center px-0 disabled:opacity-70"
                              value={v === undefined || v === null ? "" : v}
                              disabled={locked || auto || disabledEmpty}
                              title={
                                auto
                                  ? "Auto-filled: Task 1 is 7 or higher"
                                  : disabledEmpty
                                    ? "Locked: Task 1 must be 7 or higher to record Task 2H"
                                    : undefined
                              }
                              onChange={(e) =>
                                handleTaskChange(s.id, i, t.id, e.target.value)
                              }
                              onBlur={() => handleTaskBlur(s.id, i, t.id)}
                              onWheel={(e) => e.currentTarget.blur()}
                            />
                          </td>
                        );
                      })}
                      <td className="border px-2 py-1 text-center font-semibold">
                        {anyScore ? total : "-"}
                      </td>
                      <td className="border px-1 py-1 text-center text-xs">
                        {anyScore ? (displayProfile ?? "-") : "-"}
                      </td>
                      <td className="border px-2 py-1 text-center text-xs">
                        {!anyScore ? (
                          "-"
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            {enrolment ? (
                              <Badge
                                variant={
                                  enrolment === "Mandatory"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="whitespace-nowrap"
                              >
                                {enrolment}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            {showRecordForm && (
                              <button
                                type="button"
                                onClick={() => onOpenRecordForm?.(s.id)}
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                                title="Task 2H is 7 or higher — fill out this learner's Record Form"
                              >
                                <FileText className="h-3 w-3" /> Record Form
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="border p-0">
                        <Input
                          type="date"
                          className="h-8 w-36 rounded-none border-0 px-1"
                          value={m.date_assessed ?? ""}
                          disabled={locked}
                          onChange={(e) =>
                            setLocalMeta(s.id, {
                              date_assessed: e.target.value || null,
                            })
                          }
                          onBlur={() => persistMeta(s.id, "date_assessed")}
                        />
                      </td>
                      <td className="border p-0">
                        <Input
                          className="h-8 w-48 rounded-none border-0 px-2"
                          value={m.remarks ?? ""}
                          disabled={locked}
                          onChange={(e) =>
                            setLocalMeta(s.id, { remarks: e.target.value })
                          }
                          onBlur={() => persistMeta(s.id, "remarks")}
                        />
                      </td>
                    </tr>
                  );
                })}
                {students.length === 0 && (
                  <tr>
                    <td
                      colSpan={tasks.length + 4}
                      className="border px-3 py-6 text-center text-muted-foreground"
                    >
                      No enrolled learners found for this section.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
