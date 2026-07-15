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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import {
  getGradeLevelLabel,
  RMA_LEVELS,
  RMA_PHASES,
  rmaPhaseLabel,
} from "@/lib/constants";
import { generateRmaScoresheet } from "@/lib/pdf/generateRmaScoresheet";
import { useAppSelector } from "@/lib/redux/hook";
import { usableMaterialsFilter } from "@/lib/assessments/scope";
import { supabase } from "@/lib/supabase/client";
import { exportCsv } from "@/lib/utils/exportCsv";
import { formatLrn } from "@/lib/utils";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { RmaBand, RmaItem, RmaMaterial, Student } from "@/types";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  Download,
  Info,
  Loader2,
  Printer,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { AdviserSection } from "../page";
import {
  groupByGender,
  hasAnyScore,
  masteryForScore,
  maxTotal,
  percentage,
  rmaLevelColor,
  RmaScoreMap,
  summaryByGender,
  taskLabel,
  totalScore,
} from "../rmaUtils";

interface RecordMeta {
  recordId?: string;
  date_assessed: string | null;
  remarks: string | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

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

const SAVE_DEBOUNCE_MS = 500;

export function RmaScoresheetTable({
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
  const [phase, setPhase] = useState<string>(RMA_PHASES[0].value);
  const [materials, setMaterials] = useState<RmaMaterial[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
  const [items, setItems] = useState<RmaItem[]>([]);
  const [bands, setBands] = useState<RmaBand[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<RmaScoreMap>({});
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [sortAsc, setSortAsc] = useState<{ male: boolean; female: boolean }>({
    male: true,
    female: true,
  });

  const scoresRef = useRef<RmaScoreMap>({});
  const savedScoresRef = useRef<RmaScoreMap>({});
  const metaRef = useRef<Record<string, RecordMeta>>({});
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingRef = useRef(0);
  const errorFlagRef = useRef(false);
  // Dedupes concurrent record creation when several debounced cell-saves for a
  // brand-new learner flush at once (unique key: material,student,phase,SY).
  const pendingRecordRef = useRef<Record<string, Promise<string | null>>>({});

  const fullUser = useAppSelector((state) => state.user.user);
  const { settings } = useSchoolSettings(true, fullUser?.school_id);
  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const locked = isPreviousYear && !settings.allow_edit_previous_school_year;

  const section = sections.find((s) => s.id === selectedSection) || null;
  const material =
    materials.find((m) => String(m.id) === selectedMaterialId) || null;
  const itemsMaxTotal = maxTotal(items);
  const columnCount = items.length + 5; // Name, Gender, tasks…, Total, %, Levelling

  const clearTimers = () => {
    Object.values(timersRef.current).forEach(clearTimeout);
    timersRef.current = {};
  };

  useEffect(() => {
    const run = async () => {
      if (!section) {
        setMaterials([]);
        setSelectedMaterialId("");
        return;
      }
      const { data } = await supabase
        .from("sms_rma_materials")
        .select("*")
        .or(usableMaterialsFilter(Number(section.school_id)))
        .eq("grade_level", section.grade_level)
        .eq("is_active", true)
        .order("title");
      const list = (data || []) as RmaMaterial[];
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
  }, [section]);

  const load = useCallback(async () => {
    clearTimers();
    pendingRef.current = 0;
    pendingRecordRef.current = {};
    errorFlagRef.current = false;
    setSaveState("idle");

    if (!section || !material) {
      setItems([]);
      setBands([]);
      setStudents([]);
      setScores({});
      metaRef.current = {};
      return;
    }
    setLoading(true);

    const [{ data: itemRows }, { data: bandRows }] = await Promise.all([
      supabase
        .from("sms_rma_items")
        .select("*")
        .eq("material_id", material.id)
        .order("position"),
      supabase
        .from("sms_rma_bands")
        .select("*")
        .eq("material_id", material.id)
        .order("position"),
    ]);
    setItems((itemRows || []) as RmaItem[]);
    setBands((bandRows || []) as RmaBand[]);

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

    const nextScores: RmaScoreMap = {};
    const nextMeta: Record<string, RecordMeta> = {};
    studentRows.forEach((s) => {
      nextScores[s.id] = {};
      nextMeta[s.id] = { date_assessed: null, remarks: null };
    });

    if (studentIds.length > 0) {
      const { data: records } = await supabase
        .from("sms_rma_records")
        .select("id, student_id, date_assessed, remarks")
        .eq("material_id", material.id)
        .eq("phase", phase)
        .eq("school_year", schoolYear)
        .in("student_id", studentIds);

      const recordIds = (records || []).map((r) => String(r.id));
      const recordToStudent: Record<string, string> = {};
      (records || []).forEach((r) => {
        recordToStudent[String(r.id)] = String(r.student_id);
        nextMeta[String(r.student_id)] = {
          recordId: String(r.id),
          date_assessed: r.date_assessed,
          remarks: r.remarks,
        };
      });

      if (recordIds.length > 0) {
        const { data: scoreRows } = await supabase
          .from("sms_rma_item_scores")
          .select("record_id, item_id, raw_score")
          .in("record_id", recordIds);
        (scoreRows || []).forEach((row) => {
          const sid = recordToStudent[String(row.record_id)];
          if (!sid) return;
          if (!nextScores[sid]) nextScores[sid] = {};
          nextScores[sid][String(row.item_id)] =
            row.raw_score === null ? null : Number(row.raw_score);
        });
      }
    }

    setScores(nextScores);
    scoresRef.current = nextScores;
    savedScoresRef.current = JSON.parse(JSON.stringify(nextScores));
    metaRef.current = nextMeta;
    setLoading(false);
  }, [section, material, phase, schoolYear]);

  useEffect(() => {
    load();
  }, [load]);

  // Flush any pending timers on unmount.
  useEffect(() => () => clearTimers(), []);

  // Scroll the deep-linked learner into view once the roster renders.
  useEffect(() => {
    if (focusStudentId && !loading && focusRowRef.current) {
      focusRowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusStudentId, students, loading, material]);

  const createRecord = async (studentId: string): Promise<string | null> => {
    // Scope the record to the section's own school (matters for super admins,
    // who may be recording against another school's section).
    const recordSchoolId = section ? Number(section.school_id) : schoolId;
    if (!recordSchoolId || !material || !section) {
      toast.error("This section has no school assigned.");
      return null;
    }
    // Upsert on the unique key so two concurrent creations resolve to one row
    // instead of a unique-constraint violation.
    const { data, error } = await supabase
      .from("sms_rma_records")
      .upsert(
        {
          material_id: Number(material.id),
          school_id: recordSchoolId,
          section_id: Number(section.id),
          student_id: Number(studentId),
          teacher_id: teacherId,
          phase,
          school_year: schoolYear,
        },
        { onConflict: "material_id,student_id,phase,school_year" },
      )
      .select("id")
      .single();
    if (error || !data) {
      toast.error("Could not open the learner record.");
      return null;
    }
    const recordId = String(data.id);
    metaRef.current = {
      ...metaRef.current,
      [studentId]: { ...metaRef.current[studentId], recordId },
    };
    return recordId;
  };

  const ensureRecord = (studentId: string): Promise<string | null> => {
    const existing = metaRef.current[studentId]?.recordId;
    if (existing) return Promise.resolve(existing);
    const inFlight = pendingRecordRef.current[studentId];
    if (inFlight) return inFlight;
    const p = createRecord(studentId);
    pendingRecordRef.current[studentId] = p;
    p.finally(() => {
      delete pendingRecordRef.current[studentId];
    });
    return p;
  };

  const persistTotals = async (studentId: string, recordId: string) => {
    const studentScores = scoresRef.current[studentId] || {};
    const anyScore = hasAnyScore(items, studentScores);
    const total = totalScore(items, studentScores);
    const mastery = anyScore
      ? masteryForScore(bands, total, itemsMaxTotal)
      : null;
    await supabase
      .from("sms_rma_records")
      .update({
        total_score: anyScore ? total : null,
        mastery_label: mastery,
      })
      .eq("id", recordId);
  };

  const setLocalScore = (studentId: string, itemId: string, value: string) => {
    const next = {
      ...scoresRef.current,
      [studentId]: {
        ...(scoresRef.current[studentId] || {}),
        [itemId]: value === "" ? null : Number(value),
      },
    };
    scoresRef.current = next;
    setScores(next);
  };

  const revertCell = (studentId: string, itemId: string) => {
    const saved = savedScoresRef.current[studentId]?.[itemId] ?? null;
    const next = {
      ...scoresRef.current,
      [studentId]: { ...(scoresRef.current[studentId] || {}), [itemId]: saved },
    };
    scoresRef.current = next;
    setScores(next);
  };

  const persistScore = async (studentId: string, itemId: string) => {
    if (locked) return;
    pendingRef.current += 1;
    setSaveState("saving");
    try {
      const recordId = await ensureRecord(studentId);
      if (!recordId) throw new Error("no record");
      const raw = scoresRef.current[studentId]?.[itemId];
      const { error } = await supabase.from("sms_rma_item_scores").upsert(
        {
          record_id: Number(recordId),
          item_id: Number(itemId),
          raw_score: raw === undefined ? null : raw,
        },
        { onConflict: "record_id,item_id" },
      );
      if (error) throw new Error(error.message);
      // Mark this cell as successfully saved (used for rollback).
      if (!savedScoresRef.current[studentId]) savedScoresRef.current[studentId] = {};
      savedScoresRef.current[studentId][itemId] = raw ?? null;
      await persistTotals(studentId, recordId);
    } catch {
      errorFlagRef.current = true;
      revertCell(studentId, itemId);
      toast.error("Failed to save score. Reverted.");
    } finally {
      pendingRef.current -= 1;
      if (pendingRef.current <= 0) {
        pendingRef.current = 0;
        setSaveState(errorFlagRef.current ? "error" : "saved");
        errorFlagRef.current = false;
      }
    }
  };

  const cellKey = (studentId: string, itemId: string) => `${studentId}:${itemId}`;

  const scheduleSave = (studentId: string, itemId: string) => {
    if (locked) return;
    const key = cellKey(studentId, itemId);
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(() => {
      delete timersRef.current[key];
      persistScore(studentId, itemId);
    }, SAVE_DEBOUNCE_MS);
  };

  const flushSave = (studentId: string, itemId: string) => {
    const key = cellKey(studentId, itemId);
    if (timersRef.current[key]) {
      clearTimeout(timersRef.current[key]);
      delete timersRef.current[key];
      persistScore(studentId, itemId);
    }
  };

  const clampScore = (value: string, max: number): string => {
    if (value === "") return "";
    const n = Number(value);
    if (Number.isNaN(n)) return "";
    return String(Math.max(0, Math.min(max, n)));
  };

  const downloadCsv = () => {
    if (!section) return;
    const headers = [
      "Name of Pupil",
      "Gender",
      ...items.map((it, i) => taskLabel(it, i)),
      "Total",
      "%",
      "Levelling of Learners",
    ];
    const male = groupByGender(students, sortAsc.male).male;
    const female = groupByGender(students, sortAsc.female).female;
    const rows = [...male, ...female].map((s) => {
      const ss = scores[s.id] || {};
      const entered = hasAnyScore(items, ss);
      const total = totalScore(items, ss);
      const pct = percentage(total, itemsMaxTotal);
      const row: Record<string, unknown> = {
        "Name of Pupil": `${s.last_name}, ${s.first_name}`,
        Gender: s.gender === "female" ? "Female" : "Male",
        Total: entered ? total : "",
        "%": entered ? pct : "",
        "Levelling of Learners": entered
          ? masteryForScore(bands, total, itemsMaxTotal) ?? ""
          : "",
      };
      items.forEach((it, i) => {
        const v = ss[it.id];
        row[taskLabel(it, i)] = v === undefined || v === null ? "" : v;
      });
      return row;
    });
    exportCsv(
      rows,
      headers,
      `RMA_${section.name}_${rmaPhaseLabel(phase)}_${schoolYear}`.replace(
        /\s+/g,
        "-",
      ),
    );
  };

  const printScoresheet = () => {
    if (!material || !section) return;
    generateRmaScoresheet({
      schoolId: Number(section.school_id),
      material,
      items,
      bands,
      students,
      scores: scoresRef.current,
      meta: metaRef.current,
      sectionName: section.name,
      teacherName,
      phase,
      maxTotal: itemsMaxTotal,
      sortAscMale: sortAsc.male,
      sortAscFemale: sortAsc.female,
    }).catch(() => toast.error("Failed to generate scoresheet."));
  };

  const summary =
    students.length > 0
      ? summaryByGender(students, items, bands, scores, itemsMaxTotal)
      : null;

  const renderStudentRow = (s: Student, displayIdx: number) => {
    const studentScores = scores[s.id] || {};
    const anyScore = hasAnyScore(items, studentScores);
    const total = totalScore(items, studentScores);
    const pct = percentage(total, itemsMaxTotal);
    const level = anyScore
      ? masteryForScore(bands, total, itemsMaxTotal)
      : null;
    return (
      <tr
        key={s.id}
        ref={s.id === focusStudentId ? focusRowRef : undefined}
        className={`hover:bg-muted/30 ${s.id === focusStudentId ? "bg-primary/5 ring-2 ring-inset ring-primary" : ""}`}
      >
        <td className="border px-3 py-1.5 sticky left-0 bg-background z-10 whitespace-nowrap">
          <span className="text-muted-foreground mr-1">{displayIdx}.</span>
          {s.last_name}, {s.first_name}
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
            {formatLrn(s.lrn)}
          </span>
        </td>
        <td className="border px-2 py-1 text-center text-xs">
          {s.gender === "female" ? "F" : "M"}
        </td>
        {items.map((it) => {
          const v = studentScores[it.id];
          const max = Number(it.max_score);
          return (
            <td key={it.id} className="border p-0">
              <Input
                type="number"
                min={0}
                max={max}
                className="h-8 w-12 rounded-none border-0 text-center px-0"
                value={v === undefined || v === null ? "" : v}
                disabled={locked}
                onChange={(e) => {
                  setLocalScore(s.id, it.id, clampScore(e.target.value, max));
                  scheduleSave(s.id, it.id);
                }}
                onBlur={() => flushSave(s.id, it.id)}
                onWheel={(e) => e.currentTarget.blur()}
              />
            </td>
          );
        })}
        <td className="border px-2 py-1 text-center font-semibold">
          {anyScore ? total : "-"}
        </td>
        <td className="border px-2 py-1 text-center">
          {anyScore ? `${pct}%` : "-"}
        </td>
        <td
          className={`border px-2 py-1 text-center text-xs font-medium ${rmaLevelColor(level)}`}
        >
          {level ?? "-"}
        </td>
      </tr>
    );
  };

  const genderHeaderRow = (
    label: string,
    group: "male" | "female",
    count: number,
  ) => (
    <tr className="bg-muted/40">
      <td
        colSpan={columnCount}
        className="border px-3 py-1.5 sticky left-0 z-10 bg-muted/40"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide">
            {label} ({count})
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() =>
              setSortAsc((prev) => ({ ...prev, [group]: !prev[group] }))
            }
          >
            {sortAsc[group] ? (
              <ArrowDownAZ className="h-3.5 w-3.5 mr-1" />
            ) : (
              <ArrowUpAZ className="h-3.5 w-3.5 mr-1" />
            )}
            Sort A–Z
          </Button>
        </div>
      </td>
    </tr>
  );

  const maleGroup = groupByGender(students, sortAsc.male).male;
  const femaleGroup = groupByGender(students, sortAsc.female).female;

  return (
    <div className="space-y-4">
      {/* KS1 levelling guide */}
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
        <div className="flex items-center gap-2 font-semibold">
          <Info className="h-4 w-4 shrink-0" />
          KS1 Levelling Guide (Percentage)
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {RMA_LEVELS.map((lvl) => (
            <div key={lvl.label}>
              <span className={`font-semibold ${rmaLevelColor(lvl.label)}`}>
                {lvl.range}: {lvl.label}
              </span>
              <p className="text-xs opacity-90">{lvl.definition}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
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
        {materials.length > 1 && (
          <div className="min-w-52">
            <label className="text-sm font-medium mb-1.5 block">Material</label>
            <Select
              value={selectedMaterialId}
              onValueChange={setSelectedMaterialId}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Pre-Test / Post-Test toggle */}
      <Tabs value={phase} onValueChange={setPhase}>
        <TabsList>
          {RMA_PHASES.map((p) => (
            <TabsTrigger key={p.value} value={p.value}>
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground py-6">
          You have no Grade 1–10 advisory section for {schoolYear}.
        </p>
      )}

      {section && loading && (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {section && !loading && !material && (
        <p className="text-sm text-amber-600 py-6">
          No RMA material is configured for{" "}
          {getGradeLevelLabel(section.grade_level)}. Ask the division office to
          add one.
        </p>
      )}

      {section && !loading && material && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="text-sm flex items-center gap-3">
              <span className="text-muted-foreground">
                {rmaPhaseLabel(phase)} · total {itemsMaxTotal} pts
              </span>
              {saveState === "saving" && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                </span>
              )}
              {saveState === "saved" && (
                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                  <Check className="h-3.5 w-3.5" /> Autosaved
                </span>
              )}
              {saveState === "error" && (
                <span className="text-xs text-red-600">Save failed</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={downloadCsv}>
                <Download className="h-4 w-4 mr-1" /> Download CSV
              </Button>
              <Button size="sm" variant="outline" onClick={printScoresheet}>
                <Printer className="h-4 w-4 mr-1" /> Print A4
              </Button>
            </div>
          </div>

          {locked && (
            <p className="text-xs text-amber-600">
              Editing previous school-year records is disabled in Settings.
            </p>
          )}

          <div className="overflow-x-auto border rounded-md">
            <table className="text-sm border-collapse min-w-full">
              <thead>
                <tr className="bg-muted/60">
                  <th className="border px-3 py-2 text-left min-w-52 sticky left-0 bg-muted z-10">
                    Name of Pupil
                  </th>
                  <th className="border px-2 py-2 text-center w-12">Gender</th>
                  {items.map((it, i) => (
                    <th
                      key={it.id}
                      className="border px-1 py-2 text-center whitespace-nowrap"
                      title={it.question_text ?? undefined}
                    >
                      {taskLabel(it, i)}
                      <div className="text-[10px] font-normal text-muted-foreground">
                        ({Number(it.max_score)})
                      </div>
                    </th>
                  ))}
                  <th className="border px-2 py-2 text-center w-16">Total</th>
                  <th className="border px-2 py-2 text-center w-14">%</th>
                  <th className="border px-2 py-2 text-center w-40">
                    Levelling of Learners
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 && (
                  <tr>
                    <td
                      colSpan={columnCount}
                      className="border px-3 py-6 text-center text-muted-foreground"
                    >
                      No pupils yet — add students to this section first.
                    </td>
                  </tr>
                )}
                {maleGroup.length > 0 && (
                  <>
                    {genderHeaderRow("MALE", "male", maleGroup.length)}
                    {maleGroup.map((s, i) => renderStudentRow(s, i + 1))}
                  </>
                )}
                {femaleGroup.length > 0 && (
                  <>
                    {genderHeaderRow("FEMALE", "female", femaleGroup.length)}
                    {femaleGroup.map((s, i) => renderStudentRow(s, i + 1))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* RMA Levelling Summary */}
          {summary && (
            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-sm font-semibold">
                RMA Levelling Summary
              </div>
              <div className="overflow-x-auto">
                <table className="text-sm border-collapse w-full">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="border px-3 py-1.5 text-left">Indicator</th>
                      <th className="border px-3 py-1.5 text-center w-24">Male</th>
                      <th className="border px-3 py-1.5 text-center w-24">
                        Female
                      </th>
                      <th className="border px-3 py-1.5 text-center w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["Enrolment", "enrolment"],
                        ["Learners Assessed", "assessed"],
                        ["For Intervention", "intervention"],
                        ["For Consolidation", "consolidation"],
                        ["For Enhancement", "enhancement"],
                      ] as const
                    ).map(([label, key]) => (
                      <tr key={key} className="hover:bg-muted/20">
                        <td className="border px-3 py-1.5">{label}</td>
                        <td className="border px-3 py-1.5 text-center">
                          {summary.male[key]}
                        </td>
                        <td className="border px-3 py-1.5 text-center">
                          {summary.female[key]}
                        </td>
                        <td className="border px-3 py-1.5 text-center font-semibold">
                          {summary.total[key]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
