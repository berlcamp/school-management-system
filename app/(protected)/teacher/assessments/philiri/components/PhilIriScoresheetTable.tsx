"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import {
  ASSESSMENT_PHASES,
  getGradeLevelLabel,
  PHILIRI_LANGUAGES,
} from "@/lib/constants";
import { generatePhilIriPassage } from "@/lib/pdf/generatePhilIriPassage";
import { generatePhilIriScoresheet } from "@/lib/pdf/generatePhilIriScoresheet";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { PhilIriMaterial, PhilIriQuestion, Student } from "@/types";
import { Loader2, Printer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { AdviserSection } from "../page";
import { computePhilIri } from "../philiriUtils";

interface RecordMeta {
  recordId?: string;
  date_assessed: string | null;
  remarks: string | null;
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
}

export function PhilIriScoresheetTable({
  sections,
  selectedSection,
  setSelectedSection,
  schoolYear,
  setSchoolYear,
  schoolYearOptions,
  teacherId,
  teacherName,
  schoolId,
}: Props) {
  const [language, setLanguage] = useState<string>(PHILIRI_LANGUAGES[0]);
  const [phase, setPhase] = useState<string>("BoSY");
  const [materials, setMaterials] = useState<PhilIriMaterial[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
  const [questions, setQuestions] = useState<PhilIriQuestion[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [miscues, setMiscues] = useState<Record<string, number | null>>({});
  const [answers, setAnswers] = useState<Record<string, Record<string, boolean>>>({});
  const [meta, setMeta] = useState<Record<string, RecordMeta>>({});
  const [loading, setLoading] = useState(false);

  const miscuesRef = useRef<Record<string, number | null>>({});
  const answersRef = useRef<Record<string, Record<string, boolean>>>({});
  const metaRef = useRef<Record<string, RecordMeta>>({});

  const fullUser = useAppSelector((state) => state.user.user);
  const { settings } = useSchoolSettings(true, fullUser?.school_id);
  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const locked = isPreviousYear && !settings.allow_edit_previous_school_year;

  const section = sections.find((s) => s.id === selectedSection) || null;
  const material =
    materials.find((m) => String(m.id) === selectedMaterialId) || null;

  // Resolve candidate materials for the section grade + language.
  useEffect(() => {
    const run = async () => {
      if (!section) {
        setMaterials([]);
        setSelectedMaterialId("");
        return;
      }
      const { data } = await supabase
        .from("sms_philiri_materials")
        .select("*")
        .eq("grade_level", section.grade_level)
        .eq("language", language)
        .eq("is_active", true)
        .order("set_label");
      const list = (data || []) as PhilIriMaterial[];
      setMaterials(list);
      setSelectedMaterialId((prev) =>
        list.some((m) => String(m.id) === prev)
          ? prev
          : list.length > 0
            ? String(list[0].id)
            : "",
      );
    };
    run();
  }, [section, language]);

  const load = useCallback(async () => {
    if (!section || !material) {
      setQuestions([]);
      setStudents([]);
      setMiscues({});
      setAnswers({});
      setMeta({});
      return;
    }
    setLoading(true);

    const { data: questionRows } = await supabase
      .from("sms_philiri_questions")
      .select("*")
      .eq("material_id", material.id)
      .order("position");
    const loadedQuestions = (questionRows || []) as PhilIriQuestion[];
    setQuestions(loadedQuestions);

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

    const nextMiscues: Record<string, number | null> = {};
    const nextAnswers: Record<string, Record<string, boolean>> = {};
    const nextMeta: Record<string, RecordMeta> = {};
    studentRows.forEach((s) => {
      nextMiscues[s.id] = null;
      nextAnswers[s.id] = {};
      nextMeta[s.id] = { date_assessed: null, remarks: null };
    });

    if (studentIds.length > 0) {
      const { data: records } = await supabase
        .from("sms_philiri_records")
        .select("id, student_id, miscues, date_assessed, remarks")
        .eq("material_id", material.id)
        .eq("phase", phase)
        .eq("school_year", schoolYear)
        .in("student_id", studentIds);

      const recordIds = (records || []).map((r) => String(r.id));
      const recordToStudent: Record<string, string> = {};
      (records || []).forEach((r) => {
        recordToStudent[String(r.id)] = String(r.student_id);
        nextMiscues[String(r.student_id)] =
          r.miscues === null ? null : Number(r.miscues);
        nextMeta[String(r.student_id)] = {
          recordId: String(r.id),
          date_assessed: r.date_assessed,
          remarks: r.remarks,
        };
      });

      if (recordIds.length > 0) {
        const { data: answerRows } = await supabase
          .from("sms_philiri_answers")
          .select("record_id, question_id, is_correct")
          .in("record_id", recordIds);
        (answerRows || []).forEach((row) => {
          const sid = recordToStudent[String(row.record_id)];
          if (!sid) return;
          if (!nextAnswers[sid]) nextAnswers[sid] = {};
          nextAnswers[sid][String(row.question_id)] = !!row.is_correct;
        });
      }
    }

    setMiscues(nextMiscues);
    setAnswers(nextAnswers);
    setMeta(nextMeta);
    miscuesRef.current = nextMiscues;
    answersRef.current = nextAnswers;
    metaRef.current = nextMeta;
    setLoading(false);
  }, [section, material, phase, schoolYear]);

  useEffect(() => {
    load();
  }, [load]);

  const ensureRecord = async (studentId: string): Promise<string | null> => {
    const existing = metaRef.current[studentId]?.recordId;
    if (existing) return existing;
    if (!schoolId || !material || !section) {
      toast.error("Your account has no school assigned.");
      return null;
    }
    const { data, error } = await supabase
      .from("sms_philiri_records")
      .insert({
        material_id: Number(material.id),
        school_id: schoolId,
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

  const persistComputed = async (studentId: string, recordId: string) => {
    if (!material) return;
    const miscueVal = miscuesRef.current[studentId] ?? null;
    const studentAnswers = answersRef.current[studentId] || {};
    const correctCount = questions.reduce(
      (n, q) => n + (studentAnswers[q.id] ? 1 : 0),
      0,
    );
    const c = computePhilIri(
      Number(material.word_count),
      miscueVal,
      correctCount,
      questions.length,
    );
    await supabase
      .from("sms_philiri_records")
      .update({
        miscues: miscueVal,
        word_reading_score: c.wordReadingScore,
        comprehension_score: c.comprehensionScore,
        word_reading_level: c.wordReadingLevel,
        comprehension_level: c.comprehensionLevel,
        overall_reading_level: c.overallReadingLevel,
      })
      .eq("id", recordId);
  };

  const setLocalMiscues = (studentId: string, value: string) => {
    const next = {
      ...miscuesRef.current,
      [studentId]: value === "" ? null : Number(value),
    };
    miscuesRef.current = next;
    setMiscues(next);
  };

  const persistMiscues = async (studentId: string) => {
    if (locked) return;
    const recordId = await ensureRecord(studentId);
    if (!recordId) return;
    await persistComputed(studentId, recordId);
  };

  const toggleAnswer = async (
    studentId: string,
    questionId: string,
    checked: boolean,
  ) => {
    if (locked) return;
    const next = {
      ...answersRef.current,
      [studentId]: { ...(answersRef.current[studentId] || {}), [questionId]: checked },
    };
    answersRef.current = next;
    setAnswers(next);

    const recordId = await ensureRecord(studentId);
    if (!recordId) return;
    const { error } = await supabase.from("sms_philiri_answers").upsert(
      {
        record_id: Number(recordId),
        question_id: Number(questionId),
        is_correct: checked,
      },
      { onConflict: "record_id,question_id" },
    );
    if (error) {
      toast.error("Failed to save answer.");
      return;
    }
    await persistComputed(studentId, recordId);
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
      .from("sms_philiri_records")
      .update({ [field]: value })
      .eq("id", recordId);
    if (error) toast.error("Failed to save.");
  };

  const printPassage = () => {
    if (!material) return;
    generatePhilIriPassage({ schoolId, material, questions }).catch(() =>
      toast.error("Failed to generate passage sheet."),
    );
  };

  const printScoresheet = () => {
    if (!material || !section) return;
    generatePhilIriScoresheet({
      schoolId,
      material,
      questions,
      students,
      miscues: miscuesRef.current,
      answers: answersRef.current,
      meta: metaRef.current,
      sectionName: section.name,
      teacherName,
      phase,
    }).catch(() => toast.error("Failed to generate scoresheet."));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="w-36">
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
        <div className="min-w-52">
          <label className="text-sm font-medium mb-1.5 block">Section</label>
          <Select value={selectedSection} onValueChange={setSelectedSection}>
            <SelectTrigger>
              <SelectValue placeholder="Select advisory section" />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} — {getGradeLevelLabel(s.grade_level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <label className="text-sm font-medium mb-1.5 block">Language</label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PHILIRI_LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-36">
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
        {materials.length > 0 && (
          <div className="min-w-56">
            <label className="text-sm font-medium mb-1.5 block">Passage</label>
            <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.title}
                    {m.set_label ? ` (${m.set_label})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground py-6">
          You have no Grade 3–10 advisory section for {schoolYear}.
        </p>
      )}

      {section && loading && (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {section && !loading && !material && (
        <p className="text-sm text-amber-600 py-6">
          No Phil-IRI material is configured for{" "}
          {getGradeLevelLabel(section.grade_level)} {language}. Ask the division
          office to add one.
        </p>
      )}

      {section && !loading && material && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="text-sm">
              <span className="font-semibold">{material.title}</span>
              <span className="text-muted-foreground">
                {" "}
                · {material.word_count} words · {questions.length} questions ·{" "}
                {phase}
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={printPassage}>
                <Printer className="h-4 w-4 mr-1" /> Passage &amp; Questions
              </Button>
              <Button size="sm" variant="outline" onClick={printScoresheet}>
                <Printer className="h-4 w-4 mr-1" /> Scoresheet
              </Button>
            </div>
          </div>

          {locked && (
            <p className="text-xs text-amber-600">
              Editing previous school-year records is disabled in Settings.
            </p>
          )}

          {(() => {
            const summary: Record<string, number> = {};
            students.forEach((s) => {
              const miscueVal = miscues[s.id] ?? null;
              const studentAnswers = answers[s.id] || {};
              const correctCount = questions.reduce(
                (n, q) => n + (studentAnswers[q.id] ? 1 : 0),
                0,
              );
              const c = computePhilIri(
                Number(material.word_count),
                miscueVal,
                correctCount,
                questions.length,
              );
              if (c.overallReadingLevel)
                summary[c.overallReadingLevel] =
                  (summary[c.overallReadingLevel] ?? 0) + 1;
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
                  <th className="border px-3 py-2 text-left min-w-52 sticky left-0 bg-muted/60 z-10">
                    Learners&apos; Names
                  </th>
                  <th className="border px-2 py-2 text-center w-20">Miscues</th>
                  {questions.map((q, i) => (
                    <th key={q.id} className="border px-1 py-2 text-center w-10">
                      Q{i + 1}
                    </th>
                  ))}
                  <th className="border px-2 py-2 text-center w-16">WR %</th>
                  <th className="border px-2 py-2 text-center w-28">WR Level</th>
                  <th className="border px-2 py-2 text-center w-16">Comp %</th>
                  <th className="border px-2 py-2 text-center w-28">Comp Level</th>
                  <th className="border px-2 py-2 text-center w-28">Overall</th>
                  <th className="border px-2 py-2 text-center w-36">Date</th>
                  <th className="border px-2 py-2 text-center w-40">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => {
                  const miscueVal = miscues[s.id] ?? null;
                  const studentAnswers = answers[s.id] || {};
                  const correctCount = questions.reduce(
                    (n, q) => n + (studentAnswers[q.id] ? 1 : 0),
                    0,
                  );
                  const c = computePhilIri(
                    Number(material.word_count),
                    miscueVal,
                    correctCount,
                    questions.length,
                  );
                  const m = meta[s.id] || { date_assessed: null, remarks: null };
                  return (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="border px-3 py-1.5 sticky left-0 bg-background z-10 whitespace-nowrap">
                        <span className="text-muted-foreground mr-1">
                          {idx + 1}.
                        </span>
                        {s.last_name}, {s.first_name}
                        <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                          {formatLrn(s.lrn)}
                        </span>
                      </td>
                      <td className="border p-0">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-20 rounded-none border-0 text-center px-0"
                          value={miscueVal === null ? "" : miscueVal}
                          disabled={locked}
                          onChange={(e) => setLocalMiscues(s.id, e.target.value)}
                          onBlur={() => persistMiscues(s.id)}
                          onWheel={(e) => e.currentTarget.blur()}
                        />
                      </td>
                      {questions.map((q) => (
                        <td key={q.id} className="border text-center">
                          <Checkbox
                            checked={!!studentAnswers[q.id]}
                            disabled={locked}
                            onChange={(e) =>
                              toggleAnswer(s.id, q.id, e.target.checked)
                            }
                          />
                        </td>
                      ))}
                      <td className="border px-2 py-1 text-center">
                        {c.wordReadingScore ?? "-"}
                      </td>
                      <td className="border px-2 py-1 text-center text-xs">
                        {c.wordReadingLevel ?? "-"}
                      </td>
                      <td className="border px-2 py-1 text-center">
                        {c.comprehensionScore ?? "-"}
                      </td>
                      <td className="border px-2 py-1 text-center text-xs">
                        {c.comprehensionLevel ?? "-"}
                      </td>
                      <td className="border px-2 py-1 text-center text-xs font-semibold">
                        {c.overallReadingLevel ?? "-"}
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
                          className="h-8 w-40 rounded-none border-0 px-2"
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
                      colSpan={questions.length + 8}
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
