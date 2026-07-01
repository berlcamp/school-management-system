"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { ClassRecord, ClassRecordComponent, ClassRecordItem, Student } from "@/types";
import {
  ArrowDownAZ,
  CheckCircle2,
  Loader2,
  Plus,
  Printer,
  X,
  XCircle,
} from "lucide-react";
import { generateClassRecordPrint } from "@/lib/pdf/generateClassRecord";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ClassRecordSubjectOption } from "../page";
import { ClassRecordItemModal } from "./ClassRecordItemModal";
import { FinalGradeView } from "./FinalGradeView";
import {
  COMPONENTS,
  componentMaxTotal,
  componentPS,
  componentRawTotal,
  componentWS,
  descriptor,
  initialGrade,
  itemsOf,
  termGrade,
  weightOf,
  weightsValid,
} from "./classRecordUtils";

type ItemModalState =
  | { mode: "add"; component: ClassRecordComponent }
  | { mode: "edit"; item: ClassRecordItem };

type RemoveTarget = { component: ClassRecordComponent; item: ClassRecordItem };

interface ClassRecordTableProps {
  schoolYear: string;
  setSchoolYear: (value: string) => void;
  schoolYearOptions: string[];
  subjects: ClassRecordSubjectOption[];
  selectedSubject: string;
  setSelectedSubject: (value: string) => void;
  teacherId: number;
  schoolId: number | null;
}

type ScoreMap = Record<string, Record<string, number | null>>; // studentId -> itemId -> score

const TERMS = [
  { value: 1, label: "1st Term" },
  { value: 2, label: "2nd Term" },
  { value: 3, label: "3rd Term" },
] as const;

export function ClassRecordTable({
  schoolYear,
  setSchoolYear,
  schoolYearOptions,
  subjects,
  selectedSubject,
  setSelectedSubject,
  teacherId,
  schoolId,
}: ClassRecordTableProps) {
  const [subjectId, sectionId] = selectedSubject
    ? selectedSubject.split("_")
    : ["", ""];

  const [term, setTerm] = useState<number>(1);
  const [view, setView] = useState<"term" | "final">("term");
  const [record, setRecord] = useState<ClassRecord | null>(null);
  const [items, setItems] = useState<ClassRecordItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<ScoreMap>({});
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [validating, setValidating] = useState(true);
  const [itemModal, setItemModal] = useState<ItemModalState | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [removing, setRemoving] = useState(false);

  const fullUser = useAppSelector((state) => state.user.user);
  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const { settings } = useSchoolSettings(true, fullUser?.school_id);
  const locked = isPreviousYear && !settings.allow_edit_previous_school_year;

  const postTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- data loading -------------------------------------------------------
  const validateAssignment = useCallback(async (): Promise<boolean> => {
    if (!sectionId || !subjectId || !teacherId || !schoolYear) return false;
    const { data } = await supabase
      .from("sms_subject_schedules")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("subject_id", subjectId)
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .maybeSingle();
    if (data) return true;
    const { data: section } = await supabase
      .from("sms_sections")
      .select("section_adviser_id")
      .eq("id", sectionId)
      .eq("section_adviser_id", teacherId)
      .eq("school_year", schoolYear)
      .maybeSingle();
    return !!section;
  }, [sectionId, subjectId, teacherId, schoolYear]);

  const ensureRecord = useCallback(async (): Promise<ClassRecord | null> => {
    if (!schoolId) {
      toast.error("Your account has no school assigned.");
      return null;
    }
    const { data: existing } = await supabase
      .from("sms_class_records")
      .select("*")
      .eq("subject_id", subjectId)
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .eq("grading_period", term)
      .maybeSingle();
    if (existing) return existing as ClassRecord;

    const { data: created, error } = await supabase
      .from("sms_class_records")
      .insert({
        school_id: schoolId,
        teacher_id: teacherId,
        subject_id: Number(subjectId),
        section_id: Number(sectionId),
        school_year: schoolYear,
        grading_period: term,
      })
      .select()
      .single();
    if (error) {
      console.error(error);
      toast.error("Could not open class record.");
      return null;
    }
    return created as ClassRecord;
  }, [schoolId, subjectId, sectionId, schoolYear, term, teacherId]);

  const loadStudents = useCallback(
    async (isMadrasah: boolean): Promise<Student[]> => {
      let studentIds: string[] = [];
      if (isMadrasah) {
        const { data } = await supabase
          .from("sms_student_subjects")
          .select("student_id")
          .eq("subject_id", subjectId)
          .eq("section_id", sectionId)
          .eq("school_year", schoolYear);
        studentIds = (data || []).map((d) => String(d.student_id));
      } else {
        const { data } = await supabase
          .from("sms_enrollments")
          .select("student_id, enrollment_status")
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
        studentIds = (data || []).map((d) => String(d.student_id));
      }
      if (studentIds.length === 0) return [];
      const { data: studentRows } = await supabase
        .from("sms_students")
        .select("*")
        .in("id", studentIds)
        .order("last_name")
        .order("first_name");
      return (studentRows || []) as Student[];
    },
    [subjectId, sectionId, schoolYear]
  );

  const loadScores = useCallback(
    async (itemRows: ClassRecordItem[], studentRows: Student[]) => {
      const itemIds = itemRows.map((i) => i.id);
      const map: ScoreMap = {};
      studentRows.forEach((s) => (map[s.id] = {}));
      if (itemIds.length > 0) {
        const { data } = await supabase
          .from("sms_class_record_scores")
          .select("item_id, student_id, raw_score")
          .in("item_id", itemIds);
        (data || []).forEach((row) => {
          const sid = String(row.student_id);
          if (!map[sid]) map[sid] = {};
          map[sid][String(row.item_id)] =
            row.raw_score === null ? null : Number(row.raw_score);
        });
      }
      setScores(map);
    },
    []
  );

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!sectionId || !subjectId) {
        setIsValid(false);
        setValidating(false);
        return;
      }
      setValidating(true);
      setLoading(true);
      setRecord(null);
      setItems([]);
      setStudents([]);
      setScores({});

      const valid = await validateAssignment();
      if (!mounted) return;
      setIsValid(valid);
      setValidating(false);
      if (!valid) {
        setLoading(false);
        return;
      }

      const rec = await ensureRecord();
      if (!mounted || !rec) {
        setLoading(false);
        return;
      }
      setRecord(rec);

      const { data: itemRows } = await supabase
        .from("sms_class_record_items")
        .select("*")
        .eq("class_record_id", rec.id)
        .order("component")
        .order("position");
      const isMadrasah =
        subjects.find((s) => s.id === subjectId && s.section_id === sectionId)
          ?.is_madrasah ?? false;
      const studentRows = await loadStudents(isMadrasah);
      if (!mounted) return;
      setItems((itemRows || []) as ClassRecordItem[]);
      setStudents(studentRows);
      await loadScores((itemRows || []) as ClassRecordItem[], studentRows);
      if (mounted) setLoading(false);
    };
    run();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject, schoolYear, term]);

  // ----- mutations ----------------------------------------------------------
  const schedulePost = useCallback(() => {
    if (!record) return;
    if (postTimer.current) clearTimeout(postTimer.current);
    postTimer.current = setTimeout(() => postGrades(record.id, true), 1500);
  }, [record]);

  const patchRecord = async (fields: Partial<ClassRecord>) => {
    if (!record) return;
    setRecord({ ...record, ...fields });
    const { error } = await supabase
      .from("sms_class_records")
      .update(fields)
      .eq("id", record.id);
    if (error) toast.error("Failed to save record settings.");
  };

  const addItem = async (
    component: ClassRecordComponent,
    values: { label: string; max_score: number }
  ): Promise<boolean> => {
    if (!record || locked) return false;
    const position = itemsOf(items, component).length;
    const { data, error } = await supabase
      .from("sms_class_record_items")
      .insert({
        class_record_id: Number(record.id),
        component,
        max_score: values.max_score,
        label: values.label || null,
        position,
      })
      .select()
      .single();
    if (error || !data) {
      toast.error("Failed to add item.");
      return false;
    }
    setItems((prev) => [...prev, data as ClassRecordItem]);
    schedulePost();
    return true;
  };

  const requestRemoveItem = (item: ClassRecordItem) => {
    if (!record || locked) return;
    setRemoveTarget({ component: item.component, item });
  };

  const confirmRemoveItem = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    const { error } = await supabase
      .from("sms_class_record_items")
      .delete()
      .eq("id", removeTarget.item.id);
    setRemoving(false);
    if (error) {
      toast.error("Failed to remove item.");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== removeTarget.item.id));
    setRemoveTarget(null);
    schedulePost();
  };

  const patchItem = async (
    id: string,
    fields: Partial<ClassRecordItem>
  ): Promise<boolean> => {
    const prevItems = items;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...fields } : i)));
    const { error } = await supabase
      .from("sms_class_record_items")
      .update(fields)
      .eq("id", id);
    if (error) {
      toast.error("Failed to save item.");
      setItems(prevItems);
      return false;
    }
    if ("max_score" in fields) schedulePost();
    return true;
  };

  const handleItemModalSave = async (values: {
    label: string;
    max_score: number;
  }): Promise<boolean> => {
    if (!itemModal) return false;
    if (itemModal.mode === "add") {
      return addItem(itemModal.component, values);
    }
    return patchItem(itemModal.item.id, {
      label: values.label || null,
      max_score: values.max_score,
    });
  };

  const setLocalScore = (studentId: string, itemId: string, value: string) => {
    setScores((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [itemId]: value === "" ? null : Number(value),
      },
    }));
  };

  const persistScore = async (studentId: string, itemId: string) => {
    if (locked) return;
    const raw = scores[studentId]?.[itemId];
    const { error } = await supabase.from("sms_class_record_scores").upsert(
      {
        item_id: Number(itemId),
        student_id: Number(studentId),
        raw_score: raw === undefined ? null : raw,
      },
      { onConflict: "item_id,student_id" }
    );
    if (error) {
      toast.error("Failed to save score.");
      return;
    }
    schedulePost();
  };

  const postGrades = async (recordId: string, silent = false) => {
    setPosting(true);
    const { data, error } = await supabase.rpc("post_class_record_grades", {
      p_class_record_id: Number(recordId),
    });
    setPosting(false);
    if (error) {
      if (!silent) toast.error("Failed to post grades.");
      console.error(error);
      return;
    }
    if (!silent) toast.success(`Posted ${data ?? 0} learner grade(s).`);
  };

  const handlePrint = () => {
    if (!record) return;
    const subj = subjects.find(
      (s) => s.id === subjectId && s.section_id === sectionId
    );
    generateClassRecordPrint({
      schoolId,
      subjectName: subj?.name ?? "",
      sectionName: subj?.section_name ?? "",
      schoolYear,
      termLabel: TERMS.find((t) => t.value === term)?.label ?? "",
      teacherName: fullUser?.name ?? "",
      record,
      items,
      students,
      scores,
    }).catch(() => toast.error("Failed to generate printout."));
  };

  const sortByName = (gender: "male" | "female") => {
    setStudents((prev) => {
      const group = prev
        .filter((s) => s.gender === gender)
        .sort((a, b) =>
          `${a.last_name}${a.first_name}`.localeCompare(
            `${b.last_name}${b.first_name}`
          )
        );
      const others = prev.filter((s) => s.gender !== gender);
      return gender === "male" ? [...group, ...others] : [...others, ...group];
    });
  };

  // ----- render helpers -----------------------------------------------------
  const males = students.filter((s) => s.gender === "male");
  const females = students.filter((s) => s.gender === "female");
  const totalCols =
    1 + // names
    COMPONENTS.reduce((n, c) => n + itemsOf(items, c.key).length + 3, 0) +
    3; // initial, term, descriptor

  if (validating) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <div className="flex flex-wrap gap-3">
        <div className="w-48">
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
        <div className="min-w-64">
          <label className="text-sm font-medium mb-1.5 block">
            Subject &amp; Section
          </label>
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger>
              <SelectValue placeholder="Select subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={`${s.id}_${s.section_id}`} value={`${s.id}_${s.section_id}`}>
                  {s.name} — {s.section_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedSubject && (
        <p className="text-sm text-muted-foreground py-6">
          Select a subject and section to open its class record.
        </p>
      )}

      {selectedSubject && !isValid && (
        <p className="text-sm text-red-600 py-6">
          You are not assigned to this subject/section for {schoolYear}.
        </p>
      )}

      {selectedSubject && isValid && record && (
        <>
          {/* Term bar */}
          <div className="flex flex-wrap items-end gap-2 border-b pb-3">
            {TERMS.map((t) => (
              <button
                key={t.value}
                onClick={() => {
                  setView("term");
                  setTerm(t.value);
                }}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  view === "term" && term === t.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-muted/70"
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={() => setView("final")}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                view === "final"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-muted/70"
              }`}
            >
              Final Grade
            </button>

            {view === "term" && (
              <>
                <div className="ml-2 flex items-end gap-2">
                  <div>
                    <label className="text-[11px] text-muted-foreground block">
                      Start
                    </label>
                    <Input
                      type="date"
                      className="h-9 w-40"
                      value={record.term_start ?? ""}
                      disabled={locked}
                      onChange={(e) =>
                        patchRecord({ term_start: e.target.value || null })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block">
                      End
                    </label>
                    <Input
                      type="date"
                      className="h-9 w-40"
                      value={record.term_end ?? ""}
                      disabled={locked}
                      onChange={(e) =>
                        patchRecord({ term_end: e.target.value || null })
                      }
                    />
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={record.use_transmutation}
                      disabled={locked}
                      onChange={(e) =>
                        patchRecord({ use_transmutation: e.target.checked })
                      }
                    />
                    Transmute
                  </label>
                  {weightsValid(record) ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Weights: 100%
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Weights:{" "}
                      {weightOf(record, "WW") +
                        weightOf(record, "PT") +
                        weightOf(record, "ST")}
                      %
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => postGrades(record.id)}
                    disabled={posting || locked || !weightsValid(record)}
                  >
                    {posting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : null}
                    Post Grades
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePrint}
                  >
                    <Printer className="h-4 w-4 mr-1" /> Print A4
                  </Button>
                </div>
              </>
            )}
          </div>

          {locked && (
            <p className="text-xs text-amber-600">
              Editing previous school-year records is disabled in Settings.
            </p>
          )}

          {view === "final" ? (
            <FinalGradeView
              subjectId={subjectId}
              sectionId={sectionId}
              schoolYear={schoolYear}
              students={students}
            />
          ) : loading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading class record…
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-md">
              <table className="text-sm border-collapse min-w-full">
                <thead>
                  {/* Component group headers */}
                  <tr className="bg-muted/60">
                    <th
                      rowSpan={3}
                      className="border px-3 py-2 text-left align-bottom min-w-56 sticky left-0 bg-muted/60 z-10"
                    >
                      Learners&apos; Names
                    </th>
                    {COMPONENTS.map((c) => {
                      const span = itemsOf(items, c.key).length + 3;
                      return (
                        <th
                          key={c.key}
                          colSpan={span}
                          className="border px-2 py-1.5 text-center"
                        >
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <span className="font-semibold">{c.title}</span>
                            <Input
                              type="number"
                              className="h-7 w-16 text-center"
                              value={weightOf(record, c.key)}
                              disabled={locked}
                              onChange={(e) =>
                                patchRecord({
                                  [c.weightField]: Number(e.target.value || 0),
                                } as Partial<ClassRecord>)
                              }
                            />
                            <span className="text-xs">%</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7"
                              disabled={locked}
                              onClick={() => setItemModal({ mode: "add", component: c.key })}
                            >
                              <Plus className="h-3.5 w-3.5" /> Add item
                            </Button>
                          </div>
                        </th>
                      );
                    })}
                    <th rowSpan={3} className="border px-2 py-2 text-center align-bottom w-20">
                      Initial Grade
                    </th>
                    <th rowSpan={3} className="border px-2 py-2 text-center align-bottom w-20 text-green-700">
                      Term Grade
                    </th>
                    <th rowSpan={3} className="border px-2 py-2 text-center align-bottom w-32">
                      Descriptor
                    </th>
                  </tr>

                  {/* Column index + remove item + TOTAL/PS/WS */}
                  <tr className="bg-muted/40 text-xs">
                    {COMPONENTS.map((c) => (
                      <FragmentCols
                        key={c.key}
                        colItems={itemsOf(items, c.key)}
                        locked={locked}
                        onRemove={requestRemoveItem}
                      />
                    ))}
                  </tr>

                  {/* Activity title (click to edit via modal) */}
                  <tr className="text-xs">
                    {COMPONENTS.map((c) => {
                      const colItems = itemsOf(items, c.key);
                      return (
                        <FragmentTitle
                          key={c.key}
                          colItems={colItems}
                          locked={locked}
                          onEdit={(item) => setItemModal({ mode: "edit", item })}
                        />
                      );
                    })}
                  </tr>

                  {/* Highest Possible Score */}
                  <tr className="bg-muted/30 text-xs">
                    <th className="border px-3 py-1 text-right italic font-normal sticky left-0 bg-muted/30 z-10">
                      Highest Possible Score
                    </th>
                    {COMPONENTS.map((c) => {
                      const colItems = itemsOf(items, c.key);
                      const maxTotal = componentMaxTotal(items, c.key);
                      return (
                        <FragmentHps
                          key={c.key}
                          colItems={colItems}
                          maxTotal={maxTotal}
                          weight={weightOf(record, c.key)}
                        />
                      );
                    })}
                    <th className="border px-2 py-1 text-center">100</th>
                    <th className="border px-2 py-1 text-center text-green-700">100</th>
                    <th className="border px-2 py-1" />
                  </tr>
                </thead>

                <tbody>
                  <GenderHeader
                    label="MALE"
                    cols={totalCols}
                    onSort={() => sortByName("male")}
                  />
                  {males.map((s, idx) => (
                    <LearnerRow
                      key={s.id}
                      index={idx + 1}
                      student={s}
                      items={items}
                      record={record}
                      studentScores={scores[s.id] || {}}
                      locked={locked}
                      onScore={setLocalScore}
                      onScoreCommit={persistScore}
                    />
                  ))}
                  <GenderHeader
                    label="FEMALE"
                    cols={totalCols}
                    onSort={() => sortByName("female")}
                  />
                  {females.map((s, idx) => (
                    <LearnerRow
                      key={s.id}
                      index={idx + 1}
                      student={s}
                      items={items}
                      record={record}
                      studentScores={scores[s.id] || {}}
                      locked={locked}
                      onScore={setLocalScore}
                      onScoreCommit={persistScore}
                    />
                  ))}
                  {students.length === 0 && (
                    <tr>
                      <td
                        colSpan={totalCols}
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

      <ClassRecordItemModal
        open={!!itemModal}
        onOpenChange={(open) => {
          if (!open) setItemModal(null);
        }}
        mode={itemModal?.mode ?? "add"}
        componentTitle={
          COMPONENTS.find(
            (c) =>
              c.key ===
              (itemModal?.mode === "add" ? itemModal.component : itemModal?.item.component)
          )?.title ?? ""
        }
        initialLabel={itemModal?.mode === "edit" ? itemModal.item.label : ""}
        initialMaxScore={
          itemModal?.mode === "edit" ? Number(itemModal.item.max_score) : 10
        }
        onSave={handleItemModalSave}
      />

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title="Remove item?"
        description={
          removeTarget &&
          students.some((s) => {
            const v = scores[s.id]?.[removeTarget.item.id];
            return v !== undefined && v !== null;
          })
            ? `"${removeTarget.item.label || "Untitled item"}" already has recorded scores for one or more learners. Removing it will permanently delete those scores.`
            : `Remove "${removeTarget?.item.label || "Untitled item"}"? This cannot be undone.`
        }
        confirmText="Remove"
        variant="destructive"
        onConfirm={confirmRemoveItem}
        loading={removing}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------
function FragmentCols({
  colItems,
  locked,
  onRemove,
}: {
  colItems: ClassRecordItem[];
  locked: boolean;
  onRemove: (item: ClassRecordItem) => void;
}) {
  return (
    <>
      {colItems.map((it, i) => (
        <th key={it.id} className="border px-1 py-1 text-center w-12">
          <div className="flex items-center justify-center gap-1">
            <span>{i + 1}</span>
            <button
              type="button"
              onClick={() => onRemove(it)}
              disabled={locked}
              title="Remove item"
              className="text-muted-foreground hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </th>
      ))}
      <th className="border px-2 py-1 text-center w-14">TOTAL</th>
      <th className="border px-2 py-1 text-center w-12">PS</th>
      <th className="border px-2 py-1 text-center w-12">WS</th>
    </>
  );
}

function FragmentTitle({
  colItems,
  locked,
  onEdit,
}: {
  colItems: ClassRecordItem[];
  locked: boolean;
  onEdit: (item: ClassRecordItem) => void;
}) {
  return (
    <>
      {colItems.map((it) => (
        <th key={it.id} className="border p-0 align-bottom w-9">
          <button
            type="button"
            onClick={() => onEdit(it)}
            disabled={locked}
            title={it.label ? `${it.label} — click to edit` : "Untitled item — click to edit"}
            className="flex h-24 w-full items-center justify-center overflow-hidden whitespace-nowrap px-0.5 py-1.5 text-[11px] font-medium [writing-mode:vertical-rl] rotate-180 hover:bg-muted/60 disabled:hover:bg-transparent"
          >
            {it.label || "Untitled"}
          </button>
        </th>
      ))}
      <th className="border" />
      <th className="border" />
      <th className="border" />
    </>
  );
}

function FragmentHps({
  colItems,
  maxTotal,
  weight,
}: {
  colItems: ClassRecordItem[];
  maxTotal: number;
  weight: number;
}) {
  return (
    <>
      {colItems.map((it) => (
        <th key={it.id} className="border px-1 py-1 text-center text-[11px] font-normal">
          {Number(it.max_score)}
        </th>
      ))}
      <th className="border px-2 py-1 text-center">{maxTotal}</th>
      <th className="border px-2 py-1 text-center">100</th>
      <th className="border px-2 py-1 text-center">{weight}%</th>
    </>
  );
}

function GenderHeader({
  label,
  cols,
  onSort,
}: {
  label: string;
  cols: number;
  onSort: () => void;
}) {
  return (
    <tr className="bg-muted/50">
      <td colSpan={cols} className="border px-3 py-1.5 font-semibold">
        <div className="flex items-center gap-3">
          {label}
          <button
            onClick={onSort}
            className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            <ArrowDownAZ className="h-3.5 w-3.5" /> Sort A-Z
          </button>
        </div>
      </td>
    </tr>
  );
}

function LearnerRow({
  index,
  student,
  items,
  record,
  studentScores,
  locked,
  onScore,
  onScoreCommit,
}: {
  index: number;
  student: Student;
  items: ClassRecordItem[];
  record: ClassRecord;
  studentScores: Record<string, number | null>;
  locked: boolean;
  onScore: (studentId: string, itemId: string, value: string) => void;
  onScoreCommit: (studentId: string, itemId: string) => void;
}) {
  const initial = initialGrade(record, items, studentScores);
  const term = termGrade(record, items, studentScores);
  const hasAnyScore = items.some(
    (i) => studentScores[i.id] !== undefined && studentScores[i.id] !== null
  );

  return (
    <tr className="hover:bg-muted/30">
      <td className="border px-3 py-1.5 sticky left-0 bg-background z-10 whitespace-nowrap">
        <span className="text-muted-foreground mr-1">{index}.</span>
        {student.last_name}, {student.first_name}
        <span className="ml-2 font-mono text-[10px] text-muted-foreground">
          {formatLrn(student.lrn)}
        </span>
      </td>

      {COMPONENTS.map((c) => {
        const colItems = itemsOf(items, c.key);
        const ps = componentPS(items, c.key, studentScores);
        const ws = componentWS(record, items, c.key, studentScores);
        const rawTotal = componentRawTotal(items, c.key, studentScores);
        return (
          <FragmentScoreCells
            key={c.key}
            colItems={colItems}
            studentId={student.id}
            studentScores={studentScores}
            locked={locked}
            rawTotal={colItems.length ? rawTotal : null}
            ps={ps}
            ws={ws}
            onScore={onScore}
            onScoreCommit={onScoreCommit}
          />
        );
      })}

      <td className="border px-2 py-1 text-center">
        {hasAnyScore ? initial.toFixed(2) : "-"}
      </td>
      <td className="border px-2 py-1 text-center font-semibold text-green-700">
        {hasAnyScore ? term : "-"}
      </td>
      <td className="border px-2 py-1 text-center text-xs">
        {hasAnyScore ? descriptor(term) : "-"}
      </td>
    </tr>
  );
}

function FragmentScoreCells({
  colItems,
  studentId,
  studentScores,
  locked,
  rawTotal,
  ps,
  ws,
  onScore,
  onScoreCommit,
}: {
  colItems: ClassRecordItem[];
  studentId: string;
  studentScores: Record<string, number | null>;
  locked: boolean;
  rawTotal: number | null;
  ps: number | null;
  ws: number | null;
  onScore: (studentId: string, itemId: string, value: string) => void;
  onScoreCommit: (studentId: string, itemId: string) => void;
}) {
  return (
    <>
      {colItems.map((it) => {
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
              onChange={(e) => onScore(studentId, it.id, e.target.value)}
              onBlur={() => onScoreCommit(studentId, it.id)}
              onWheel={(e) => e.currentTarget.blur()}
            />
          </td>
        );
      })}
      <td className="border px-2 py-1 text-center">{rawTotal ?? "-"}</td>
      <td className="border px-2 py-1 text-center">{ps === null ? "-" : ps.toFixed(0)}</td>
      <td className="border px-2 py-1 text-center">{ws === null ? "-" : ws.toFixed(2)}</td>
    </>
  );
}
