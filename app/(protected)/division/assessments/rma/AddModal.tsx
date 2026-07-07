"use client";

import { Button } from "@/components/ui/button";
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
  getGradeLevelLabel,
  RMA_DEFAULT_BANDS,
  RMA_DOMAINS,
  RMA_GRADES,
} from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { RmaMaterial } from "@/types";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface ItemRow {
  id?: string;
  domain: string;
  question_text: string;
  correct_answer: string;
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
  editData?: RmaMaterial | null;
}

const emptyItem = (): ItemRow => ({
  domain: RMA_DOMAINS[0],
  question_text: "",
  correct_answer: "",
  max_score: 1,
});

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingChildren, setLoadingChildren] = useState(false);

  const [title, setTitle] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [bands, setBands] = useState<BandRow[]>([]);
  const [originalItemIds, setOriginalItemIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    if (editData?.id) {
      setTitle(editData.title || "");
      setGradeLevel(String(editData.grade_level));
      setInstructions(editData.instructions || "");
      setIsActive(editData.is_active ?? true);

      const loadChildren = async () => {
        setLoadingChildren(true);
        const [{ data: itemRows }, { data: bandRows }] = await Promise.all([
          supabase
            .from("sms_rma_items")
            .select("*")
            .eq("material_id", editData.id)
            .order("position"),
          supabase
            .from("sms_rma_bands")
            .select("*")
            .eq("material_id", editData.id)
            .order("position"),
        ]);
        setItems(
          (itemRows || []).map((it) => ({
            id: String(it.id),
            domain: it.domain || "",
            question_text: it.question_text || "",
            correct_answer: it.correct_answer || "",
            max_score: Number(it.max_score),
          })),
        );
        setOriginalItemIds((itemRows || []).map((it) => String(it.id)));
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
      setInstructions("");
      setIsActive(true);
      setItems([emptyItem(), emptyItem(), emptyItem()]);
      setOriginalItemIds([]);
      setBands(RMA_DEFAULT_BANDS.map((b) => ({ ...b })));
    }
  }, [isOpen, editData]);

  const setItem = (idx: number, patch: Partial<ItemRow>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const setBand = (idx: number, patch: Partial<BandRow>) =>
    setBands((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));

  const onSubmit = async () => {
    if (isSubmitting) return;
    if (!title.trim()) return toast.error("Title is required.");
    if (!gradeLevel) return toast.error("Grade level is required.");
    const validItems = items.filter(
      (it) => it.question_text.trim() || it.domain,
    );
    if (validItems.length === 0)
      return toast.error("Add at least one item.");
    if (validItems.some((it) => !it.max_score || it.max_score <= 0))
      return toast.error("Each item needs a max score greater than 0.");
    const validBands = bands.filter((b) => b.label.trim());

    setIsSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        grade_level: Number(gradeLevel),
        instructions: instructions.trim() || null,
        is_active: isActive,
      };

      let materialId: string;
      if (editData?.id) {
        const { error } = await supabase
          .from("sms_rma_materials")
          .update(payload)
          .eq("id", editData.id);
        if (error) throw new Error(error.message);
        materialId = String(editData.id);
      } else {
        const { data: inserted, error } = await supabase
          .from("sms_rma_materials")
          .insert([{ ...payload, created_by: user?.system_user_id ?? null }])
          .select()
          .single();
        if (error) throw new Error(error.message);
        materialId = String(inserted.id);
      }

      const keptIds: string[] = [];
      for (let i = 0; i < validItems.length; i++) {
        const it = validItems[i];
        const row = {
          item_no: i + 1,
          domain: it.domain || null,
          question_text: it.question_text.trim() || null,
          correct_answer: it.correct_answer.trim() || null,
          max_score: it.max_score,
          position: i,
        };
        if (it.id) {
          keptIds.push(it.id);
          await supabase.from("sms_rma_items").update(row).eq("id", it.id);
        } else {
          await supabase
            .from("sms_rma_items")
            .insert([{ ...row, material_id: Number(materialId) }]);
        }
      }
      const removedIds = originalItemIds.filter((id) => !keptIds.includes(id));
      if (removedIds.length > 0) {
        await supabase.from("sms_rma_items").delete().in("id", removedIds);
      }

      await supabase.from("sms_rma_bands").delete().eq("material_id", materialId);
      if (validBands.length > 0) {
        await supabase.from("sms_rma_bands").insert(
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
        .from("sms_rma_materials")
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
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {editData ? "Edit" : "Add"} RMA Material
          </DialogTitle>
          <DialogDescription>
            Define the math items (by domain) and mastery bands for one grade
            level.
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
                placeholder="e.g., RMA Grade 4"
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
                  {RMA_GRADES.map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      {getGradeLevelLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          <div>
            <Label className="mb-1.5 block">Instructions</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Administration / scoring notes…"
              rows={2}
              disabled={isSubmitting}
            />
          </div>

          {/* Items editor */}
          <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Items</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
                disabled={isSubmitting}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add item
              </Button>
            </div>
            {loadingChildren ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-1 pt-2 text-sm text-muted-foreground">
                    {idx + 1}.
                  </div>
                  <div className="col-span-3">
                    <Select
                      value={it.domain}
                      onValueChange={(v) => setItem(idx, { domain: v })}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Domain" />
                      </SelectTrigger>
                      <SelectContent>
                        {RMA_DOMAINS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Input
                      value={it.question_text}
                      onChange={(e) =>
                        setItem(idx, { question_text: e.target.value })
                      }
                      placeholder="Item / question (optional)"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      value={it.correct_answer}
                      onChange={(e) =>
                        setItem(idx, { correct_answer: e.target.value })
                      }
                      placeholder="Answer"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="col-span-1">
                    <Input
                      type="number"
                      min={1}
                      value={it.max_score}
                      onChange={(e) =>
                        setItem(idx, { max_score: Number(e.target.value || 0) })
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
                        setItems((prev) => prev.filter((_, i) => i !== idx))
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

          {/* Bands editor */}
          <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                Mastery Bands (by % of total score)
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
                    placeholder="Min %"
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
                    placeholder="Max %"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="col-span-7">
                  <Input
                    value={b.label}
                    onChange={(e) => setBand(idx, { label: e.target.value })}
                    placeholder="Mastery level (e.g. Proficient)"
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
};
