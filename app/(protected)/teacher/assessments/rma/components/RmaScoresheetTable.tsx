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
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { ASSESSMENT_PHASES, getGradeLevelLabel } from "@/lib/constants";
import { generateRmaItemSheet } from "@/lib/pdf/generateRmaItemSheet";
import { generateRmaScoresheet } from "@/lib/pdf/generateRmaScoresheet";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { RmaBand, RmaItem, RmaMaterial, Student } from "@/types";
import { Loader2, Printer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { AdviserSection } from "../page";
import {
  hasAnyScore,
  masteryForScore,
  maxTotal,
  RmaScoreMap,
  totalScore,
} from "../rmaUtils";

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
  focusStudentId?: string;
}

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
  const [phase, setPhase] = useState<string>("BoSY");
  const [materials, setMaterials] = useState<RmaMaterial[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
  const [items, setItems] = useState<RmaItem[]>([]);
  const [bands, setBands] = useState<RmaBand[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<RmaScoreMap>({});
  const [meta, setMeta] = useState<Record<string, RecordMeta>>({});
  const [loading, setLoading] = useState(false);

  const scoresRef = useRef<RmaScoreMap>({});
  const metaRef = useRef<Record<string, RecordMeta>>({});
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);

  const fullUser = useAppSelector((state) => state.user.user);
  const { settings } = useSchoolSettings(true, fullUser?.school_id);
  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const locked = isPreviousYear && !settings.allow_edit_previous_school_year;

  const section = sections.find((s) => s.id === selectedSection) || null;
  const material =
    materials.find((m) => String(m.id) === selectedMaterialId) || null;
  const itemsMaxTotal = maxTotal(items);

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
    if (!section || !material) {
      setItems([]);
      setBands([]);
      setStudents([]);
      setScores({});
      setMeta({});
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
    setMeta(nextMeta);
    scoresRef.current = nextScores;
    metaRef.current = nextMeta;
    setLoading(false);
  }, [section, material, phase, schoolYear]);

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
    // Scope the record to the section's own school (matters for super admins,
    // who may be recording against another school's section).
    const recordSchoolId = section ? Number(section.school_id) : schoolId;
    if (!recordSchoolId || !material || !section) {
      toast.error("This section has no school assigned.");
      return null;
    }
    const { data, error } = await supabase
      .from("sms_rma_records")
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

  const persistScore = async (studentId: string, itemId: string) => {
    if (locked) return;
    const recordId = await ensureRecord(studentId);
    if (!recordId) return;
    const raw = scoresRef.current[studentId]?.[itemId];
    const { error } = await supabase.from("sms_rma_item_scores").upsert(
      {
        record_id: Number(recordId),
        item_id: Number(itemId),
        raw_score: raw === undefined ? null : raw,
      },
      { onConflict: "record_id,item_id" },
    );
    if (error) {
      toast.error("Failed to save score.");
      return;
    }
    await persistTotals(studentId, recordId);
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
      .from("sms_rma_records")
      .update({ [field]: value })
      .eq("id", recordId);
    if (error) toast.error("Failed to save.");
  };

  const printItemSheet = () => {
    if (!material) return;
    generateRmaItemSheet({
      schoolId: section ? Number(section.school_id) : schoolId,
      material,
      items,
    }).catch(() => toast.error("Failed to generate item sheet."));
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
                  {s.school_name ? ` · ${s.school_name}` : ""}
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
            <div className="text-sm">
              <span className="font-semibold">{material.title}</span>
              <span className="text-muted-foreground">
                {" "}
                · {items.length} items · total {itemsMaxTotal} · {phase}
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={printItemSheet}>
                <Printer className="h-4 w-4 mr-1" /> Item Sheet
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
              const ss = scores[s.id] || {};
              if (!hasAnyScore(items, ss)) return;
              const label = masteryForScore(
                bands,
                totalScore(items, ss),
                itemsMaxTotal,
              );
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
                  <th className="border px-3 py-2 text-left min-w-52 sticky left-0 bg-muted/60 z-10">
                    Learners&apos; Names
                  </th>
                  {items.map((it, i) => (
                    <th
                      key={it.id}
                      className="border px-1 py-2 text-center w-12"
                      title={it.domain ?? undefined}
                    >
                      {i + 1}
                      <div className="text-[10px] font-normal text-muted-foreground">
                        ({Number(it.max_score)})
                      </div>
                    </th>
                  ))}
                  <th className="border px-2 py-2 text-center w-16">Total</th>
                  <th className="border px-2 py-2 text-center w-40">Mastery</th>
                  <th className="border px-2 py-2 text-center w-36">Date</th>
                  <th className="border px-2 py-2 text-center w-44">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => {
                  const studentScores = scores[s.id] || {};
                  const anyScore = hasAnyScore(items, studentScores);
                  const total = totalScore(items, studentScores);
                  const mastery = anyScore
                    ? masteryForScore(bands, total, itemsMaxTotal)
                    : null;
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
                      {items.map((it) => {
                        const v = studentScores[it.id];
                        return (
                          <td key={it.id} className="border p-0">
                            <Input
                              type="number"
                              min={0}
                              max={Number(it.max_score)}
                              className="h-8 w-12 rounded-none border-0 text-center px-0"
                              value={v === undefined || v === null ? "" : v}
                              disabled={locked}
                              onChange={(e) =>
                                setLocalScore(s.id, it.id, e.target.value)
                              }
                              onBlur={() => persistScore(s.id, it.id)}
                              onWheel={(e) => e.currentTarget.blur()}
                            />
                          </td>
                        );
                      })}
                      <td className="border px-2 py-1 text-center font-semibold">
                        {anyScore ? total : "-"}
                      </td>
                      <td className="border px-2 py-1 text-center text-xs">
                        {mastery ?? "-"}
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
                          className="h-8 w-44 rounded-none border-0 px-2"
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
                      colSpan={items.length + 4}
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
