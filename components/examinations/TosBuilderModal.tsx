"use client";

/**
 * Shared Table of Specification builder (create / edit), used by both the
 * Division and Teacher examination pages. Diverges only by `mode`:
 *   - division: saved with school_id = NULL (shared to all teachers)
 *   - teacher:  saved with school_id = <schoolId> (private to created_by)
 *
 * Header + competency rows + item placement. % and No. of Items auto-compute
 * from No. of days (toggle off to enter counts manually). Items are numbered
 * sequentially across competencies; each item's Bloom level is chosen in the
 * placement editor. On save: upsert sms_tos, sync sms_tos_competencies, then
 * rebuild sms_tos_items.
 */

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  BLOOM_LEVELS,
  EXAM_TYPE_OPTIONS,
  EXAM_TYPE_QUARTERLY,
  EXAM_TYPE_TERM,
  TOS_DEFAULT_LEGEND,
  type CognitiveLevel,
} from "@/lib/constants/examinations";
import { GRADE_LEVELS, getGradeLevelLabel } from "@/lib/constants";
import { useAppDispatch } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { computeItemCounts } from "@/lib/utils/tos";
import {
  getCurrentSchoolYear,
  getGradingPeriodType,
  getGradingPeriods,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import type { Tos } from "@/types";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { TosItemPlacementEditor } from "./TosItemPlacementEditor";
import { TosPreviewTable } from "./TosPreviewTable";

interface CompetencyDraft {
  key: string;
  id?: string;
  competency_text: string;
  lc_code: string;
  no_of_days: number;
  no_of_items: number;
  itemLevels: CognitiveLevel[];
}

interface TeacherSubjectOption {
  subject_id: string;
  subject_name: string;
  grade_level: number;
}

interface TosBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: Tos | null;
  mode: "division" | "teacher";
  schoolId: number | null;
  userId: string | number | null;
}

const DEFAULT_LEVEL = BLOOM_LEVELS[0].value;

let keySeq = 0;
const newKey = () => `c${Date.now()}_${keySeq++}`;

const emptyCompetency = (): CompetencyDraft => ({
  key: newKey(),
  competency_text: "",
  lc_code: "",
  no_of_days: 0,
  no_of_items: 0,
  itemLevels: [],
});

function reconcileLevels(
  levels: CognitiveLevel[],
  count: number,
): CognitiveLevel[] {
  if (count === levels.length) return levels;
  if (count < levels.length) return levels.slice(0, count);
  return [
    ...levels,
    ...Array.from({ length: count - levels.length }, () => DEFAULT_LEVEL),
  ];
}

function applyAutoCounts(
  rows: CompetencyDraft[],
  totalDaysValue: number,
  totalItems: number,
): CompetencyDraft[] {
  const counts = computeItemCounts(rows, totalDaysValue, totalItems);
  return rows.map((r, i) => ({
    ...r,
    no_of_items: counts[i],
    itemLevels: reconcileLevels(r.itemLevels, counts[i]),
  }));
}

export function TosBuilderModal({
  isOpen,
  onClose,
  editData,
  mode,
  schoolId,
  userId,
}: TosBuilderModalProps) {
  const dispatch = useAppDispatch();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [title, setTitle] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [gradingPeriod, setGradingPeriod] = useState("1");
  const [examType, setExamType] = useState(EXAM_TYPE_QUARTERLY);
  const [totalItems, setTotalItems] = useState(40);
  const [totalDays, setTotalDays] = useState(0);
  const [preparedByName, setPreparedByName] = useState("");
  const [preparedByPosition, setPreparedByPosition] = useState("");
  const [legend, setLegend] = useState(TOS_DEFAULT_LEGEND);
  const [isActive, setIsActive] = useState(true);
  const [autoItems, setAutoItems] = useState(true);

  const [competencies, setCompetencies] = useState<CompetencyDraft[]>([]);
  const [originalCompetencyIds, setOriginalCompetencyIds] = useState<string[]>(
    [],
  );

  const [teacherSubjects, setTeacherSubjects] = useState<TeacherSubjectOption[]>(
    [],
  );

  const periodOptions = getGradingPeriods(schoolYear);

  // Load the teacher's assigned subjects (optional prefill), teacher mode only.
  useEffect(() => {
    if (!isOpen || mode !== "teacher" || !userId) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("sms_subject_schedules")
        .select("subject_id, subjects:subject_id (id, name, grade_level)")
        .eq("teacher_id", userId);
      if (!active) return;
      const seen = new Set<string>();
      const list: TeacherSubjectOption[] = [];
      (data ?? []).forEach((row) => {
        const subj = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
        if (!subj) return;
        const id = String(subj.id);
        if (seen.has(id)) return;
        seen.add(id);
        list.push({
          subject_id: id,
          subject_name: subj.name,
          grade_level: subj.grade_level,
        });
      });
      setTeacherSubjects(list);
    })();
    return () => {
      active = false;
    };
  }, [isOpen, mode, userId]);

  // Reset / hydrate form on open.
  useEffect(() => {
    if (!isOpen) return;
    setShowPreview(false);

    if (editData?.id) {
      setTitle(editData.title || "");
      setSubjectName(editData.subject_name || "");
      setSubjectId(editData.subject_id ? String(editData.subject_id) : "");
      setGradeLevel(String(editData.grade_level));
      setSchoolYear(editData.school_year);
      setGradingPeriod(String(editData.grading_period));
      setExamType(editData.exam_type);
      setTotalItems(editData.total_items);
      setTotalDays(editData.total_days ?? 0);
      setPreparedByName(editData.prepared_by_name || "");
      setPreparedByPosition(editData.prepared_by_position || "");
      setLegend(editData.legend || TOS_DEFAULT_LEGEND);
      setIsActive(editData.is_active ?? true);
      setAutoItems(false); // respect saved counts

      (async () => {
        setLoadingChildren(true);
        const [{ data: compRows }, { data: itemRows }] = await Promise.all([
          supabase
            .from("sms_tos_competencies")
            .select("*")
            .eq("tos_id", editData.id)
            .order("position"),
          supabase
            .from("sms_tos_items")
            .select("*")
            .eq("tos_id", editData.id)
            .order("item_number"),
        ]);

        const drafts: CompetencyDraft[] = (compRows || []).map((c) => {
          const levels = (itemRows || [])
            .filter((it) => String(it.competency_id) === String(c.id))
            .sort((a, b) => a.item_number - b.item_number)
            .map((it) => it.cognitive_level as CognitiveLevel);
          const count = Number(c.no_of_items) || levels.length;
          return {
            key: newKey(),
            id: String(c.id),
            competency_text: c.competency_text || "",
            lc_code: c.lc_code || "",
            no_of_days: Number(c.no_of_days) || 0,
            no_of_items: count,
            itemLevels: reconcileLevels(levels, count),
          };
        });
        setCompetencies(drafts.length > 0 ? drafts : [emptyCompetency()]);
        setOriginalCompetencyIds((compRows || []).map((c) => String(c.id)));
        setLoadingChildren(false);
      })();
    } else {
      setTitle("");
      setSubjectName("");
      setSubjectId("");
      setGradeLevel("");
      const sy = getCurrentSchoolYear();
      setSchoolYear(sy);
      setGradingPeriod("1");
      setExamType(
        getGradingPeriodType(sy) === "term"
          ? EXAM_TYPE_TERM
          : EXAM_TYPE_QUARTERLY,
      );
      setTotalItems(40);
      setTotalDays(0);
      setPreparedByName("");
      setPreparedByPosition("");
      setLegend(TOS_DEFAULT_LEGEND);
      setIsActive(true);
      setAutoItems(true);
      setCompetencies([emptyCompetency()]);
      setOriginalCompetencyIds([]);
    }
  }, [isOpen, editData]);

  // Keep grading period + default exam type consistent with the school year.
  const handleSchoolYearChange = (sy: string) => {
    setSchoolYear(sy);
    const periods = getGradingPeriods(sy);
    if (!periods.some((p) => String(p.value) === gradingPeriod)) {
      setGradingPeriod("1");
    }
    // Only auto-swap the exam type if it is still one of the auto defaults.
    if (examType === EXAM_TYPE_QUARTERLY || examType === EXAM_TYPE_TERM) {
      setExamType(
        getGradingPeriodType(sy) === "term"
          ? EXAM_TYPE_TERM
          : EXAM_TYPE_QUARTERLY,
      );
    }
  };

  const setDays = (index: number, value: number) => {
    setCompetencies((prev) => {
      const next = prev.map((c, i) =>
        i === index ? { ...c, no_of_days: value } : c,
      );
      return autoItems ? applyAutoCounts(next, totalDays, totalItems) : next;
    });
  };

  const handleTotalDaysChange = (value: number) => {
    setTotalDays(value);
    if (autoItems) {
      setCompetencies((prev) => applyAutoCounts(prev, value, totalItems));
    }
  };

  const setManualItems = (index: number, value: number) => {
    setCompetencies((prev) =>
      prev.map((c, i) =>
        i === index
          ? {
              ...c,
              no_of_items: value,
              itemLevels: reconcileLevels(c.itemLevels, value),
            }
          : c,
      ),
    );
  };

  const setCompetencyField = (
    index: number,
    patch: Partial<Pick<CompetencyDraft, "competency_text" | "lc_code">>,
  ) => {
    setCompetencies((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  };

  const handleTotalItemsChange = (value: number) => {
    setTotalItems(value);
    if (autoItems) {
      setCompetencies((prev) => applyAutoCounts(prev, totalDays, value));
    }
  };

  const handleAutoItemsToggle = (checked: boolean) => {
    setAutoItems(checked);
    if (checked) {
      setCompetencies((prev) => applyAutoCounts(prev, totalDays, totalItems));
    }
  };

  const setItemLevel = useCallback(
    (compIndex: number, itemIndex: number, level: CognitiveLevel) => {
      setCompetencies((prev) =>
        prev.map((c, i) => {
          if (i !== compIndex) return c;
          const itemLevels = [...c.itemLevels];
          itemLevels[itemIndex] = level;
          return { ...c, itemLevels };
        }),
      );
    },
    [],
  );

  const addCompetency = () =>
    setCompetencies((prev) => [...prev, emptyCompetency()]);

  const removeCompetency = (index: number) =>
    setCompetencies((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return autoItems ? applyAutoCounts(next, totalDays, totalItems) : next;
    });

  const applyTeacherSubject = (id: string) => {
    setSubjectId(id);
    const found = teacherSubjects.find((s) => s.subject_id === id);
    if (found) {
      setSubjectName(found.subject_name);
      setGradeLevel(String(found.grade_level));
    }
  };

  const placedItems = competencies.reduce((s, c) => s + c.no_of_items, 0);

  const onSubmit = async () => {
    if (isSubmitting) return;
    if (!subjectName.trim()) return toast.error("Subject is required.");
    if (gradeLevel === "") return toast.error("Grade level is required.");
    if (!schoolYear) return toast.error("School year is required.");
    if (totalItems <= 0) return toast.error("Total items must be greater than 0.");
    if (totalDays <= 0) return toast.error("Total no. of days must be greater than 0.");
    const validComps = competencies.filter((c) => c.competency_text.trim());
    if (validComps.length === 0)
      return toast.error("Add at least one competency.");

    setIsSubmitting(true);
    try {
      const headerPayload = {
        title: title.trim() || null,
        subject_name: subjectName.trim(),
        grade_level: Number(gradeLevel),
        subject_id: subjectId ? Number(subjectId) : null,
        school_year: schoolYear,
        grading_period: Number(gradingPeriod),
        exam_type: examType,
        total_items: totalItems,
        total_days: totalDays,
        school_id: mode === "division" ? null : schoolId,
        prepared_by_name: preparedByName.trim() || null,
        prepared_by_position: preparedByPosition.trim() || null,
        legend: legend.trim() || null,
        is_active: isActive,
      };

      let tosId: string;
      if (editData?.id) {
        const { error } = await supabase
          .from("sms_tos")
          .update(headerPayload)
          .eq("id", editData.id);
        if (error) throw new Error(error.message);
        tosId = String(editData.id);
      } else {
        const { data: inserted, error } = await supabase
          .from("sms_tos")
          .insert([{ ...headerPayload, created_by: userId ?? null }])
          .select()
          .single();
        if (error) throw new Error(error.message);
        tosId = String(inserted.id);
      }

      // Rebuild item placement from scratch.
      await supabase.from("sms_tos_items").delete().eq("tos_id", tosId);

      // Sync competencies (update kept / insert new / delete removed).
      const keptIds: string[] = [];
      const finalRows: {
        id: string;
        no_of_items: number;
        itemLevels: CognitiveLevel[];
      }[] = [];
      for (let i = 0; i < validComps.length; i++) {
        const c = validComps[i];
        const row = {
          competency_text: c.competency_text.trim(),
          lc_code: c.lc_code.trim() || null,
          no_of_days: c.no_of_days,
          no_of_items: c.no_of_items,
          position: i,
        };
        if (c.id) {
          keptIds.push(c.id);
          await supabase
            .from("sms_tos_competencies")
            .update(row)
            .eq("id", c.id);
          finalRows.push({
            id: c.id,
            no_of_items: c.no_of_items,
            itemLevels: c.itemLevels,
          });
        } else {
          const { data: ins, error } = await supabase
            .from("sms_tos_competencies")
            .insert([{ ...row, tos_id: Number(tosId) }])
            .select()
            .single();
          if (error) throw new Error(error.message);
          finalRows.push({
            id: String(ins.id),
            no_of_items: c.no_of_items,
            itemLevels: c.itemLevels,
          });
        }
      }
      const removed = originalCompetencyIds.filter(
        (id) => !keptIds.includes(id),
      );
      if (removed.length > 0) {
        await supabase
          .from("sms_tos_competencies")
          .delete()
          .in("id", removed);
      }

      // Insert item rows, numbered sequentially across competencies.
      const itemRows: {
        tos_id: number;
        competency_id: number;
        item_number: number;
        cognitive_level: CognitiveLevel;
      }[] = [];
      let n = 0;
      for (const fr of finalRows) {
        for (let k = 0; k < fr.no_of_items; k++) {
          n += 1;
          itemRows.push({
            tos_id: Number(tosId),
            competency_id: Number(fr.id),
            item_number: n,
            cognitive_level: fr.itemLevels[k] ?? DEFAULT_LEVEL,
          });
        }
      }
      if (itemRows.length > 0) {
        const { error } = await supabase.from("sms_tos_items").insert(itemRows);
        if (error) throw new Error(error.message);
      }

      const { data: fresh } = await supabase
        .from("sms_tos")
        .select("*")
        .eq("id", tosId)
        .single();
      if (fresh) {
        dispatch(editData?.id ? updateList(fresh) : addItem(fresh));
      }

      toast.success(editData ? "TOS updated!" : "TOS created!");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error saving TOS");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Preview props derived from current draft state.
  const previewCompetencies = competencies
    .filter((c) => c.competency_text.trim())
    .map((c) => ({
      id: c.key,
      competency_text: c.competency_text,
      lc_code: c.lc_code,
      no_of_days: c.no_of_days,
      no_of_items: c.no_of_items,
    }));
  const previewItems: {
    competency_id: string;
    item_number: number;
    cognitive_level: CognitiveLevel;
  }[] = [];
  {
    let n = 0;
    for (const c of competencies) {
      if (!c.competency_text.trim()) continue;
      for (let k = 0; k < c.no_of_items; k++) {
        n += 1;
        previewItems.push({
          competency_id: c.key,
          item_number: n,
          cognitive_level: c.itemLevels[k] ?? DEFAULT_LEVEL,
        });
      }
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {editData ? "Edit" : "Create"} Table of Specification
          </DialogTitle>
          <DialogDescription>
            {mode === "division"
              ? "Division-authored TOS is visible to all subject teachers."
              : "Your TOS is private to you. Division-authored TOS is shared to everyone."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4">
            {mode === "teacher" && teacherSubjects.length > 0 && (
              <div className="col-span-2">
                <Label className="mb-1.5 block">
                  Prefill from my subjects (optional)
                </Label>
                <Select
                  value={subjectId}
                  onValueChange={applyTeacherSubject}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an assigned subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {teacherSubjects.map((s) => (
                      <SelectItem key={s.subject_id} value={s.subject_id}>
                        {s.subject_name} — {getGradeLevelLabel(s.grade_level)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="mb-1.5 block">
                Subject <span className="text-red-500">*</span>
              </Label>
              <Input
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="e.g., EPP"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">
                Grade Level <span className="text-red-500">*</span>
              </Label>
              <Select
                value={gradeLevel}
                onValueChange={setGradeLevel}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {GRADE_LEVELS.map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      {getGradeLevelLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block">
                School Year <span className="text-red-500">*</span>
              </Label>
              <Select
                value={schoolYear}
                onValueChange={handleSchoolYearChange}
                disabled={isSubmitting}
              >
                <SelectTrigger>
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
            <div>
              <Label className="mb-1.5 block">
                {getGradingPeriodType(schoolYear) === "term"
                  ? "Term"
                  : "Quarter"}{" "}
                <span className="text-red-500">*</span>
              </Label>
              <Select
                value={gradingPeriod}
                onValueChange={setGradingPeriod}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block">Exam Type</Label>
              <Select
                value={examType}
                onValueChange={setExamType}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXAM_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">
                Total Items <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                min={1}
                value={totalItems}
                onChange={(e) =>
                  handleTotalItemsChange(Number(e.target.value || 0))
                }
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">
                Total No. of Days <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={totalDays}
                onChange={(e) =>
                  handleTotalDaysChange(Number(e.target.value || 0))
                }
                disabled={isSubmitting}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Items per competency = round(days ÷ total days × total items)
              </p>
            </div>

            <div className="col-span-2">
              <Label className="mb-1.5 block">Title (optional)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Leave blank to auto-generate"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <Label className="mb-1.5 block">Prepared by (name)</Label>
              <Input
                value={preparedByName}
                onChange={(e) => setPreparedByName(e.target.value)}
                placeholder="e.g., Juan D. Cruz"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Position</Label>
              <Input
                value={preparedByPosition}
                onChange={(e) => setPreparedByPosition(e.target.value)}
                placeholder="e.g., Teacher III"
                disabled={isSubmitting}
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1.5 block">Legend</Label>
              <Input
                value={legend}
                onChange={(e) => setLegend(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="flex items-end gap-2 pb-1">
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={isSubmitting}
              />
              <Label>Active</Label>
            </div>
          </div>

          {/* Competency editor */}
          <div className="rounded-md border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                Learning Competencies (MELCs)
              </p>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={autoItems}
                    disabled={isSubmitting}
                    onChange={(e) => handleAutoItemsToggle(e.target.checked)}
                  />
                  Auto-distribute items from days
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addCompetency}
                  disabled={isSubmitting}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add competency
                </Button>
              </div>
            </div>

            {loadingChildren ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="space-y-2">
                <div className="hidden grid-cols-12 gap-2 px-1 text-[11px] font-medium text-muted-foreground sm:grid">
                  <div className="col-span-6">Competency</div>
                  <div className="col-span-3 text-center">
                    No. of days based on LC Codes
                  </div>
                  <div className="col-span-2 text-center">Items</div>
                  <div className="col-span-1" />
                </div>
                {competencies.map((c, idx) => (
                  <div
                    key={c.key}
                    className="grid grid-cols-12 items-start gap-2"
                  >
                    <div className="col-span-12 sm:col-span-6">
                      <Textarea
                        value={c.competency_text}
                        onChange={(e) =>
                          setCompetencyField(idx, {
                            competency_text: e.target.value,
                          })
                        }
                        placeholder={`Competency ${idx + 1}`}
                        rows={2}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-3">
                      <Input
                        type="number"
                        min={0}
                        step="0.5"
                        value={c.no_of_days}
                        onChange={(e) =>
                          setDays(idx, Number(e.target.value || 0))
                        }
                        placeholder="Days"
                        disabled={isSubmitting}
                        className="text-center"
                      />
                    </div>
                    <div className="col-span-5 sm:col-span-2">
                      <Input
                        type="number"
                        min={0}
                        value={c.no_of_items}
                        onChange={(e) =>
                          setManualItems(idx, Number(e.target.value || 0))
                        }
                        disabled={isSubmitting || autoItems}
                        className="text-center"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => removeCompetency(idx)}
                        disabled={isSubmitting}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {placedItems} item{placedItems === 1 ? "" : "s"} across
              competencies · target {totalItems}
              {placedItems !== totalItems && (
                <span className="ml-1 text-amber-600">
                  ({placedItems > totalItems ? "over" : "under"} by{" "}
                  {Math.abs(totalItems - placedItems)})
                </span>
              )}
            </p>
          </div>

          {/* Item placement */}
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-semibold">
              Item Placement (cognitive level per item)
            </p>
            <TosItemPlacementEditor
              competencies={competencies.map((c) => ({
                key: c.key,
                competency_text: c.competency_text,
                no_of_items: c.no_of_items,
                itemLevels: c.itemLevels,
              }))}
              onChangeLevel={setItemLevel}
              disabled={isSubmitting}
            />
          </div>

          {/* Preview */}
          <div className="rounded-md border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Preview</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowPreview((v) => !v)}
              >
                {showPreview ? "Hide" : "Show"} preview
              </Button>
            </div>
            {showPreview && (
              <div className="mt-3 overflow-x-auto rounded border bg-white p-3">
                <TosPreviewTable
                  header={{
                    title,
                    subject_name: subjectName || "—",
                    grade_level: gradeLevel === "" ? 0 : Number(gradeLevel),
                    exam_type: examType,
                    school_year: schoolYear,
                    grading_period: Number(gradingPeriod),
                    total_items: totalItems,
                    total_days: totalDays,
                    prepared_by_name: preparedByName,
                    prepared_by_position: preparedByPosition,
                    legend,
                  }}
                  competencies={previewCompetencies}
                  items={previewItems}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="min-w-[100px]"
          >
            {isSubmitting ? "Saving…" : editData ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
