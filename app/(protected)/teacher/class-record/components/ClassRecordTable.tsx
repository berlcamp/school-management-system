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
import {
  ClassRecord,
  ClassRecordBlockRow,
  ClassRecordComponent,
  ClassRecordItem,
  Student,
} from "@/types";
import {
  ArrowDownAZ,
  CheckCircle2,
  HelpCircle,
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
import { TransmutationInfoModal } from "./TransmutationInfoModal";
import {
  ClassRecordBlock,
  blockPS,
  blockWS,
  blocksOf,
  descriptor,
  groupBlocks,
  hasNestedBlocks,
  initialGrade,
  itemsOfBlock,
  layoutOf,
  maxTotalOf,
  rawTotalOf,
  schemeOf,
  termGrade,
  totalWeight,
  weightsValid,
} from "./classRecordUtils";
import {
  CLASS_RECORD_FORM_LAYOUTS,
  CLASS_RECORD_WEIGHT_PRESETS,
  ClassRecordFormLayout,
  DEFAULT_GRADING_SCHEME,
  alwaysTransmutes,
  blockSeedsFor,
  matchWeightPreset,
  suggestFormLayout,
  suggestWeightPreset,
} from "@/lib/constants/classRecord";

type ItemModalState =
  | { mode: "add"; block: ClassRecordBlock }
  | { mode: "edit"; item: ClassRecordItem; blockLabel: string };

type RemoveTarget = { item: ClassRecordItem };

interface ClassRecordTableProps {
  schoolYear: string;
  setSchoolYear: (value: string) => void;
  schoolYearOptions: string[];
  subjects: ClassRecordSubjectOption[];
  selectedSubject: string;
  setSelectedSubject: (value: string) => void;
  teacherId: number;
  schoolId: number | null;
  /** School heads browse any teacher's record but cannot edit or post. */
  readOnly?: boolean;
}

type ScoreMap = Record<string, Record<string, number | null>>; // studentId -> itemId -> score

const TERMS = [
  { value: 1, label: "1st Term" },
  { value: 2, label: "2nd Term" },
  { value: 3, label: "3rd Term" },
] as const;

// The fixed Examinations items — ST1 / ST2 / TE on both the old form and the
// updated one (weights editable, columns are not).
const ST_FIXED_ITEMS = [
  { label: "ST1", weight: 30 },
  { label: "ST2", weight: 30 },
  { label: "TE", weight: 40 },
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
  readOnly = false,
}: ClassRecordTableProps) {
  const [subjectId, sectionId] = selectedSubject
    ? selectedSubject.split("_")
    : ["", ""];

  const [term, setTerm] = useState<number>(1);
  const [view, setView] = useState<"term" | "final">("term");
  const [record, setRecord] = useState<ClassRecord | null>(null);
  const [items, setItems] = useState<ClassRecordItem[]>([]);
  // Empty on a standard record — its three weight columns are the blocks.
  const [blockRows, setBlockRows] = useState<ClassRecordBlockRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<ScoreMap>({});
  // Last value accepted by the database, per cell. A score that fails the
  // Highest Possible Score check is never written, so the cell falls back to
  // this rather than keeping an impossible number on screen.
  const savedScores = useRef<ScoreMap>({});
  // Same idea for an item's Highest Possible Score, which is edited inline for
  // the fixed ST columns: a rejected change has to fall back to something.
  const savedMaxScores = useRef<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [validating, setValidating] = useState(true);
  const [itemModal, setItemModal] = useState<ItemModalState | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [removing, setRemoving] = useState(false);
  const [transmuteInfoOpen, setTransmuteInfoOpen] = useState(false);
  // Bumped after the form is re-laid-out, to re-read items and blocks.
  const [reloadKey, setReloadKey] = useState(0);
  const [changingLayout, setChangingLayout] = useState(false);

  const fullUser = useAppSelector((state) => state.user.user);
  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const { settings } = useSchoolSettings(true, fullUser?.school_id);
  // `readOnly` (school head oversight) disables every mutating control just like
  // the previous-year lock does, so reuse the same `locked` gate throughout.
  const locked =
    readOnly || (isPreviousYear && !settings.allow_edit_previous_school_year);

  const postTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- data loading -------------------------------------------------------
  const validateAssignment = useCallback(async (): Promise<boolean> => {
    if (!sectionId || !subjectId || !teacherId || !schoolYear) return false;
    // Super admins can edit any section's class record (testing/oversight);
    // school heads (readOnly) may view any section without an assignment.
    if (fullUser?.type === "super admin" || readOnly) return true;
    // `.limit(1)` before `.maybeSingle()`: a subject that meets in several
    // time blocks is several `sms_subject_schedules` rows, and maybeSingle on
    // its own errors (PGRST116) on more than one — which read as "not
    // assigned" for exactly the teachers who are most assigned.
    const { data } = await supabase
      .from("sms_subject_schedules")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("subject_id", subjectId)
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .limit(1)
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
  }, [sectionId, subjectId, teacherId, schoolYear, fullUser?.type, readOnly]);

  /**
   * Lay out a freshly created — or freshly re-laid-out — record: the blocks a
   * non-standard form needs, and the fixed Examinations columns (ST1/ST2/TE),
   * which every form carries.
   */
  const seedForm = async (
    recordId: string,
    layout: ClassRecordFormLayout
  ): Promise<void> => {
    const seeds = blockSeedsFor(layout);

    if (seeds.length === 0) {
      // Standard form: the three weight columns are the blocks, so the fixed
      // Examinations columns hang off the component alone, exactly as in 081.
      await supabase.from("sms_class_record_items").insert(
        ST_FIXED_ITEMS.map((f, idx) => ({
          class_record_id: Number(recordId),
          component: "ST",
          label: f.label,
          max_score: 100,
          weight: f.weight,
          position: idx,
        }))
      );
      return;
    }

    const { data: inserted } = await supabase
      .from("sms_class_record_blocks")
      .insert(
        seeds.map((b) => ({
          class_record_id: Number(recordId),
          component: b.component,
          code: b.code,
          label: b.label,
          weight: b.weight,
          position: b.position,
        }))
      )
      .select();

    const examBlock = (inserted || []).find(
      (b) => (b as ClassRecordBlockRow).component === "ST"
    ) as ClassRecordBlockRow | undefined;

    if (examBlock) {
      await supabase.from("sms_class_record_items").insert(
        ST_FIXED_ITEMS.map((f, idx) => ({
          class_record_id: Number(recordId),
          block_id: Number(examBlock.id),
          component: "ST",
          label: f.label,
          max_score: 100,
          weight: f.weight,
          position: idx,
        }))
      );
    }
  };

  const ensureRecord = useCallback(async (): Promise<ClassRecord | null> => {
    const { data: existing } = await supabase
      .from("sms_class_records")
      .select("*")
      .eq("subject_id", subjectId)
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .eq("grading_period", term)
      .maybeSingle();
    if (existing) return existing as ClassRecord;

    // View-only browsers (school heads) never create records; a missing record
    // for the selected term simply means the teacher hasn't started it yet.
    if (readOnly) return null;

    if (!schoolId) {
      toast.error("Your account has no school assigned.");
      return null;
    }

    // The updated DepEd form weights the three components per learning area,
    // so a new record opens on the preset its subject calls for rather than on
    // one blanket 20/50/30. Only a suggestion — the weights stay editable.
    const subj = subjects.find(
      (s) => s.id === subjectId && s.section_id === sectionId
    );
    const preset = suggestWeightPreset({
      name: subj?.name ?? "",
      mapehComponent: subj?.mapeh_component ?? null,
    });

    // GMRC / Values Education prints on a six-domain form. Suggested from the
    // subject name at creation, when the record is still empty; the teacher can
    // change it in the header until a score is encoded (migration 175).
    const layout = suggestFormLayout(subj?.name ?? "");

    // `grading_scheme` is deliberately left to the column default (migration
    // 173), so which scheme a new record opens under is decided in one place.
    const { data: created, error } = await supabase
      .from("sms_class_records")
      .insert({
        school_id: schoolId,
        teacher_id: teacherId,
        subject_id: Number(subjectId),
        section_id: Number(sectionId),
        school_year: schoolYear,
        grading_period: term,
        form_layout: layout,
        ww_weight: preset.ww,
        pt_weight: preset.pt,
        st_weight: preset.st,
      })
      .select()
      .single();
    if (error) {
      console.error(error);
      toast.error("Could not open class record.");
      return null;
    }
    await seedForm(String(created.id), layout);
    return created as ClassRecord;
  }, [
    schoolId,
    subjectId,
    sectionId,
    schoolYear,
    term,
    teacherId,
    readOnly,
    subjects,
  ]);

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
      savedScores.current = map;
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
      setBlockRows([]);
      setStudents([]);
      setScores({});
      savedScores.current = {};
      savedMaxScores.current = {};

      const valid = await validateAssignment();
      if (!mounted) return;
      setIsValid(valid);
      setValidating(false);
      if (!valid) {
        setLoading(false);
        return;
      }

      const rec = await ensureRecord();
      if (!mounted) return;
      setRecord(rec);

      // A read-only viewer may open a term the teacher hasn't started, so `rec`
      // can be null. Still load the roster so the Final Grade tab works; there
      // are simply no items/scores for the empty term.
      const isMadrasah =
        subjects.find((s) => s.id === subjectId && s.section_id === sectionId)
          ?.is_madrasah ?? false;
      const studentRows = await loadStudents(isMadrasah);
      if (!mounted) return;
      setStudents(studentRows);

      if (!rec) {
        setItems([]);
        setBlockRows([]);
        setScores({});
        setLoading(false);
        return;
      }

      const [{ data: itemRows }, { data: blockData }] = await Promise.all([
        supabase
          .from("sms_class_record_items")
          .select("*")
          .eq("class_record_id", rec.id)
          .order("component")
          .order("position"),
        supabase
          .from("sms_class_record_blocks")
          .select("*")
          .eq("class_record_id", rec.id)
          .order("position"),
      ]);
      if (!mounted) return;
      setBlockRows((blockData || []) as ClassRecordBlockRow[]);
      const loadedItems = (itemRows || []) as ClassRecordItem[];
      savedMaxScores.current = Object.fromEntries(
        loadedItems.map((i) => [i.id, Number(i.max_score)])
      );
      setItems(loadedItems);
      await loadScores((itemRows || []) as ClassRecordItem[], studentRows);
      if (mounted) setLoading(false);
    };
    run();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject, schoolYear, term, reloadKey]);

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

  /**
   * A block's weight lives in a record column on the standard form and in its
   * own row otherwise — the one place the two layouts genuinely differ.
   */
  const setBlockWeight = async (block: ClassRecordBlock, value: number) => {
    if (!record || locked) return;
    if (block.id === null) {
      const field =
        block.component === "WW"
          ? "ww_weight"
          : block.component === "PT"
            ? "pt_weight"
            : "st_weight";
      await patchRecord({ [field]: value } as Partial<ClassRecord>);
      return;
    }
    const blockId = block.id;
    setBlockRows((prev) =>
      prev.map((b) => (String(b.id) === blockId ? { ...b, weight: value } : b))
    );
    const { error } = await supabase
      .from("sms_class_record_blocks")
      .update({ weight: value })
      .eq("id", blockId);
    if (error) toast.error("Failed to save weight.");
    else schedulePost();
  };

  /**
   * Move the record between forms. This rewrites its columns, so migration 175
   * refuses it once any score is encoded — the error is surfaced rather than
   * pre-empted, because the database is the one that actually knows.
   */
  const changeLayout = async (next: ClassRecordFormLayout) => {
    if (!record || locked || next === layoutOf(record)) return;
    setChangingLayout(true);
    const { error } = await supabase
      .from("sms_class_records")
      .update({ form_layout: next })
      .eq("id", record.id);
    if (error) {
      setChangingLayout(false);
      toast.error(
        error.code === "23514"
          ? error.message
          : "Failed to change the class record form."
      );
      return;
    }
    // Blocks cascade their items away; a standard record's items hang off the
    // record itself, so both have to go before the new form is laid out.
    await supabase
      .from("sms_class_record_items")
      .delete()
      .eq("class_record_id", record.id);
    await supabase
      .from("sms_class_record_blocks")
      .delete()
      .eq("class_record_id", record.id);
    await seedForm(record.id, next);
    setChangingLayout(false);
    setReloadKey((k) => k + 1);
  };

  const addItem = async (
    block: ClassRecordBlock,
    values: { label: string; max_score: number }
  ): Promise<boolean> => {
    if (!record || locked) return false;
    const position = itemsOfBlock(items, block).length;
    const { data, error } = await supabase
      .from("sms_class_record_items")
      .insert({
        class_record_id: Number(record.id),
        // NULL on a standard record, where `component` alone places the column.
        block_id: block.id === null ? null : Number(block.id),
        component: block.component,
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
    const added = data as ClassRecordItem;
    savedMaxScores.current[added.id] = Number(added.max_score);
    setItems((prev) => [...prev, added]);
    schedulePost();
    return true;
  };

  const requestRemoveItem = (item: ClassRecordItem) => {
    if (!record || locked) return;
    setRemoveTarget({ item });
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
    if (fields.max_score !== undefined) {
      savedMaxScores.current[id] = Number(fields.max_score);
    }
    if ("max_score" in fields || "weight" in fields) schedulePost();
    return true;
  };

  // Inline editing for fixed ST items (weight + HPS): optimistic on change,
  // persist on blur. Mirrors the score cell change/commit pattern.
  const setLocalItem = (id: string, fields: Partial<ClassRecordItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...fields } : i)));
  };

  /** Put an inline HPS cell back to the value the database last accepted. */
  const revertItemMax = (id: string) => {
    const saved = savedMaxScores.current[id];
    if (saved !== undefined) setLocalItem(id, { max_score: saved });
  };

  /** Highest score any learner already holds for an item, or null if none. */
  const highestEnteredScore = (itemId: string): number | null => {
    let highest: number | null = null;
    Object.values(scores).forEach((row) => {
      const v = row?.[itemId];
      if (v === null || v === undefined) return;
      if (highest === null || v > highest) highest = v;
    });
    return highest;
  };

  const commitItemField = async (
    id: string,
    field: "weight" | "max_score",
    value: number
  ) => {
    if (locked) return;
    if (field === "max_score") {
      if (!value || value <= 0) return; // HPS must be > 0
      // The other way into score > HPS: leave the scores alone and pull the
      // ceiling down under them.
      const highest = highestEnteredScore(id);
      if (highest !== null && value < highest) {
        toast.error(
          `A learner already scored ${highest} on this item — lower those scores before setting the highest possible score to ${value}.`
        );
        revertItemMax(id);
        return;
      }
    }
    const { error } = await supabase
      .from("sms_class_record_items")
      .update({ [field]: value })
      .eq("id", id);
    if (error) {
      toast.error(error.code === "23514" ? error.message : "Failed to save item.");
      if (field === "max_score") revertItemMax(id);
      return;
    }
    if (field === "max_score") savedMaxScores.current[id] = value;
    schedulePost();
  };

  const handleItemModalSave = async (values: {
    label: string;
    max_score: number;
  }): Promise<boolean> => {
    if (!itemModal) return false;
    if (itemModal.mode === "add") {
      return addItem(itemModal.block, values);
    }
    const highest = highestEnteredScore(itemModal.item.id);
    if (highest !== null && values.max_score < highest) {
      toast.error(
        `A learner already scored ${highest} on this item — lower those scores before setting the highest possible score to ${values.max_score}.`
      );
      return false;
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

  /** Put a cell back to the value the database last accepted. */
  const revertScore = (studentId: string, itemId: string) => {
    const saved = savedScores.current[studentId]?.[itemId] ?? null;
    setScores((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [itemId]: saved },
    }));
  };

  const persistScore = async (studentId: string, itemId: string) => {
    if (locked) return;
    const raw = scores[studentId]?.[itemId];
    const value = raw === undefined ? null : raw;

    // A raw score above the item's Highest Possible Score pushes the whole
    // component over 100% (PS = SUM(raw)/SUM(max) × 100), and the inflated
    // Weighted Score then lands in the Initial and Term Grade. `max` on a
    // number input only governs the spinner — a typed value walks straight
    // past it — so the entry is refused here instead of being saved.
    const item = items.find((i) => i.id === itemId);
    if (value !== null) {
      const max = Number(item?.max_score ?? 0);
      if (!Number.isFinite(value) || value < 0 || value > max) {
        toast.error(
          `Score must be between 0 and ${max} — the highest possible score for ${
            item?.label || "this item"
          }.`
        );
        revertScore(studentId, itemId);
        return;
      }
    }

    const { error } = await supabase.from("sms_class_record_scores").upsert(
      {
        item_id: Number(itemId),
        student_id: Number(studentId),
        raw_score: value,
      },
      { onConflict: "item_id,student_id" }
    );
    if (error) {
      // 23514 is the migration 162 trigger, whose message names the item and
      // its HPS — worth showing verbatim rather than the generic failure.
      toast.error(error.code === "23514" ? error.message : "Failed to save score.");
      revertScore(studentId, itemId);
      return;
    }
    savedScores.current = {
      ...savedScores.current,
      [studentId]: { ...(savedScores.current[studentId] || {}), [itemId]: value },
    };
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
      blockRows,
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
  // A record opened before migration 173 keeps resolving under the old rules,
  // so headings, transmutation and descriptors all follow the record's own
  // scheme rather than the current school year.
  const scheme = record ? schemeOf(record) : DEFAULT_GRADING_SCHEME;
  const layout = record ? layoutOf(record) : "standard";
  // One structure for both forms: a standard record's three weight columns are
  // synthesised into three blocks, a GMRC record reads its six from the table.
  const blocks = record ? blocksOf(record, blockRows) : [];
  const blockGroups = groupBlocks(blocks, scheme);
  // Only a nested form needs the extra component heading row above the blocks.
  const nested = hasNestedBlocks(blocks);
  const headerRowSpan = nested ? 4 : 3;
  const activePreset =
    record && layout === "standard"
      ? matchWeightPreset(
          Number(record.ww_weight),
          Number(record.pt_weight),
          Number(record.st_weight)
        )
      : null;
  const totalCols =
    1 + // names
    blocks.reduce((n, b) => n + itemsOfBlock(items, b).length + 3, 0) +
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

      {selectedSubject && isValid && (
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

            {view === "term" && record && (
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
                  <Select
                    value={layout}
                    disabled={locked || changingLayout}
                    onValueChange={(value) =>
                      changeLayout(value as ClassRecordFormLayout)
                    }
                  >
                    <SelectTrigger className="h-9 w-56">
                      <SelectValue placeholder="Form" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASS_RECORD_FORM_LAYOUTS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {layout === "standard" && (
                  <Select
                    value={activePreset?.id ?? "custom"}
                    disabled={locked}
                    onValueChange={(value) => {
                      const preset = CLASS_RECORD_WEIGHT_PRESETS.find(
                        (p) => p.id === value
                      );
                      if (!preset) return;
                      patchRecord({
                        ww_weight: preset.ww,
                        pt_weight: preset.pt,
                        st_weight: preset.st,
                      });
                    }}
                  >
                    <SelectTrigger className="h-9 w-52">
                      <SelectValue placeholder="Weights" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASS_RECORD_WEIGHT_PRESETS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                      {!activePreset && (
                        <SelectItem value="custom" disabled>
                          Custom weights
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  )}

                  <div className="flex items-center gap-1">
                    {alwaysTransmutes(scheme) ? (
                      <span className="text-xs text-muted-foreground">
                        Transmuted (updated DepEd table)
                      </span>
                    ) : (
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
                    )}
                    <button
                      type="button"
                      aria-label="How transmutation works"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setTransmuteInfoOpen(true)}
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {weightsValid(blocks) ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Weights: 100%
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Weights:{" "}
                      {totalWeight(blocks)}%
                    </Badge>
                  )}
                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => postGrades(record.id)}
                      disabled={posting || locked || !weightsValid(blocks)}
                    >
                      {posting ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : null}
                      Post Grades
                    </Button>
                  )}
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

          {locked && !readOnly && (
            <p className="text-xs text-amber-600">
              Editing previous school-year records is disabled in Settings.
            </p>
          )}

          {view === "term" && record && nested && (
            <p className="text-xs text-muted-foreground">
              GMRC / Values Education form: Written Works and Performance Tasks
              are split into domains, each carrying its own weight. The form can
              only be changed while no score has been encoded.
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
          ) : !record ? (
            <p className="text-sm text-muted-foreground py-8">
              The assigned teacher hasn&apos;t started this term&apos;s class
              record yet.
            </p>
          ) : (
            <div className="overflow-x-auto border rounded-md">
              <table className="text-sm border-collapse min-w-full">
                <thead>
                  {/* Component groups — only when blocks nest beneath them */}
                  {nested && (
                    <tr className="bg-muted/60">
                      <th
                        rowSpan={headerRowSpan}
                        className="border px-3 py-2 text-left align-bottom min-w-56 sticky left-0 bg-muted/60 z-10"
                      >
                        Learners&apos; Names
                      </th>
                      {blockGroups.map((g) => (
                        <th
                          key={g.component}
                          colSpan={g.blocks.reduce(
                            (n, b) => n + itemsOfBlock(items, b).length + 3,
                            0
                          )}
                          className="border px-2 py-1.5 text-center font-semibold"
                        >
                          {g.title}
                        </th>
                      ))}
                      <th
                        rowSpan={headerRowSpan}
                        className="border px-2 py-2 text-center align-bottom w-20"
                      >
                        Initial Grade
                      </th>
                      <th
                        rowSpan={headerRowSpan}
                        className="border px-2 py-2 text-center align-bottom w-20 text-green-700"
                      >
                        Term Grade
                      </th>
                      <th
                        rowSpan={headerRowSpan}
                        className="border px-2 py-2 text-center align-bottom w-32"
                      >
                        Descriptor
                      </th>
                    </tr>
                  )}

                  {/* Block headers: label, weight, and Add item */}
                  <tr className="bg-muted/60">
                    {!nested && (
                      <th
                        rowSpan={headerRowSpan}
                        className="border px-3 py-2 text-left align-bottom min-w-56 sticky left-0 bg-muted/60 z-10"
                      >
                        Learners&apos; Names
                      </th>
                    )}
                    {blocks.map((b) => {
                      const span = itemsOfBlock(items, b).length + 3;
                      return (
                        <th
                          key={b.code}
                          colSpan={span}
                          className="border px-2 py-1.5 text-center"
                        >
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <span className="font-semibold">{b.label}</span>
                            <Input
                              type="number"
                              className="h-7 w-16 text-center"
                              value={b.weight}
                              disabled={locked}
                              onChange={(e) =>
                                setBlockWeight(b, Number(e.target.value || 0))
                              }
                            />
                            <span className="text-xs">%</span>
                            {!b.fixedItems && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7"
                                disabled={locked}
                                onClick={() => setItemModal({ mode: "add", block: b })}
                              >
                                <Plus className="h-3.5 w-3.5" /> Add item
                              </Button>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    {!nested && (
                      <>
                        <th
                          rowSpan={headerRowSpan}
                          className="border px-2 py-2 text-center align-bottom w-20"
                        >
                          Initial Grade
                        </th>
                        <th
                          rowSpan={headerRowSpan}
                          className="border px-2 py-2 text-center align-bottom w-20 text-green-700"
                        >
                          Term Grade
                        </th>
                        <th
                          rowSpan={headerRowSpan}
                          className="border px-2 py-2 text-center align-bottom w-32"
                        >
                          Descriptor
                        </th>
                      </>
                    )}
                  </tr>

                  {/* Column index + remove item + TOTAL/PS/WS */}
                  <tr className="bg-muted/40 text-xs">
                    {blocks.map((b) => (
                      <FragmentCols
                        key={b.code}
                        component={b.component}
                        colItems={itemsOfBlock(items, b)}
                        locked={locked}
                        onRemove={requestRemoveItem}
                      />
                    ))}
                  </tr>

                  {/* Activity title (click to edit via modal) */}
                  <tr className="text-xs">
                    {blocks.map((b) => (
                      <FragmentTitle
                        key={b.code}
                        component={b.component}
                        colItems={itemsOfBlock(items, b)}
                        locked={locked}
                        onEdit={(item) =>
                          setItemModal({ mode: "edit", item, blockLabel: b.label })
                        }
                        onWeightChange={(id, value) => setLocalItem(id, { weight: value })}
                        onWeightCommit={(id, value) =>
                          commitItemField(id, "weight", value)
                        }
                      />
                    ))}
                  </tr>

                  {/* Highest Possible Score */}
                  <tr className="bg-muted/30 text-xs">
                    <th className="border px-3 py-1 text-right italic font-normal sticky left-0 bg-muted/30 z-10">
                      Highest Possible Score
                    </th>
                    {blocks.map((b) => {
                      const colItems = itemsOfBlock(items, b);
                      return (
                        <FragmentHps
                          key={b.code}
                          component={b.component}
                          colItems={colItems}
                          maxTotal={maxTotalOf(colItems)}
                          weight={b.weight}
                          locked={locked}
                          onMaxChange={(id, value) => setLocalItem(id, { max_score: value })}
                          onMaxCommit={(id, value) =>
                            commitItemField(id, "max_score", value)
                          }
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
                      blocks={blocks}
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
                      blocks={blocks}
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
          itemModal?.mode === "add"
            ? itemModal.block.label
            : (itemModal?.blockLabel ?? "")
        }
        initialLabel={itemModal?.mode === "edit" ? itemModal.item.label : ""}
        initialMaxScore={
          itemModal?.mode === "edit" ? Number(itemModal.item.max_score) : 10
        }
        onSave={handleItemModalSave}
      />

      <TransmutationInfoModal
        open={transmuteInfoOpen}
        onOpenChange={setTransmuteInfoOpen}
        scheme={scheme}
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
  component,
  colItems,
  locked,
  onRemove,
}: {
  component: ClassRecordComponent;
  colItems: ClassRecordItem[];
  locked: boolean;
  onRemove: (item: ClassRecordItem) => void;
}) {
  const fixed = component === "ST"; // ST columns are fixed — no remove
  return (
    <>
      {colItems.map((it, i) => (
        <th key={it.id} className="border px-1 py-1 text-center w-12">
          <div className="flex items-center justify-center gap-1">
            <span>{i + 1}</span>
            {!fixed && (
              <button
                type="button"
                onClick={() => onRemove(it)}
                disabled={locked}
                title="Remove item"
                className="text-muted-foreground hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
              >
                <X className="h-3 w-3" />
              </button>
            )}
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
  component,
  colItems,
  locked,
  onEdit,
  onWeightChange,
  onWeightCommit,
}: {
  component: ClassRecordComponent;
  colItems: ClassRecordItem[];
  locked: boolean;
  onEdit: (item: ClassRecordItem) => void;
  onWeightChange: (id: string, value: number) => void;
  onWeightCommit: (id: string, value: number) => void;
}) {
  if (component === "ST") {
    // Fixed ST columns: static label + editable per-item weight.
    return (
      <>
        {colItems.map((it) => (
          <th key={it.id} className="border px-1 py-1.5 align-middle w-16">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[11px] font-semibold">{it.label}</span>
              <div className="flex items-center gap-0.5">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="h-6 w-12 rounded px-1 text-center text-[11px]"
                  value={Number(it.weight ?? 0)}
                  disabled={locked}
                  onChange={(e) =>
                    onWeightChange(it.id, Number(e.target.value || 0))
                  }
                  onBlur={(e) => onWeightCommit(it.id, Number(e.target.value || 0))}
                  onWheel={(e) => e.currentTarget.blur()}
                />
                <span className="text-[10px]">%</span>
              </div>
            </div>
          </th>
        ))}
        <th className="border" />
        <th className="border" />
        <th className="border" />
      </>
    );
  }

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
  component,
  colItems,
  maxTotal,
  weight,
  locked,
  onMaxChange,
  onMaxCommit,
}: {
  component: ClassRecordComponent;
  colItems: ClassRecordItem[];
  maxTotal: number;
  weight: number;
  locked: boolean;
  onMaxChange: (id: string, value: number) => void;
  onMaxCommit: (id: string, value: number) => void;
}) {
  const editable = component === "ST"; // ST HPS is edited inline (no modal)
  return (
    <>
      {colItems.map((it) =>
        editable ? (
          <th key={it.id} className="border px-1 py-1 text-center">
            <Input
              type="number"
              min={1}
              className="h-6 w-12 rounded px-1 text-center text-[11px] font-normal"
              value={Number(it.max_score)}
              disabled={locked}
              onChange={(e) => onMaxChange(it.id, Number(e.target.value || 0))}
              onBlur={(e) => onMaxCommit(it.id, Number(e.target.value || 0))}
              onWheel={(e) => e.currentTarget.blur()}
            />
          </th>
        ) : (
          <th
            key={it.id}
            className="border px-1 py-1 text-center text-[11px] font-normal"
          >
            {Number(it.max_score)}
          </th>
        )
      )}
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
  blocks,
  studentScores,
  locked,
  onScore,
  onScoreCommit,
}: {
  index: number;
  student: Student;
  items: ClassRecordItem[];
  record: ClassRecord;
  blocks: ClassRecordBlock[];
  studentScores: Record<string, number | null>;
  locked: boolean;
  onScore: (studentId: string, itemId: string, value: string) => void;
  onScoreCommit: (studentId: string, itemId: string) => void;
}) {
  const scheme = schemeOf(record);
  const initial = initialGrade(blocks, items, studentScores);
  const term = termGrade(record, blocks, items, studentScores);
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

      {blocks.map((b) => {
        const colItems = itemsOfBlock(items, b);
        const ps = blockPS(items, b, studentScores);
        const ws = blockWS(items, b, studentScores);
        const rawTotal = rawTotalOf(colItems, studentScores);
        return (
          <FragmentScoreCells
            key={b.code}
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
        {hasAnyScore ? descriptor(term, scheme) : "-"}
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
        // Flagged while typing; the commit in persistScore is what refuses it.
        const outOfRange =
          v !== null && v !== undefined && (v < 0 || v > Number(it.max_score));
        return (
          <td key={it.id} className="border p-0">
            <Input
              type="number"
              min={0}
              max={Number(it.max_score)}
              title={
                outOfRange
                  ? `Highest possible score is ${Number(it.max_score)}.`
                  : undefined
              }
              className={`h-8 w-12 rounded-none border-0 text-center px-0 ${
                outOfRange ? "bg-red-50 text-red-600 font-semibold" : ""
              }`}
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
