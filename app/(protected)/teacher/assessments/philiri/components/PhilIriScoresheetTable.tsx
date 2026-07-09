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
  getGradeLevelLabel,
  philIriGstLabels,
  philIriPhaseLabel,
  philIriSuggestedStartGrade,
  PHILIRI_FORM_TYPES,
  PHILIRI_PHASES,
  PHILIRI_GST_CRITICAL_MAX,
  PHILIRI_GST_INFERENTIAL_MAX,
  PHILIRI_GST_LITERAL_MAX,
  PHILIRI_GST_TOTAL_MAX,
  PHILIRI_LANGUAGES,
  PHILIRI_RESULT_NO_NEED,
} from "@/lib/constants";
import { generatePhilIriScoresheet } from "@/lib/pdf/generatePhilIriScoresheet";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { PhilIriMaterial, Student } from "@/types";
import { Download, Loader2, Pencil, Printer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { AdviserSection } from "../page";
import { computeScreening, deriveFinalProfile } from "../philiriUtils";
import { PhilIriLadderModal } from "./PhilIriLadderModal";

interface ScoreRow {
  test_taken: boolean;
  literal: number | null;
  inferential: number | null;
  critical: number | null;
}

interface RecordMeta {
  recordId?: string;
  date_assessed: string | null;
  remarks: string | null;
}

interface IndividualSummary {
  gstTotal: number | null;
  screeningResult: string | null;
  reads: { grade: number; overallLevel: string | null }[];
  finalProfileLabel: string;
  recorded: boolean;
}

const emptyScore = (): ScoreRow => ({
  test_taken: false,
  literal: null,
  inferential: null,
  critical: null,
});

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
  focusStudentId,
}: Props) {
  const [formType, setFormType] = useState<string>("screening");
  const [language, setLanguage] = useState<string>(PHILIRI_LANGUAGES[0]);
  const [phase, setPhase] = useState<string>("BoSY");
  const [materials, setMaterials] = useState<PhilIriMaterial[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<Record<string, ScoreRow>>({});
  const [meta, setMeta] = useState<Record<string, RecordMeta>>({});
  const [individual, setIndividual] = useState<Record<string, IndividualSummary>>(
    {},
  );
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(false);

  const scoresRef = useRef<Record<string, ScoreRow>>({});
  const metaRef = useRef<Record<string, RecordMeta>>({});
  // In-flight record creations, keyed by student, so the several fields per row
  // (test-taken + 3 scores) don't each fire a separate insert and collide on the
  // (material, student, phase, school_year) unique constraint.
  const pendingRecordRef = useRef<Record<string, Promise<string | null>>>({});
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);

  const fullUser = useAppSelector((state) => state.user.user);
  const { settings } = useSchoolSettings(true, fullUser?.school_id);
  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const locked = isPreviousYear && !settings.allow_edit_previous_school_year;

  const section = sections.find((s) => s.id === selectedSection) || null;
  const material =
    materials.find((m) => String(m.id) === selectedMaterialId) || null;
  const labels = philIriGstLabels(material?.language ?? language);

  const MAXES: Record<keyof Omit<ScoreRow, "test_taken">, number> = {
    literal: PHILIRI_GST_LITERAL_MAX,
    inferential: PHILIRI_GST_INFERENTIAL_MAX,
    critical: PHILIRI_GST_CRITICAL_MAX,
  };

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
    // Screening needs a section-grade material; the individual ladder does not
    // (learners read lower-grade passages chosen inside the modal).
    if (!section || (formType === "screening" && !material)) {
      setStudents([]);
      setScores({});
      setMeta({});
      setIndividual({});
      return;
    }
    setLoading(true);

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

    const nextScores: Record<string, ScoreRow> = {};
    const nextMeta: Record<string, RecordMeta> = {};
    const nextIndividual: Record<string, IndividualSummary> = {};
    studentRows.forEach((s) => {
      nextScores[s.id] = emptyScore();
      nextMeta[s.id] = { date_assessed: null, remarks: null };
      nextIndividual[s.id] = {
        gstTotal: null,
        screeningResult: null,
        reads: [],
        finalProfileLabel: deriveFinalProfile([]).label,
        recorded: false,
      };
    });

    if (studentIds.length > 0 && formType === "screening" && material) {
      const { data: records } = await supabase
        .from("sms_philiri_records")
        .select(
          "id, student_id, test_taken, literal_correct, inferential_correct, critical_correct, date_assessed, remarks",
        )
        .eq("material_id", material.id)
        .eq("phase", phase)
        .eq("school_year", schoolYear)
        .eq("form_type", "screening")
        .in("student_id", studentIds);

      (records || []).forEach((r) => {
        const sid = String(r.student_id);
        nextScores[sid] = {
          test_taken: !!r.test_taken,
          literal: r.literal_correct === null ? null : Number(r.literal_correct),
          inferential:
            r.inferential_correct === null ? null : Number(r.inferential_correct),
          critical:
            r.critical_correct === null ? null : Number(r.critical_correct),
        };
        nextMeta[sid] = {
          recordId: String(r.id),
          date_assessed: r.date_assessed,
          remarks: r.remarks,
        };
      });
    } else if (studentIds.length > 0 && formType === "individual") {
      // GST screening totals (any material at the section grade) → pass/fail flag.
      const { data: screenings } = await supabase
        .from("sms_philiri_records")
        .select("student_id, total_score, screening_result")
        .eq("phase", phase)
        .eq("school_year", schoolYear)
        .eq("form_type", "screening")
        .in("student_id", studentIds);
      (screenings || []).forEach((r) => {
        const sid = String(r.student_id);
        if (!nextIndividual[sid]) return;
        nextIndividual[sid].gstTotal =
          r.total_score === null ? null : Number(r.total_score);
        nextIndividual[sid].screeningResult =
          (r.screening_result as string | null) ?? null;
      });

      // All individual reads across grades, joined to material grade + language.
      const { data: records } = await supabase
        .from("sms_philiri_records")
        .select(
          "student_id, overall_reading_level, material:sms_philiri_materials!inner(grade_level, language)",
        )
        .eq("phase", phase)
        .eq("school_year", schoolYear)
        .eq("form_type", "individual")
        .eq("material.language", language)
        .in("student_id", studentIds);

      const byStudent: Record<string, { grade: number; overallLevel: string | null }[]> = {};
      (records || []).forEach((r) => {
        const sid = String(r.student_id);
        const mat = r.material as unknown as { grade_level: number } | null;
        if (!mat) return;
        (byStudent[sid] ||= []).push({
          grade: mat.grade_level,
          overallLevel: (r.overall_reading_level as string | null) ?? null,
        });
      });
      Object.entries(byStudent).forEach(([sid, reads]) => {
        if (!nextIndividual[sid]) return;
        const sorted = reads.sort((a, b) => a.grade - b.grade);
        nextIndividual[sid].reads = sorted;
        nextIndividual[sid].recorded = sorted.length > 0;
        nextIndividual[sid].finalProfileLabel = deriveFinalProfile(
          sorted.map((x) => ({
            grade: x.grade,
            overallLevel: (x.overallLevel as never) ?? null,
          })),
        ).label;
      });
    }

    setScores(nextScores);
    setMeta(nextMeta);
    setIndividual(nextIndividual);
    scoresRef.current = nextScores;
    metaRef.current = nextMeta;
    setLoading(false);
  }, [section, material, phase, schoolYear, formType, language]);

  useEffect(() => {
    load();
  }, [load]);

  // Scroll the deep-linked learner into view once the roster renders.
  useEffect(() => {
    if (focusStudentId && !loading && focusRowRef.current) {
      focusRowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusStudentId, students, loading, material]);

  const ensureRecord = async (studentId: string): Promise<string | null> => {
    const existing = metaRef.current[studentId]?.recordId;
    if (existing) return existing;
    // Reuse an in-flight creation for the same learner so rapid edits across the
    // row's fields don't each insert and collide on the unique constraint.
    const pending = pendingRecordRef.current[studentId];
    if (pending) return pending;

    const p = (async (): Promise<string | null> => {
      // Scope the record to the section's own school (matters for super admins,
      // who may be recording against another school's section).
      const recordSchoolId = section ? Number(section.school_id) : schoolId;
      if (!recordSchoolId || !material || !section) {
        toast.error("This section has no school assigned.");
        return null;
      }
      // Upsert (not insert) so a pre-existing record for this learner/phase is
      // reused instead of violating the unique constraint.
      const { data, error } = await supabase
        .from("sms_philiri_records")
        .upsert(
          {
            material_id: Number(material.id),
            school_id: recordSchoolId,
            section_id: Number(section.id),
            student_id: Number(studentId),
            teacher_id: teacherId,
            phase,
            school_year: schoolYear,
            form_type: "screening",
          },
          { onConflict: "material_id,student_id,phase,school_year,form_type" },
        )
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
    })();

    pendingRecordRef.current[studentId] = p;
    try {
      return await p;
    } finally {
      delete pendingRecordRef.current[studentId];
    }
  };

  const persistScores = async (studentId: string, recordId: string) => {
    const row = scoresRef.current[studentId] || emptyScore();
    const { total, result } = computeScreening(
      row.literal,
      row.inferential,
      row.critical,
    );
    const { error } = await supabase
      .from("sms_philiri_records")
      .update({
        test_taken: row.test_taken,
        literal_correct: row.literal,
        inferential_correct: row.inferential,
        critical_correct: row.critical,
        total_score: total,
        screening_result: result,
      })
      .eq("id", recordId);
    if (error) toast.error("Failed to save.");
  };

  const setLocalScore = (studentId: string, patch: Partial<ScoreRow>) => {
    const next = {
      ...scoresRef.current,
      [studentId]: { ...(scoresRef.current[studentId] || emptyScore()), ...patch },
    };
    scoresRef.current = next;
    setScores(next);
  };

  const parseScore = (
    field: keyof Omit<ScoreRow, "test_taken">,
    value: string,
  ): number | null => {
    if (value === "") return null;
    const n = Number(value);
    if (Number.isNaN(n)) return null;
    return Math.max(0, Math.min(MAXES[field], Math.trunc(n)));
  };

  const persistRow = async (studentId: string) => {
    if (locked) return;
    const recordId = await ensureRecord(studentId);
    if (!recordId) return;
    await persistScores(studentId, recordId);
  };

  const toggleTestTaken = async (studentId: string, checked: boolean) => {
    if (locked) return;
    setLocalScore(studentId, { test_taken: checked });
    await persistRow(studentId);
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

  const printScoresheet = () => {
    if (!material || !section) return;
    generatePhilIriScoresheet({
      schoolId: Number(section.school_id),
      material,
      students,
      scores: scoresRef.current,
      meta: metaRef.current,
      sectionName: section.name,
      teacherName,
      phase,
    }).catch(() => toast.error("Failed to generate scoresheet."));
  };

  // Screening tally for the summary chips + printed footer counts.
  const counts = students.reduce(
    (acc, s) => {
      const row = scores[s.id] || emptyScore();
      const { total } = computeScreening(row.literal, row.inferential, row.critical);
      if (total === null) return acc;
      if (total >= 14) acc.atOrAbove += 1;
      else acc.below += 1;
      return acc;
    },
    { below: 0, atOrAbove: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="min-w-56">
          <label className="text-sm font-medium mb-1.5 block">Form Type</label>
          <Select value={formType} onValueChange={setFormType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PHILIRI_FORM_TYPES.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
                  {s.school_name ? ` · ${s.school_name}` : ""}
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
              {PHILIRI_PHASES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {formType === "screening" && materials.length > 0 && (
          <div className="min-w-56">
            <label className="text-sm font-medium mb-1.5 block">Material</label>
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

      {section && !loading && formType === "screening" && !material && (
        <p className="text-sm text-amber-600 py-6">
          No Phil-IRI material is configured for{" "}
          {getGradeLevelLabel(section.grade_level)} {language}. Ask the division
          office to add one.
        </p>
      )}

      {section && !loading && formType === "screening" && material && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="text-sm">
              <span className="font-semibold">{material.title}</span>
              <span className="text-muted-foreground">
                {" "}
                · {material.language} · {material.word_count} words ·{" "}
                {philIriPhaseLabel(phase)}
              </span>
            </div>
            <div className="flex gap-2">
              {material.file_url && (
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={material.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                  >
                    <Download className="h-4 w-4 mr-1" /> Download Material
                  </a>
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={printScoresheet}>
                <Printer className="h-4 w-4 mr-1" /> Scoresheet
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{labels.note}</p>

          {locked && (
            <p className="text-xs text-amber-600">
              Editing previous school-year records is disabled in Settings.
            </p>
          )}

          {formType === "screening" &&
            (counts.below > 0 || counts.atOrAbove > 0) && (
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                  {labels.below}: {counts.below}
                </span>
                <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                  {labels.atOrAbove}: {counts.atOrAbove}
                </span>
              </div>
            )}

          {formType === "screening" && (
          <div className="overflow-x-auto border rounded-md">
            <table className="text-sm border-collapse min-w-full">
              <thead>
                <tr className="bg-muted/60">
                  <th
                    rowSpan={2}
                    className="border px-3 py-2 text-left min-w-52 sticky left-0 bg-muted/60 z-10"
                  >
                    Learners&apos; Names
                  </th>
                  <th rowSpan={2} className="border px-2 py-2 text-center w-20">
                    {labels.testTaken}
                  </th>
                  <th colSpan={3} className="border px-2 py-2 text-center">
                    {labels.correctResponses}
                  </th>
                  <th rowSpan={2} className="border px-2 py-2 text-center w-20">
                    {labels.total}
                  </th>
                  <th rowSpan={2} className="border px-2 py-2 text-center w-28">
                    Result
                  </th>
                  <th rowSpan={2} className="border px-2 py-2 text-center w-36">
                    Date
                  </th>
                  <th rowSpan={2} className="border px-2 py-2 text-center w-40">
                    Remarks
                  </th>
                </tr>
                <tr className="bg-muted/60">
                  <th className="border px-2 py-1 text-center w-24">
                    {labels.literal}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      /{PHILIRI_GST_LITERAL_MAX}
                    </span>
                  </th>
                  <th className="border px-2 py-1 text-center w-24">
                    {labels.inferential}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      /{PHILIRI_GST_INFERENTIAL_MAX}
                    </span>
                  </th>
                  <th className="border px-2 py-1 text-center w-24">
                    {labels.critical}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      /{PHILIRI_GST_CRITICAL_MAX}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => {
                  const row = scores[s.id] || emptyScore();
                  const { total, result } = computeScreening(
                    row.literal,
                    row.inferential,
                    row.critical,
                  );
                  const m = meta[s.id] || { date_assessed: null, remarks: null };
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
                      <td className="border text-center">
                        <Checkbox
                          checked={row.test_taken}
                          disabled={locked}
                          onChange={(e) =>
                            toggleTestTaken(s.id, e.target.checked)
                          }
                        />
                      </td>
                      {(
                        ["literal", "inferential", "critical"] as const
                      ).map((field) => (
                        <td key={field} className="border p-0">
                          <Input
                            type="number"
                            min={0}
                            max={MAXES[field]}
                            className="h-8 w-24 rounded-none border-0 text-center px-0"
                            value={row[field] === null ? "" : row[field]!}
                            disabled={locked}
                            onChange={(e) =>
                              setLocalScore(s.id, {
                                [field]: parseScore(field, e.target.value),
                              })
                            }
                            onBlur={() => persistRow(s.id)}
                            onWheel={(e) => e.currentTarget.blur()}
                          />
                        </td>
                      ))}
                      <td className="border px-2 py-1 text-center font-semibold">
                        {total === null ? "-" : `${total}/${PHILIRI_GST_TOTAL_MAX}`}
                      </td>
                      <td
                        className={`border px-2 py-1 text-center text-xs font-medium ${
                          total === null
                            ? ""
                            : total >= 14
                              ? "text-green-700"
                              : "text-amber-700"
                        }`}
                      >
                        {result ?? "-"}
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
                      colSpan={8}
                      className="border px-3 py-6 text-center text-muted-foreground"
                    >
                      No enrolled learners found for this section.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}

      {section && !loading && formType === "individual" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="text-sm">
              <span className="font-semibold">
                Individual Record Form (3A / 3B)
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {language} · {philIriPhaseLabel(phase)}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            For learners who did not pass the GST, conduct the oral reading test
            one passage at a time — start ~2–3 grade levels below and move up
            until the learner reaches Instructional or Frustration. Open a
            learner to record passages; the final reading profile is derived
            automatically.
          </p>
          {locked && (
            <p className="text-xs text-amber-600">
              Editing previous school-year records is disabled in Settings.
            </p>
          )}
          <div className="overflow-x-auto border rounded-md">
            <table className="text-sm border-collapse min-w-full">
              <thead>
                <tr className="bg-muted/60">
                  <th className="border px-3 py-2 text-left min-w-52">
                    Learners&apos; Names
                  </th>
                  <th className="border px-2 py-2 text-center w-20">GST</th>
                  <th className="border px-2 py-2 text-center w-36">Status</th>
                  <th className="border px-2 py-2 text-center w-24">
                    Suggested start
                  </th>
                  <th className="border px-3 py-2 text-left min-w-48">
                    Passages read
                  </th>
                  <th className="border px-2 py-2 text-center w-44">
                    Final profile
                  </th>
                  <th className="border px-2 py-2 text-center w-28">Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => {
                  const summary = individual[s.id];
                  const gst = summary?.gstTotal ?? null;
                  const passed =
                    summary?.screeningResult === PHILIRI_RESULT_NO_NEED;
                  return (
                    <tr
                      key={s.id}
                      ref={s.id === focusStudentId ? focusRowRef : undefined}
                      className={`hover:bg-muted/30 ${s.id === focusStudentId ? "bg-primary/5 ring-2 ring-inset ring-primary" : ""}`}
                    >
                      <td className="border px-3 py-1.5 whitespace-nowrap">
                        <span className="text-muted-foreground mr-1">
                          {idx + 1}.
                        </span>
                        {s.last_name}, {s.first_name}
                        <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                          {formatLrn(s.lrn)}
                        </span>
                      </td>
                      <td className="border px-2 py-1 text-center text-xs">
                        {gst === null ? "-" : `${gst}/20`}
                      </td>
                      <td className="border px-2 py-1 text-center">
                        {summary?.screeningResult ? (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${passed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
                          >
                            {passed ? "Passed — enrichment" : "For pre-test"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            No GST yet
                          </span>
                        )}
                      </td>
                      <td className="border px-2 py-1 text-center text-xs">
                        {getGradeLevelLabel(
                          philIriSuggestedStartGrade(section.grade_level, gst),
                        )}
                      </td>
                      <td className="border px-3 py-1 text-xs">
                        {summary && summary.reads.length > 0 ? (
                          summary.reads
                            .map(
                              (r) => `G${r.grade} ${r.overallLevel ?? "-"}`,
                            )
                            .join(" · ")
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="border px-2 py-1 text-center text-xs font-semibold">
                        {summary?.finalProfileLabel ?? "-"}
                      </td>
                      <td className="border px-2 py-1 text-center">
                        <Button
                          size="sm"
                          variant={summary?.recorded ? "outline" : "green"}
                          onClick={() => setEditStudent(s)}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          {summary?.recorded ? "Continue" : "Record"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {students.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
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

      {editStudent && section && (
        <PhilIriLadderModal
          isOpen={!!editStudent}
          onClose={() => setEditStudent(null)}
          onSaved={load}
          student={editStudent}
          sectionId={Number(section.id)}
          sectionName={section.name}
          sectionGrade={section.grade_level}
          schoolId={Number(section.school_id)}
          teacherId={teacherId}
          teacherName={teacherName}
          language={language}
          phase={phase}
          schoolYear={schoolYear}
          gstTotal={individual[editStudent.id]?.gstTotal ?? null}
          screeningResult={individual[editStudent.id]?.screeningResult ?? null}
          locked={locked}
        />
      )}
    </div>
  );
}
