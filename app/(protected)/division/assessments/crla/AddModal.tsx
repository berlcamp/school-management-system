"use client";

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
  ASSESSMENT_PHASES,
  CRLA_DEFAULT_BANDS,
  CRLA_DEFAULT_TASKS,
  CRLA_GRADES,
  CRLA_LANGUAGES,
  getGradeLevelLabel,
} from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { CrlaMaterial } from "@/types";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface TaskRow {
  id?: string;
  label: string;
  task_type: string;
  items: string;
  max_score: number;
}

interface BandRow {
  min_score: number;
  max_score: number;
  label: string;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: CrlaMaterial | null;
}

const TASK_TYPES = [
  { value: "letters", label: "Letters / Sounds" },
  { value: "words", label: "Words" },
  { value: "sentences", label: "Sentences" },
  { value: "passage", label: "Passage" },
];

const emptyTask = (): TaskRow => ({
  label: "",
  task_type: "words",
  items: "",
  max_score: 10,
});

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingChildren, setLoadingChildren] = useState(false);

  const [title, setTitle] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [language, setLanguage] = useState("");
  const [phases, setPhases] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [passageTitle, setPassageTitle] = useState("");
  const [passageText, setPassageText] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [bands, setBands] = useState<BandRow[]>([]);
  const [originalTaskIds, setOriginalTaskIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    if (editData?.id) {
      setTitle(editData.title || "");
      setGradeLevel(String(editData.grade_level));
      setLanguage(editData.language || "");
      setPhases(editData.phases || []);
      setInstructions(editData.instructions || "");
      setPassageTitle(editData.passage_title || "");
      setPassageText(editData.passage_text || "");
      setIsActive(editData.is_active ?? true);

      const loadChildren = async () => {
        setLoadingChildren(true);
        const [{ data: taskRows }, { data: bandRows }] = await Promise.all([
          supabase
            .from("sms_crla_material_tasks")
            .select("*")
            .eq("material_id", editData.id)
            .order("position"),
          supabase
            .from("sms_crla_bands")
            .select("*")
            .eq("material_id", editData.id)
            .order("position"),
        ]);
        setTasks(
          (taskRows || []).map((t) => ({
            id: String(t.id),
            label: t.label || "",
            task_type: t.task_type || "words",
            items: t.items || "",
            max_score: Number(t.max_score),
          })),
        );
        setOriginalTaskIds((taskRows || []).map((t) => String(t.id)));
        setBands(
          (bandRows || []).map((b) => ({
            min_score: Number(b.min_score),
            max_score: Number(b.max_score),
            label: b.label || "",
          })),
        );
        setLoadingChildren(false);
      };
      loadChildren();
    } else {
      setTitle("");
      setGradeLevel("");
      setLanguage("");
      setPhases([]);
      setInstructions("");
      setPassageTitle("");
      setPassageText("");
      setIsActive(true);
      setTasks(CRLA_DEFAULT_TASKS.map((t) => ({ ...t, items: "" })));
      setOriginalTaskIds([]);
      setBands(CRLA_DEFAULT_BANDS.map((b) => ({ ...b })));
    }
  }, [isOpen, editData]);

  const setTask = (idx: number, patch: Partial<TaskRow>) =>
    setTasks((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  const setBand = (idx: number, patch: Partial<BandRow>) =>
    setBands((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));

  const onSubmit = async () => {
    if (isSubmitting) return;

    if (!title.trim()) return toast.error("Title is required.");
    if (!gradeLevel) return toast.error("Grade level is required.");
    if (!language) return toast.error("Language is required.");
    const validTasks = tasks.filter((t) => t.label.trim());
    if (validTasks.length === 0)
      return toast.error("Add at least one scoring task.");
    if (validTasks.some((t) => !t.max_score || t.max_score <= 0))
      return toast.error("Each task needs a max score greater than 0.");
    const validBands = bands.filter((b) => b.label.trim());

    setIsSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        grade_level: Number(gradeLevel),
        language,
        phases,
        instructions: instructions.trim() || null,
        passage_title: passageTitle.trim() || null,
        passage_text: passageText.trim() || null,
        is_active: isActive,
      };

      let materialId: string;
      if (editData?.id) {
        const { error } = await supabase
          .from("sms_crla_materials")
          .update(payload)
          .eq("id", editData.id);
        if (error) throw new Error(error.message);
        materialId = String(editData.id);
      } else {
        const { data: inserted, error } = await supabase
          .from("sms_crla_materials")
          .insert([{ ...payload, created_by: user?.system_user_id ?? null }])
          .select()
          .single();
        if (error) throw new Error(error.message);
        materialId = String(inserted.id);
      }

      // Sync tasks: update existing (preserve recorded scores), insert new,
      // delete removed rows.
      const keptIds: string[] = [];
      for (let i = 0; i < validTasks.length; i++) {
        const t = validTasks[i];
        const row = {
          label: t.label.trim(),
          task_type: t.task_type,
          items: t.items.trim() || null,
          max_score: t.max_score,
          position: i,
        };
        if (t.id) {
          keptIds.push(t.id);
          await supabase
            .from("sms_crla_material_tasks")
            .update(row)
            .eq("id", t.id);
        } else {
          await supabase
            .from("sms_crla_material_tasks")
            .insert([{ ...row, material_id: Number(materialId) }]);
        }
      }
      const removedIds = originalTaskIds.filter((id) => !keptIds.includes(id));
      if (removedIds.length > 0) {
        await supabase
          .from("sms_crla_material_tasks")
          .delete()
          .in("id", removedIds);
      }

      // Bands have no downstream FK — replace wholesale.
      await supabase.from("sms_crla_bands").delete().eq("material_id", materialId);
      if (validBands.length > 0) {
        await supabase.from("sms_crla_bands").insert(
          validBands.map((b, i) => ({
            material_id: Number(materialId),
            min_score: b.min_score,
            max_score: b.max_score,
            label: b.label.trim(),
            position: i,
          })),
        );
      }

      const { data: fresh } = await supabase
        .from("sms_crla_materials")
        .select("*")
        .eq("id", materialId)
        .single();
      if (fresh) {
        dispatch(editData?.id ? updateList(fresh) : addItem(fresh));
      }

      toast.success(editData ? "Material updated!" : "Material added!");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error saving material");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {editData ? "Edit" : "Add"} CRLA Material
          </DialogTitle>
          <DialogDescription>
            Define the learner-sheet tasks, reading passage, and reading-profile
            bands for one grade level and language.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="mb-1.5 block">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., CRLA Grade 3 English"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">
                Grade Level <span className="text-red-500">*</span>
              </Label>
              <Select value={gradeLevel} onValueChange={setGradeLevel} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {CRLA_GRADES.map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      {getGradeLevelLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">
                Language <span className="text-red-500">*</span>
              </Label>
              <Select value={language} onValueChange={setLanguage} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
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
            <div className="col-span-2">
              <Label className="mb-1.5 block">Phases</Label>
              <div className="flex flex-wrap items-center gap-4">
                {ASSESSMENT_PHASES.map((p) => (
                  <label
                    key={p.value}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={phases.includes(p.value)}
                      disabled={isSubmitting}
                      onChange={(e) =>
                        setPhases((prev) =>
                          e.target.checked
                            ? [...prev, p.value]
                            : prev.filter((v) => v !== p.value),
                        )
                      }
                    />
                    {p.value}
                  </label>
                ))}
                <span className="text-xs text-muted-foreground">
                  Leave all unchecked to apply to any phase.
                </span>
              </div>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch checked={isActive} onCheckedChange={setIsActive} disabled={isSubmitting} />
              <Label>Active</Label>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">Instructions</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Scoring / administration notes shown on the learner sheet…"
              rows={2}
              disabled={isSubmitting}
            />
          </div>

          {/* Tasks editor */}
          <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Scoring Tasks</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setTasks((prev) => [...prev, emptyTask()])}
                disabled={isSubmitting}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add task
              </Button>
            </div>
            {loadingChildren ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              tasks.map((t, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-3">
                    <Input
                      value={t.label}
                      onChange={(e) => setTask(idx, { label: e.target.value })}
                      placeholder="Label (e.g. Task 1)"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="col-span-2">
                    <Select
                      value={t.task_type}
                      onValueChange={(v) => setTask(idx, { task_type: v })}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_TYPES.map((tt) => (
                          <SelectItem key={tt.value} value={tt.value}>
                            {tt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Input
                      value={t.items}
                      onChange={(e) => setTask(idx, { items: e.target.value })}
                      placeholder="Items to print, comma/line separated"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min={1}
                      value={t.max_score}
                      onChange={(e) =>
                        setTask(idx, { max_score: Number(e.target.value || 0) })
                      }
                      placeholder="Max"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setTasks((prev) => prev.filter((_, i) => i !== idx))
                      }
                      disabled={isSubmitting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Reading passage */}
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-semibold">Reading Profile Passage</p>
            <Input
              value={passageTitle}
              onChange={(e) => setPassageTitle(e.target.value)}
              placeholder="Passage title"
              disabled={isSubmitting}
            />
            <Textarea
              value={passageText}
              onChange={(e) => setPassageText(e.target.value)}
              placeholder="Full passage text the learner will read…"
              rows={5}
              disabled={isSubmitting}
            />
          </div>

          {/* Bands editor */}
          <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                Reading-Profile Bands (by total score)
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setBands((prev) => [
                    ...prev,
                    { min_score: 0, max_score: 0, label: "" },
                  ])
                }
                disabled={isSubmitting}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add band
              </Button>
            </div>
            {bands.map((b, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-2">
                  <Input
                    type="number"
                    value={b.min_score}
                    onChange={(e) =>
                      setBand(idx, { min_score: Number(e.target.value || 0) })
                    }
                    placeholder="Min"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    value={b.max_score}
                    onChange={(e) =>
                      setBand(idx, { max_score: Number(e.target.value || 0) })
                    }
                    placeholder="Max"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="col-span-7">
                  <Input
                    value={b.label}
                    onChange={(e) => setBand(idx, { label: e.target.value })}
                    placeholder="Reading profile (e.g. Grade Ready)"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setBands((prev) => prev.filter((_, i) => i !== idx))
                    }
                    disabled={isSubmitting}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isSubmitting} className="min-w-[100px]">
            {isSubmitting ? "Saving…" : editData ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
