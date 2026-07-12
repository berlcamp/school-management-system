"use client";

/**
 * Teacher item-analysis workflow: pick a section + an exam, mark which
 * auto-scorable items each learner answered correctly, then save and view the
 * computed analysis (difficulty / discrimination / MPS). Non-auto-scorable
 * questions (essays) are excluded.
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getGradeLevelLabel } from "@/lib/constants";
import { getExamQuestionType } from "@/lib/constants/examinations";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  computeItemStats,
  studentScore,
  summarize,
  type AnalysisStudent,
} from "@/lib/utils/itemAnalysis";
import {
  getCurrentSchoolYear,
  getGradingPeriods,
  getGradingPeriodType,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { generateTosTitle } from "@/lib/utils/tos";
import { Printer, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ItemAnalysisReport } from "./ItemAnalysisReport";
import { PrintPortal } from "./PrintPortal";

interface SectionOpt {
  id: string;
  name: string;
  grade_level: number;
  school_id: number | null;
}

interface ExamTos {
  subject_name: string;
  grade_level: number;
  school_year: string;
  exam_type: string;
  grading_period: number;
  title: string | null;
}

interface ExamOpt {
  id: string;
  version_label: string;
  title: string | null;
  tos: ExamTos;
}

interface StudentRow {
  id: string;
  name: string;
}

export function ItemAnalysisPanel() {
  const user = useAppSelector((state) => state.user.user);
  const userId = user?.system_user_id ?? null;
  const schoolId = user?.school_id != null ? Number(user.school_id) : null;
  const isSuperAdmin = user?.type === "super admin";

  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [term, setTerm] = useState("");
  const [sections, setSections] = useState<SectionOpt[]>([]);
  const [exams, setExams] = useState<ExamOpt[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [examId, setExamId] = useState("");

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [itemNumbers, setItemNumbers] = useState<number[]>([]);
  const [marks, setMarks] = useState<Record<string, Set<number>>>({});
  const [resultId, setResultId] = useState<string | null>(null);
  const [dateAdministered, setDateAdministered] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const selectedExam = exams.find((e) => e.id === examId);
  const selectedSection = sections.find((s) => s.id === sectionId);

  // Term drives the exam list: only exams whose TOS matches the selected school
  // year + grading period. The section (still required for learners) is then
  // narrowed to the chosen exam's grade level.
  const filteredExams = useMemo(
    () =>
      term
        ? exams.filter(
            (e) =>
              e.tos.school_year === schoolYear &&
              String(e.tos.grading_period) === term,
          )
        : [],
    [exams, schoolYear, term],
  );
  const sectionsForExam = useMemo(
    () =>
      selectedExam
        ? sections.filter((s) => s.grade_level === selectedExam.tos.grade_level)
        : [],
    [selectedExam, sections],
  );

  const handleSchoolYear = (sy: string) => {
    setSchoolYear(sy);
    setTerm("");
    setExamId("");
    setSectionId("");
  };
  const handleTerm = (t: string) => {
    setTerm(t);
    setExamId("");
    setSectionId("");
  };
  const handleExam = (id: string) => {
    setExamId(id);
    setSectionId("");
  };

  // Sections for the chosen school year. Super admins see every section (all
  // schools); other users see the sections they teach.
  useEffect(() => {
    if (!schoolYear || (!isSuperAdmin && !userId)) return;
    let active = true;
    (async () => {
      if (isSuperAdmin) {
        const { data } = await supabase
          .from("sms_sections")
          .select("id, name, grade_level, school_id")
          .eq("school_year", schoolYear)
          .eq("is_active", true)
          .neq("grade_level", 0)
          .order("name");
        if (!active) return;
        setSections(
          (data ?? []).map((s) => ({
            id: String(s.id),
            name: s.name as string,
            grade_level: s.grade_level as number,
            school_id: s.school_id != null ? Number(s.school_id) : null,
          })),
        );
        return;
      }

      const { data } = await supabase
        .from("sms_subject_schedules")
        .select(
          "section_id, sections:section_id (id, name, grade_level, school_id)",
        )
        .eq("teacher_id", userId)
        .eq("school_year", schoolYear);
      if (!active) return;
      const seen = new Set<string>();
      const list: SectionOpt[] = [];
      (data ?? []).forEach((row) => {
        const sec = Array.isArray(row.sections) ? row.sections[0] : row.sections;
        if (!sec || !row.section_id) return;
        const id = String(sec.id);
        if (seen.has(id) || sec.grade_level === 0) return;
        seen.add(id);
        list.push({
          id,
          name: sec.name,
          grade_level: sec.grade_level,
          school_id: sec.school_id != null ? Number(sec.school_id) : null,
        });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setSections(list);
    })();
    return () => {
      active = false;
    };
  }, [userId, schoolYear, isSuperAdmin]);

  // Visible exams (division-shared + this teacher's own; all for super admin).
  useEffect(() => {
    if (!isSuperAdmin && !userId) return;
    let active = true;
    (async () => {
      let query = supabase
        .from("sms_exams")
        .select(
          "id, version_label, title, tos:tos_id!inner(subject_name, grade_level, school_year, exam_type, grading_period, title)",
        )
        .eq("is_active", true);
      // Super admins see every exam; others see division-shared + their own.
      if (!isSuperAdmin) {
        query = query.or(`school_id.is.null,created_by.eq.${userId}`);
      }
      const { data } = await query.order("created_at", { ascending: false });
      if (!active) return;
      setExams(
        (data ?? []).map((e) => {
          const tos = (Array.isArray(e.tos) ? e.tos[0] : e.tos) as ExamTos;
          return {
            id: String(e.id),
            version_label: e.version_label,
            title: e.title,
            tos,
          };
        }),
      );
    })();
    return () => {
      active = false;
    };
  }, [userId, isSuperAdmin]);

  const loadData = useCallback(async () => {
    if (!sectionId || !examId) {
      setStudents([]);
      setItemNumbers([]);
      setMarks({});
      setResultId(null);
      return;
    }
    setLoading(true);
    setShowReport(false);

    // Auto-scorable item numbers on the exam.
    const { data: qRows } = await supabase
      .from("sms_exam_questions")
      .select("item_number, item_count, question_type")
      .eq("exam_id", examId)
      .order("item_number");
    const items: number[] = [];
    (qRows ?? []).forEach((q) => {
      if (!getExamQuestionType(q.question_type)?.autoScorable) return;
      const count = Number(q.item_count) || 1;
      for (let k = 0; k < count; k++) items.push(q.item_number + k);
    });
    items.sort((a, b) => a - b);

    // Enrolled learners.
    const { data: enrollments } = await supabase
      .from("sms_enrollments")
      .select("student_id")
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .eq("status", "approved")
      .in("enrollment_status", [
        "active",
        "promoted",
        "graduated",
        "retained",
        "completed",
      ]);
    const studentIds = (enrollments ?? []).map((e) => String(e.student_id));
    let studentRows: StudentRow[] = [];
    if (studentIds.length > 0) {
      const { data } = await supabase
        .from("sms_students")
        .select("id, first_name, last_name")
        .in("id", studentIds)
        .order("last_name")
        .order("first_name");
      studentRows = (data ?? []).map((s) => ({
        id: String(s.id),
        name: `${s.last_name}, ${s.first_name}`,
      }));
    }

    // Existing result + per-learner marks.
    const { data: existing } = await supabase
      .from("sms_exam_results")
      .select("id, date_administered")
      .eq("exam_id", examId)
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .maybeSingle();

    const existingMarks: Record<string, Set<number>> = {};
    if (existing?.id) {
      const { data: rows } = await supabase
        .from("sms_exam_result_students")
        .select("student_id, correct_items")
        .eq("result_id", existing.id);
      (rows ?? []).forEach((r) => {
        existingMarks[String(r.student_id)] = new Set(
          (r.correct_items ?? []) as number[],
        );
      });
    }

    // Default a fresh sheet to "all correct"; keep saved marks otherwise.
    const nextMarks: Record<string, Set<number>> = {};
    studentRows.forEach((s) => {
      nextMarks[s.id] = existingMarks[s.id] ?? new Set(items);
    });

    setItemNumbers(items);
    setStudents(studentRows);
    setMarks(nextMarks);
    setResultId(existing?.id ? String(existing.id) : null);
    setDateAdministered(existing?.date_administered ?? "");
    setLoading(false);
  }, [sectionId, examId, schoolYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggle = (studentId: string, item: number) =>
    setMarks((prev) => {
      const set = new Set(prev[studentId] ?? []);
      if (set.has(item)) set.delete(item);
      else set.add(item);
      return { ...prev, [studentId]: set };
    });

  const toggleAll = (studentId: string, correct: boolean) =>
    setMarks((prev) => ({
      ...prev,
      [studentId]: correct ? new Set(itemNumbers) : new Set(),
    }));

  const analysis = useMemo(() => {
    const analysisStudents: AnalysisStudent[] = students.map((s) => ({
      studentId: s.id,
      correctItems: marks[s.id] ?? new Set(),
    }));
    const scores = analysisStudents.map((s) =>
      studentScore(s.correctItems, itemNumbers),
    );
    const itemStats = computeItemStats(analysisStudents, itemNumbers);
    const summary = summarize(scores, itemNumbers.length, itemStats);
    const scoreRows = students.map((s, i) => ({
      name: s.name,
      score: scores[i],
    }));
    return { itemStats, summary, scoreRows };
  }, [students, marks, itemNumbers]);

  const reportHeader = selectedExam
    ? {
        examTitle:
          selectedExam.title?.trim() ||
          `${generateTosTitle(selectedExam.tos)} · ${selectedExam.version_label}`,
        subject: selectedExam.tos.subject_name,
        sectionName: selectedSection?.name ?? "",
        gradeLabel: getGradeLevelLabel(
          selectedSection?.grade_level ?? selectedExam.tos.grade_level,
        ),
        schoolYear,
        dateAdministered: dateAdministered || null,
      }
    : null;

  const onSave = async () => {
    if (saving) return;
    if (!examId || !sectionId) return toast.error("Select a section and exam.");
    if (students.length === 0) return toast.error("No learners in this section.");
    if (itemNumbers.length === 0)
      return toast.error("This exam has no auto-scorable items.");

    setSaving(true);
    try {
      const payload = {
        exam_id: Number(examId),
        section_id: Number(sectionId),
        // Use the section's own school (matters for super admins with no school_id).
        school_id: selectedSection?.school_id ?? schoolId,
        school_year: schoolYear,
        teacher_id: userId ?? null,
        date_administered: dateAdministered || null,
        total_items: itemNumbers.length,
        mps: analysis.summary.mps,
      };

      let rid = resultId;
      if (rid) {
        const { error } = await supabase
          .from("sms_exam_results")
          .update(payload)
          .eq("id", rid);
        if (error) throw new Error(error.message);
      } else {
        const { data: ins, error } = await supabase
          .from("sms_exam_results")
          .insert([payload])
          .select()
          .single();
        if (error) throw new Error(error.message);
        rid = String(ins.id);
        setResultId(rid);
      }

      await supabase
        .from("sms_exam_result_students")
        .delete()
        .eq("result_id", rid);
      await supabase.from("sms_exam_result_students").insert(
        students.map((s) => ({
          result_id: Number(rid),
          student_id: Number(s.id),
          correct_items: [...(marks[s.id] ?? new Set<number>())]
            .filter((n) => itemNumbers.includes(n))
            .sort((a, b) => a - b),
        })),
      );

      toast.success("Saved!");
      setShowReport(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error saving results");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Record Exam Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0">
              <Label className="mb-1.5 block">School Year</Label>
              <Select value={schoolYear} onValueChange={handleSchoolYear}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getSchoolYearOptions().map((sy) => (
                    <SelectItem key={sy} value={sy}>
                      {sy}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block">
                {getGradingPeriodType(schoolYear) === "term"
                  ? "Term"
                  : "Quarter"}
              </Label>
              <Select value={term} onValueChange={handleTerm}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {getGradingPeriods(schoolYear).map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block">Exam</Label>
              <Select value={examId} onValueChange={handleExam} disabled={!term}>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={term ? "Select exam" : "Select a term first"}
                  />
                </SelectTrigger>
                <SelectContent className="max-w-[min(28rem,90vw)]">
                  {filteredExams.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No exams for this term.
                    </div>
                  ) : (
                    filteredExams.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        <span className="block truncate">
                          {(e.title?.trim() || generateTosTitle(e.tos)) +
                            ` · ${e.version_label}`}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block">Section</Label>
              <Select
                value={sectionId}
                onValueChange={setSectionId}
                disabled={!examId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={examId ? "Select section" : "Select an exam first"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {sectionsForExam.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No sections for this exam&apos;s grade level.
                    </div>
                  ) : (
                    sectionsForExam.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} — {getGradeLevelLabel(s.grade_level)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : sectionId && examId && itemNumbers.length === 0 ? (
            <p className="text-sm text-amber-600">
              This exam has no auto-scorable items.
            </p>
          ) : sectionId && examId && students.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No enrolled learners found for this section.
            </p>
          ) : sectionId && examId ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="mb-1.5 block">Date administered</Label>
                  <Input
                    type="date"
                    value={dateAdministered}
                    onChange={(e) => setDateAdministered(e.target.value)}
                    className="w-44"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Check the items each learner answered correctly (a fresh sheet
                  starts all-correct — uncheck the ones they missed).
                </p>
              </div>

              <div className="max-h-[55vh] overflow-auto rounded border">
                <table className="border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr>
                      <th className="sticky left-0 z-20 border bg-muted px-2 py-1 text-left">
                        Learner
                      </th>
                      {itemNumbers.map((n) => (
                        <th key={n} className="border px-1 py-1 text-center">
                          {n}
                        </th>
                      ))}
                      <th className="border px-2 py-1 text-center">Score</th>
                      <th className="border px-1 py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => {
                      const set = marks[s.id] ?? new Set<number>();
                      const score = studentScore(set, itemNumbers);
                      return (
                        <tr key={s.id}>
                          <td className="sticky left-0 z-10 border bg-background px-2 py-1 whitespace-nowrap">
                            {s.name}
                          </td>
                          {itemNumbers.map((n) => (
                            <td
                              key={n}
                              className="border px-1 py-1 text-center"
                            >
                              <input
                                type="checkbox"
                                checked={set.has(n)}
                                onChange={() => toggle(s.id, n)}
                              />
                            </td>
                          ))}
                          <td className="border px-2 py-1 text-center font-medium">
                            {score}/{itemNumbers.length}
                          </td>
                          <td className="border px-1 py-1">
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="rounded border px-1 text-[10px] hover:bg-muted"
                                onClick={() => toggleAll(s.id, true)}
                                title="All correct"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                className="rounded border px-1 text-[10px] hover:bg-muted"
                                onClick={() => toggleAll(s.id, false)}
                                title="All wrong"
                              >
                                ✗
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={onSave} disabled={saving} variant="green">
                  <Save className="mr-1.5 h-4 w-4" />
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowReport((v) => !v)}
                >
                  {showReport ? "Hide" : "Show"} analysis
                </Button>
                <span className="text-sm text-muted-foreground">
                  MPS: <span className="font-semibold">{analysis.summary.mps}%</span>
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a section and an exam to begin.
            </p>
          )}
        </CardContent>
      </Card>

      {showReport && reportHeader && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Analysis</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
              >
                <Printer className="mr-1.5 h-4 w-4" /> Print
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ItemAnalysisReport
              header={reportHeader}
              itemStats={analysis.itemStats}
              scores={analysis.scoreRows}
              summary={analysis.summary}
              showStudents
            />
            <PrintPortal id="item-analysis-print-area">
              <ItemAnalysisReport
                header={reportHeader}
                itemStats={analysis.itemStats}
                scores={analysis.scoreRows}
                summary={analysis.summary}
                showStudents
              />
            </PrintPortal>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
