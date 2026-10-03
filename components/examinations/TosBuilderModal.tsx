"use client";

/**
 * Shared Table of Specification builder (create / edit), used by both the
 * Division and Teacher examination pages. Diverges only by `mode`:
 *   - division: saved with school_id = NULL (shared to all teachers)
 *   - teacher:  saved with school_id = <schoolId>, and `is_school_shared`
 *               chooses between the two school-level tiers (migration 160):
 *               shared with every teacher at that school, or private to
 *               created_by, which is what school-level meant before 160.
 *
 * Header + competency rows + item placement. % and No. of Items auto-compute
 * from No. of days (toggle off to enter counts manually). Items are numbered
 * sequentially across competencies; each item's Bloom level is chosen in the
 * placement editor. On save: upsert sms_tos, sync sms_tos_competencies, then
 * rebuild sms_tos_items.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { CataloguePicker } from "@/components/examinations/catalogue/CataloguePicker";
import { useCatalogueCompetencies, useLearningAreas } from "@/hooks/useCatalogue";
import {
  BLOOM_LEVELS,
  EXAM_TYPE_OPTIONS,
  EXAM_TYPE_TERM,
  TOS_DEFAULT_LEGEND,
  type CognitiveLevel,
} from "@/lib/constants/examinations";
import { GRADE_LEVELS, getGradeLevelLabel } from "@/lib/constants";
import { CATALOGUE_GRADES } from "@/lib/constants/questionBank";
import { useAppDispatch } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { suggestCatalogueMatch } from "@/lib/utils/catalogueMatch";
import { computeItemCounts } from "@/lib/utils/tos";
import { catalogueSaveError, unmappedCount } from "@/lib/utils/tosCatalogue";
import {
  getCurrentSchoolYear,
  getGradingPeriodType,
  getGradingPeriods,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import type { CatalogueCompetency, Tos } from "@/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ChevronDown,
  Eye,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import toast from "react-hot-toast";
import {
  FormSection,
  RequiredMark,
  SummaryStat,
  ToggleCard,
} from "./BuilderLayout";
import { TosItemPlacementEditor } from "./TosItemPlacementEditor";
import { TosPreviewTable } from "./TosPreviewTable";

interface CompetencyDraft {
  key: string;
  id?: string;
  competency_text: string;
  lc_code: string;
  // Migration 195: the catalogue entry this row was picked from. NULL on a
  // blank row and on a row typed before the catalogue existed.
  catalogue_competency_id: string | null;
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
  catalogue_competency_id: null,
  no_of_days: 0,
  no_of_items: 0,
  itemLevels: [],
});

/** Link a row to a catalogue entry; the text and LC code are the catalogue's. */
const linkToCatalogue = (
  row: CompetencyDraft,
  cat: CatalogueCompetency,
): CompetencyDraft => ({
  ...row,
  catalogue_competency_id: String(cat.id),
  competency_text: cat.competency_text,
  lc_code: cat.lc_code,
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
  // Migration 195: the TOS's learning area from the competency catalogue.
  // Retired areas and entries are loaded too, so a TOS that already holds
  // one still opens, prints and re-saves (the database only refuses a
  // retired entry on a new pick).
  const [learningAreaId, setLearningAreaId] = useState<string>("");
  const { areas } = useLearningAreas(true);
  const [subjectId, setSubjectId] = useState<string>("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [gradingPeriod, setGradingPeriod] = useState("1");
  const [examType, setExamType] = useState<string>(EXAM_TYPE_TERM);
  const [totalItems, setTotalItems] = useState(40);
  const [totalDays, setTotalDays] = useState(0);
  const [preparedByName, setPreparedByName] = useState("");
  const [preparedByPosition, setPreparedByPosition] = useState("");
  const [legend, setLegend] = useState(TOS_DEFAULT_LEGEND);
  const [isActive, setIsActive] = useState(true);
  // Sharing tier (migration 160): false = private to created_by, true =
  // visible to every teacher at schoolId. Meaningless in division mode.
  const [isSchoolShared, setIsSchoolShared] = useState(false);
  const [autoItems, setAutoItems] = useState(true);

  const [competencies, setCompetencies] = useState<CompetencyDraft[]>([]);
  const [originalCompetencyIds, setOriginalCompetencyIds] = useState<string[]>(
    [],
  );

  const [teacherSubjects, setTeacherSubjects] = useState<TeacherSubjectOption[]>(
    [],
  );

  const periodOptions = getGradingPeriods(schoolYear);

  const { competencies: catalogue } = useCatalogueCompetencies(
    learningAreaId || null,
    gradeLevel === "" ? null : Number(gradeLevel),
    true,
  );
  // subject_name is copied from the learning area by the database; mirror
  // that here so the preview and the payload agree with what is stored.
  const areaName = areas.find((a) => String(a.id) === learningAreaId)?.name;
  const effectiveSubjectName = areaName ?? subjectName;
  // A TOS saved archived is never re-checked by 195's guards (spec R3) —
  // whether it was archived already or is being archived now, which onSubmit
  // makes true by writing is_active alone first — so the builder does not
  // demand a mapping the database would not ask for either. A new TOS is
  // not exempt: the header guard checks every INSERT.
  const catalogueExempt = !!editData?.id && !isActive;
  const pickedIds = competencies
    .map((x) => x.catalogue_competency_id)
    .filter((x): x is string => !!x);
  const unmapped = unmappedCount(competencies);
  // Spec §7: Save stays disabled until the TOS is fully mapped; the reason
  // is shown beside the button.
  const saveBlocker = loadingChildren
    ? null
    : catalogueSaveError({
        learningAreaId,
        rows: competencies,
        archived: catalogueExempt,
      });

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
      setLearningAreaId(
        editData.learning_area_id ? String(editData.learning_area_id) : "",
      );
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
      setIsSchoolShared(editData.is_school_shared ?? false);
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
            catalogue_competency_id: c.catalogue_competency_id
              ? String(c.catalogue_competency_id)
              : null,
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
      setLearningAreaId("");
      setSubjectId("");
      setGradeLevel("");
      const sy = getCurrentSchoolYear();
      setSchoolYear(sy);
      setGradingPeriod("1");
      setExamType(EXAM_TYPE_TERM);
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

  // Keep the grading period valid for the school year.
  const handleSchoolYearChange = (sy: string) => {
    setSchoolYear(sy);
    const periods = getGradingPeriods(sy);
    if (!periods.some((p) => String(p.value) === gradingPeriod)) {
      setGradingPeriod("1");
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

  const setCatalogueLink = (index: number, cat: CatalogueCompetency) =>
    setCompetencies((prev) =>
      prev.map((x, i) => (i === index ? linkToCatalogue(x, cat) : x)),
    );

  // A picked entry belongs to one learning area and grade; once either
  // changes it no longer matches and 195's guard would refuse the save, so
  // the picks are cleared (days and items are kept) and the user is told.
  const clearCataloguePicks = (what: string) => {
    const n = competencies.filter((c) => c.catalogue_competency_id).length;
    if (n === 0) return;
    setCompetencies((prev) =>
      prev.map((c) =>
        c.catalogue_competency_id
          ? { ...c, catalogue_competency_id: null, competency_text: "", lc_code: "" }
          : c,
      ),
    );
    toast(
      `${what} ${what.includes(" and ") ? "were" : "was"} changed, so ${n} picked competenc${n === 1 ? "y was" : "ies were"} cleared. Pick ${n === 1 ? "it" : "them"} again from the catalogue.`,
    );
  };

  const handleLearningAreaChange = (id: string) => {
    if (id === learningAreaId) return;
    setLearningAreaId(id);
    clearCataloguePicks("The learning area");
  };

  const handleGradeLevelChange = (g: string) => {
    if (g === gradeLevel) return;
    setGradeLevel(g);
    clearCataloguePicks("The grade level");
  };

  const applySuggestions = () =>
    setCompetencies((prev) => {
      const taken = new Set(
        prev.map((x) => x.catalogue_competency_id).filter((x): x is string => !!x),
      );
      return prev.map((x) => {
        if (x.catalogue_competency_id || !x.competency_text.trim()) return x;
        const m = suggestCatalogueMatch(
          x,
          catalogue.filter((c) => c.is_active && !taken.has(String(c.id))),
        );
        if (!m) return x;
        taken.add(String(m.id));
        return linkToCatalogue(x, m);
      });
    });

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
      const nextGrade = String(found.grade_level);
      const area = areas.find(
        (a) =>
          a.is_active &&
          a.name.trim().toLowerCase() === found.subject_name.trim().toLowerCase(),
      );
      const nextArea = area ? String(area.id) : learningAreaId;
      if (nextGrade !== gradeLevel || nextArea !== learningAreaId) {
        setGradeLevel(nextGrade);
        setLearningAreaId(nextArea);
        const areaChanged = nextArea !== learningAreaId;
        const gradeChanged = nextGrade !== gradeLevel;
        clearCataloguePicks(
          areaChanged && gradeChanged
            ? "The learning area and grade level"
            : areaChanged
              ? "The learning area"
              : "The grade level",
        );
      }
    }
  };

  const placedItems = competencies.reduce((s, c) => s + c.no_of_items, 0);

  const onSubmit = async () => {
    if (isSubmitting) return;
    const catalogueError = catalogueSaveError({
      learningAreaId,
      rows: competencies,
      archived: catalogueExempt,
    });
    if (catalogueError) return toast.error(catalogueError);
    if (!effectiveSubjectName.trim()) return toast.error("Subject is required.");
    if (gradeLevel === "") return toast.error("Grade level is required.");
    if (!schoolYear) return toast.error("School year is required.");
    if (totalItems <= 0) return toast.error("Total items must be greater than 0.");
    if (totalDays <= 0) return toast.error("Total no. of days must be greater than 0.");
    // Outside the archived exemption catalogueSaveError has already refused
    // any typed-but-unmapped row, so these are exactly the picked rows.
    const validComps = competencies.filter(
      (c) => c.catalogue_competency_id || c.competency_text.trim(),
    );
    if (validComps.length === 0)
      return toast.error("Add at least one competency.");

    setIsSubmitting(true);
    // A TOS inserted by this save, removed again if a later write is refused
    // so a retry does not leave a duplicate behind.
    let createdId: string | null = null;
    try {
      const headerPayload = {
        title: title.trim() || null,
        subject_name: effectiveSubjectName.trim(),
        learning_area_id: learningAreaId ? Number(learningAreaId) : null,
        grade_level: Number(gradeLevel),
        subject_id: subjectId ? Number(subjectId) : null,
        school_year: schoolYear,
        grading_period: Number(gradingPeriod),
        exam_type: examType,
        total_items: totalItems,
        total_days: totalDays,
        school_id: mode === "division" ? null : schoolId,
        // A division row is shared by being school_id NULL; migration 160's
        // CHECK forbids the flag there, so it is forced false.
        is_school_shared: mode === "division" ? false : isSchoolShared,
        prepared_by_name: preparedByName.trim() || null,
        prepared_by_position: preparedByPosition.trim() || null,
        // A stored NULL legend is shown as the default text; re-send NULL
        // unless the user actually edited it, so an unchanged TOS stays an
        // unchanged row.
        legend:
          editData?.id &&
          !editData.legend &&
          legend === TOS_DEFAULT_LEGEND
            ? null
            : legend.trim() || null,
        is_active: isActive,
      };

      let tosId: string;
      if (editData?.id) {
        // Archiving: write is_active alone first. 195's header guard treats
        // an is_active-only change as bookkeeping, and once the row is
        // archived neither guard re-checks the rest of this save — so an
        // unmapped legacy (or SNED) TOS can be archived.
        if (editData.is_active !== false && !isActive) {
          const { error } = await supabase
            .from("sms_tos")
            .update({ is_active: false })
            .eq("id", editData.id);
          if (error) throw new Error(error.message);
        }
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
        createdId = tosId;
      }

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
          // The database copies text and LC code from the catalogue entry.
          competency_text: c.competency_text.trim(),
          lc_code: c.lc_code.trim() || null,
          catalogue_competency_id: c.catalogue_competency_id
            ? Number(c.catalogue_competency_id)
            : null,
          no_of_days: c.no_of_days,
          no_of_items: c.no_of_items,
          position: i,
        };
        if (c.id) {
          keptIds.push(c.id);
          const { error } = await supabase
            .from("sms_tos_competencies")
            .update(row)
            .eq("id", c.id);
          if (error) throw new Error(`Competency ${i + 1}: ${error.message}`);
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
          if (error) throw new Error(`Competency ${i + 1}: ${error.message}`);
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
        const { error } = await supabase
          .from("sms_tos_competencies")
          .delete()
          .in("id", removed);
        if (error) throw new Error(error.message);
      }

      // Rebuild item placement from scratch — only once every competency
      // write has gone through, so a refused one leaves the placement intact.
      {
        const { error } = await supabase
          .from("sms_tos_items")
          .delete()
          .eq("tos_id", tosId);
        if (error) throw new Error(error.message);
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
      if (createdId) {
        await supabase.from("sms_tos").delete().eq("id", createdId);
      }
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

  const formId = useId();
  const assignedDays = competencies.reduce((s, c) => s + c.no_of_days, 0);
  const itemsDelta = placedItems - totalItems;
  const daysDelta = assignedDays - totalDays;
  const periodLabel =
    getGradingPeriodType(schoolYear) === "term" ? "Term" : "Quarter";
  const pickerDisabled = isSubmitting || !learningAreaId || gradeLevel === "";
  const fieldId = (name: string) => `${formId}-${name}`;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {/* Header — stays put while the body scrolls */}
        <div className="border-b px-6 pt-5 pb-4">
          <DialogHeader className="pr-8">
            <DialogTitle className="text-xl font-semibold">
              {editData ? "Edit" : "Create"} Table of Specification
            </DialogTitle>
            <DialogDescription>
              {mode === "division"
                ? "Division-authored TOS is visible to all subject teachers once approved."
                : "Plan how many items each competency gets and at which cognitive level."}
            </DialogDescription>
          </DialogHeader>

          {/* Live allocation summary */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <SummaryStat
              label="Items placed"
              value={`${placedItems} / ${totalItems}`}
              progress={totalItems > 0 ? placedItems / totalItems : 0}
              tone={itemsDelta === 0 && totalItems > 0 ? "ok" : "warn"}
              note={
                itemsDelta === 0
                  ? totalItems > 0
                    ? "Matches the target"
                    : "Set a total"
                  : `${Math.abs(itemsDelta)} ${itemsDelta > 0 ? "over" : "short"}`
              }
            />
            <SummaryStat
              label="Days assigned"
              value={`${formatNum(assignedDays)} / ${formatNum(totalDays)}`}
              progress={totalDays > 0 ? assignedDays / totalDays : 0}
              tone={daysDelta === 0 && totalDays > 0 ? "ok" : "warn"}
              note={
                totalDays <= 0
                  ? "Set the total days"
                  : daysDelta === 0
                    ? "All days accounted for"
                    : `${formatNum(Math.abs(daysDelta))} ${daysDelta > 0 ? "over" : "unassigned"}`
              }
            />
            <SummaryStat
              label="Competencies"
              value={`${pickedIds.length} picked`}
              progress={
                competencies.length > 0
                  ? pickedIds.length / competencies.length
                  : 0
              }
              tone={
                pickedIds.length > 0 && pickedIds.length === competencies.length
                  ? "ok"
                  : "warn"
              }
              note={
                competencies.length - pickedIds.length > 0
                  ? `${competencies.length - pickedIds.length} not picked from the catalogue yet`
                  : "All rows mapped"
              }
            />
          </div>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-muted/30 px-6 py-5">
          {/* 1 — Coverage */}
          <FormSection
            step={1}
            title="Subject and period"
            description="The catalogue competencies you can pick depend on the learning area and grade level."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mode === "teacher" && teacherSubjects.length > 0 && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label htmlFor={fieldId("prefill")} className="mb-1.5 block">
                    Start from one of my subjects{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Select
                    value={subjectId}
                    onValueChange={applyTeacherSubject}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id={fieldId("prefill")} className="w-full">
                      <SelectValue placeholder="Fills in the learning area and grade level" />
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
                <Label htmlFor={fieldId("area")} className="mb-1.5 block">
                  Learning area <RequiredMark />
                </Label>
                <Select
                  value={learningAreaId}
                  onValueChange={handleLearningAreaChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id={fieldId("area")} className="w-full">
                    <SelectValue
                      placeholder={
                        subjectName && !learningAreaId
                          ? `${subjectName} (not in the catalogue)`
                          : "Select learning area"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {areas
                      .filter(
                        (a) => a.is_active || String(a.id) === learningAreaId,
                      )
                      .map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                          {!a.is_active && " (retired)"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {areas.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    The competency catalogue is empty. Ask the division office
                    to import it.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor={fieldId("grade")} className="mb-1.5 block">
                  Grade level <RequiredMark />
                </Label>
                <Select
                  value={gradeLevel}
                  onValueChange={handleGradeLevelChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id={fieldId("grade")} className="w-full">
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* The catalogue covers SNED, Kindergarten and Grades 1-12. */}
                    {GRADE_LEVELS.filter((g) => CATALOGUE_GRADES.includes(g)).map(
                      (g) => (
                        <SelectItem key={g} value={String(g)}>
                          {getGradeLevelLabel(g)}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor={fieldId("examType")} className="mb-1.5 block">
                  Exam type
                </Label>
                <Select
                  value={examType}
                  onValueChange={setExamType}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id={fieldId("examType")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      (EXAM_TYPE_OPTIONS as readonly string[]).includes(examType)
                        ? EXAM_TYPE_OPTIONS
                        : [...EXAM_TYPE_OPTIONS, examType]
                    ).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor={fieldId("sy")} className="mb-1.5 block">
                  School year <RequiredMark />
                </Label>
                <Select
                  value={schoolYear}
                  onValueChange={handleSchoolYearChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id={fieldId("sy")} className="w-full">
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
                <Label htmlFor={fieldId("period")} className="mb-1.5 block">
                  {periodLabel} <RequiredMark />
                </Label>
                <Select
                  value={gradingPeriod}
                  onValueChange={setGradingPeriod}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id={fieldId("period")} className="w-full">
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
            </div>
          </FormSection>

          {/* 2 — Test size */}
          <FormSection
            step={2}
            title="Test size"
            description="How many items the test has and how many class days the period covered."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor={fieldId("totalItems")} className="mb-1.5 block">
                  Total items <RequiredMark />
                </Label>
                <Input
                  id={fieldId("totalItems")}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={totalItems}
                  onChange={(e) =>
                    handleTotalItemsChange(Number(e.target.value || 0))
                  }
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <Label htmlFor={fieldId("totalDays")} className="mb-1.5 block">
                  Total no. of days <RequiredMark />
                </Label>
                <Input
                  id={fieldId("totalDays")}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.5"
                  value={totalDays}
                  onChange={(e) =>
                    handleTotalDaysChange(Number(e.target.value || 0))
                  }
                  disabled={isSubmitting}
                />
              </div>
              <div className="flex items-start gap-3 rounded-md border bg-background p-3 sm:col-span-2 lg:col-span-1">
                <Switch
                  id={fieldId("auto")}
                  checked={autoItems}
                  onCheckedChange={handleAutoItemsToggle}
                  disabled={isSubmitting}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor={fieldId("auto")} className="text-sm">
                    Distribute items by days
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {autoItems
                      ? "Items = days ÷ total days × total items, rounded."
                      : "Off — type each competency's item count yourself."}
                  </p>
                </div>
              </div>
            </div>
          </FormSection>

          {/* 3 — Competencies */}
          <FormSection
            step={3}
            title="Learning competencies"
            description={
              pickerDisabled && !isSubmitting
                ? "Choose a learning area and grade level in step 1 to pick competencies."
                : "Search the catalogue by LC code or text, then enter the days spent on each."
            }
          >
            {!loadingChildren && unmapped > 0 && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <span className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {unmapped} competenc{unmapped === 1 ? "y was" : "ies were"}{" "}
                    typed before the competency catalogue.{" "}
                    {catalogueExempt
                      ? "This TOS is saved archived, so mapping is optional."
                      : "Map each one before saving."}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    isSubmitting || !learningAreaId || catalogue.length === 0
                  }
                  onClick={applySuggestions}
                >
                  Apply suggestions
                </Button>
              </div>
            )}

            {loadingChildren ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border bg-background">
                <div className="hidden grid-cols-[2rem_minmax(0,1fr)_7rem_7rem_2.5rem] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground md:grid">
                  <div>#</div>
                  <div>Competency (LC code)</div>
                  <div className="text-center">Days</div>
                  <div className="text-center">Items</div>
                  <div />
                </div>
                <ol className="divide-y">
                  {(() => {
                    let running = 0;
                    return competencies.map((c, idx) => {
                      const first = running + 1;
                      running += Math.max(0, c.no_of_items);
                      const last = running;
                      return (
                        <li
                          key={c.key}
                          className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-start gap-x-3 gap-y-2 px-3 py-3 md:grid-cols-[2rem_minmax(0,1fr)_7rem_7rem_2.5rem]"
                        >
                          <span className="mt-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                            {idx + 1}
                          </span>

                          <div className="col-span-2 min-w-0 md:col-span-1">
                            {c.catalogue_competency_id ||
                            !c.competency_text.trim() ? (
                              <CataloguePicker
                                options={catalogue}
                                value={c.catalogue_competency_id}
                                excludeIds={pickedIds}
                                disabled={pickerDisabled}
                                placeholder={
                                  learningAreaId && gradeLevel !== ""
                                    ? "Search the catalogue…"
                                    : "Choose a learning area and grade first"
                                }
                                onChange={(cat) => setCatalogueLink(idx, cat)}
                              />
                            ) : (
                              <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-2">
                                <p className="text-xs font-medium text-amber-900">
                                  Typed before the catalogue — map it:
                                </p>
                                <p className="text-sm">
                                  {c.lc_code && (
                                    <span className="mr-2 font-mono text-xs">
                                      {c.lc_code}
                                    </span>
                                  )}
                                  {c.competency_text}
                                </p>
                                <CataloguePicker
                                  options={catalogue}
                                  value={null}
                                  excludeIds={pickedIds}
                                  disabled={pickerDisabled}
                                  placeholder="Pick the matching catalogue entry"
                                  onChange={(cat) => setCatalogueLink(idx, cat)}
                                />
                              </div>
                            )}
                          </div>

                          {/* Remove sits beside Days/Items on mobile, last column on desktop */}
                          <div className="col-start-3 row-start-2 mt-5 flex justify-end md:order-last md:col-start-auto md:row-start-auto md:mt-0">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 text-muted-foreground hover:text-destructive"
                              onClick={() => removeCompetency(idx)}
                              disabled={isSubmitting || competencies.length <= 1}
                              aria-label={`Remove competency ${idx + 1}`}
                              title="Remove competency"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="col-start-2 grid grid-cols-2 gap-2 md:col-start-auto md:contents">
                            <div>
                              <Label
                                htmlFor={fieldId(`days-${c.key}`)}
                                className="mb-1 block text-xs text-muted-foreground md:sr-only"
                              >
                                Days
                              </Label>
                              <Input
                                id={fieldId(`days-${c.key}`)}
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.5"
                                value={c.no_of_days}
                                onChange={(e) =>
                                  setDays(idx, Number(e.target.value || 0))
                                }
                                disabled={isSubmitting}
                                className="text-center tabular-nums"
                              />
                            </div>
                            <div>
                              <Label
                                htmlFor={fieldId(`items-${c.key}`)}
                                className="mb-1 block text-xs text-muted-foreground md:sr-only"
                              >
                                Items
                              </Label>
                              <Input
                                id={fieldId(`items-${c.key}`)}
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={c.no_of_items}
                                onChange={(e) =>
                                  setManualItems(idx, Number(e.target.value || 0))
                                }
                                disabled={isSubmitting}
                                readOnly={autoItems}
                                aria-describedby={fieldId(`range-${c.key}`)}
                                className={cn(
                                  "text-center tabular-nums",
                                  autoItems &&
                                    "cursor-default bg-muted/60 text-foreground focus-visible:ring-0",
                                )}
                                title={
                                  autoItems
                                    ? "Computed from days — turn off “Distribute items by days” to edit"
                                    : undefined
                                }
                              />
                              <p
                                id={fieldId(`range-${c.key}`)}
                                className="mt-1 text-center text-[11px] tabular-nums text-muted-foreground"
                              >
                                {c.no_of_items > 0
                                  ? first === last
                                    ? `Item ${first}`
                                    : `Items ${first}–${last}`
                                  : "No items"}
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    });
                  })()}
                </ol>
                <div className="border-t bg-muted/20 p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-center border border-dashed text-muted-foreground hover:text-foreground"
                    onClick={addCompetency}
                    disabled={isSubmitting}
                  >
                    <Plus className="h-4 w-4" /> Add competency
                  </Button>
                </div>
              </div>
            )}
          </FormSection>

          {/* 4 — Cognitive levels */}
          <FormSection
            step={4}
            title="Cognitive level per item"
            description="Items are numbered in competency order. Every item starts at Remembering."
          >
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
          </FormSection>

          {/* 5 — Print details & sharing */}
          <FormSection
            step={5}
            title="Print details and sharing"
            description="What appears on the printed TOS, and who can see it."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor={fieldId("title")} className="mb-1.5 block">
                  Title{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Input
                  id={fieldId("title")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Leave blank to auto-generate"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <Label htmlFor={fieldId("prepName")} className="mb-1.5 block">
                  Prepared by
                </Label>
                <Input
                  id={fieldId("prepName")}
                  value={preparedByName}
                  onChange={(e) => setPreparedByName(e.target.value)}
                  placeholder="e.g., Juan D. Cruz"
                  autoComplete="name"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <Label htmlFor={fieldId("prepPos")} className="mb-1.5 block">
                  Position
                </Label>
                <Input
                  id={fieldId("prepPos")}
                  value={preparedByPosition}
                  onChange={(e) => setPreparedByPosition(e.target.value)}
                  placeholder="e.g., Teacher III"
                  disabled={isSubmitting}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={fieldId("legend")} className="mb-1.5 block">
                  Legend
                </Label>
                <Input
                  id={fieldId("legend")}
                  value={legend}
                  onChange={(e) => setLegend(e.target.value)}
                  disabled={isSubmitting}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Printed as the footnote under the table.
                </p>
              </div>

              <ToggleCard
                id={fieldId("active")}
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={isSubmitting}
                label="Active"
                hint={
                  isActive
                    ? "Shown in lists and available when building exams."
                    : "Archived — kept, but hidden from new exams."
                }
              />

              {/* Sharing tier (migration 160). Division exams are shared by
                  definition, so the choice only exists school-side. */}
              {mode === "teacher" && (
                <ToggleCard
                  id={fieldId("shared")}
                  checked={isSchoolShared}
                  onCheckedChange={setIsSchoolShared}
                  disabled={isSubmitting || schoolId == null}
                  label="Share with my whole school"
                  hint={
                    schoolId == null
                      ? "No school is set for your account, so this can only be private to you."
                      : isSchoolShared
                        ? "Every teacher at your school can see and build from this. Your school head can edit it."
                        : "Private — only you can see this."
                  }
                />
              )}
            </div>
          </FormSection>

          {/* Preview */}
          <section className="rounded-lg border bg-background">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              aria-expanded={showPreview}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
                Preview the printed TOS
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  showPreview && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            {showPreview && (
              <div className="border-t p-3">
                <div className="overflow-x-auto rounded border bg-white p-3">
                  <TosPreviewTable
                    header={{
                      title,
                      subject_name: effectiveSubjectName || "—",
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
              </div>
            )}
          </section>
        </div>

        {/* Footer — always reachable */}
        <div className="flex flex-col-reverse gap-3 border-t bg-background px-6 py-3 sm:flex-row sm:items-center sm:justify-end">
          {saveBlocker && (
            <p
              className="flex items-start gap-2 text-sm text-amber-700 sm:mr-auto"
              role="status"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {saveBlocker}
            </p>
          )}
          <div className="flex gap-2 sm:shrink-0">
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="default"
              onClick={onSubmit}
              disabled={isSubmitting || saveBlocker !== null}
              className="min-w-[120px] flex-1 sm:flex-none"
              title={saveBlocker ?? undefined}
            >
              {isSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              {isSubmitting
                ? "Saving…"
                : editData
                  ? "Save changes"
                  : "Create TOS"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const formatNum = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

