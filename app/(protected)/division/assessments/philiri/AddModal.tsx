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
  PHILIRI_GRADES,
  PHILIRI_LANGUAGES,
  PHILIRI_QUESTION_TYPES,
} from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { PhilIriMaterial } from "@/types";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface QuestionRow {
  id?: string;
  question_text: string;
  correct_answer: string;
  question_type: string;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: PhilIriMaterial | null;
}

const emptyQuestion = (): QuestionRow => ({
  question_text: "",
  correct_answer: "",
  question_type: "literal",
});

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingChildren, setLoadingChildren] = useState(false);

  const [title, setTitle] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [language, setLanguage] = useState("");
  const [setLabel, setSetLabel] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [instructions, setInstructions] = useState("");
  const [passageTitle, setPassageTitle] = useState("");
  const [passageText, setPassageText] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [originalQuestionIds, setOriginalQuestionIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    if (editData?.id) {
      setTitle(editData.title || "");
      setGradeLevel(String(editData.grade_level));
      setLanguage(editData.language || "");
      setSetLabel(editData.set_label || "");
      setWordCount(editData.word_count || 0);
      setInstructions(editData.instructions || "");
      setPassageTitle(editData.passage_title || "");
      setPassageText(editData.passage_text || "");
      setIsActive(editData.is_active ?? true);

      const loadChildren = async () => {
        setLoadingChildren(true);
        const { data: rows } = await supabase
          .from("sms_philiri_questions")
          .select("*")
          .eq("material_id", editData.id)
          .order("position");
        setQuestions(
          (rows || []).map((q) => ({
            id: String(q.id),
            question_text: q.question_text || "",
            correct_answer: q.correct_answer || "",
            question_type: q.question_type || "literal",
          })),
        );
        setOriginalQuestionIds((rows || []).map((q) => String(q.id)));
        setLoadingChildren(false);
      };
      loadChildren();
    } else {
      setTitle("");
      setGradeLevel("");
      setLanguage("");
      setSetLabel("");
      setWordCount(0);
      setInstructions("");
      setPassageTitle("");
      setPassageText("");
      setIsActive(true);
      setQuestions([emptyQuestion(), emptyQuestion(), emptyQuestion()]);
      setOriginalQuestionIds([]);
    }
  }, [isOpen, editData]);

  const setQuestion = (idx: number, patch: Partial<QuestionRow>) =>
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    );

  const onSubmit = async () => {
    if (isSubmitting) return;
    if (!title.trim()) return toast.error("Title is required.");
    if (!gradeLevel) return toast.error("Grade level is required.");
    if (!language) return toast.error("Language is required.");
    if (!wordCount || wordCount <= 0)
      return toast.error("Passage word count must be greater than 0.");
    const validQuestions = questions.filter((q) => q.question_text.trim());
    if (validQuestions.length === 0)
      return toast.error("Add at least one comprehension question.");

    setIsSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        grade_level: Number(gradeLevel),
        language,
        set_label: setLabel.trim() || null,
        word_count: wordCount,
        instructions: instructions.trim() || null,
        passage_title: passageTitle.trim() || null,
        passage_text: passageText.trim() || null,
        is_active: isActive,
      };

      let materialId: string;
      if (editData?.id) {
        const { error } = await supabase
          .from("sms_philiri_materials")
          .update(payload)
          .eq("id", editData.id);
        if (error) throw new Error(error.message);
        materialId = String(editData.id);
      } else {
        const { data: inserted, error } = await supabase
          .from("sms_philiri_materials")
          .insert([{ ...payload, created_by: user?.system_user_id ?? null }])
          .select()
          .single();
        if (error) throw new Error(error.message);
        materialId = String(inserted.id);
      }

      const keptIds: string[] = [];
      for (let i = 0; i < validQuestions.length; i++) {
        const q = validQuestions[i];
        const row = {
          question_no: i + 1,
          question_text: q.question_text.trim(),
          correct_answer: q.correct_answer.trim() || null,
          question_type: q.question_type,
          position: i,
        };
        if (q.id) {
          keptIds.push(q.id);
          await supabase
            .from("sms_philiri_questions")
            .update(row)
            .eq("id", q.id);
        } else {
          await supabase
            .from("sms_philiri_questions")
            .insert([{ ...row, material_id: Number(materialId) }]);
        }
      }
      const removedIds = originalQuestionIds.filter(
        (id) => !keptIds.includes(id),
      );
      if (removedIds.length > 0) {
        await supabase
          .from("sms_philiri_questions")
          .delete()
          .in("id", removedIds);
      }

      const { data: fresh } = await supabase
        .from("sms_philiri_materials")
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
            {editData ? "Edit" : "Add"} Phil-IRI Material
          </DialogTitle>
          <DialogDescription>
            Define the graded passage, its word count, and the comprehension
            questions for one grade level and language.
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
                placeholder="e.g., Phil-IRI Grade 4 English — Set A"
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
                  {PHILIRI_GRADES.map((g) => (
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
              <Select
                value={language}
                onValueChange={setLanguage}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
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
            <div>
              <Label className="mb-1.5 block">Set label</Label>
              <Input
                value={setLabel}
                onChange={(e) => setSetLabel(e.target.value)}
                placeholder="e.g., Set A"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">
                Passage word count <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                min={1}
                value={wordCount}
                onChange={(e) => setWordCount(Number(e.target.value || 0))}
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

          <div>
            <Label className="mb-1.5 block">Instructions</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Administration notes…"
              rows={2}
              disabled={isSubmitting}
            />
          </div>

          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-semibold">Reading Passage</p>
            <Input
              value={passageTitle}
              onChange={(e) => setPassageTitle(e.target.value)}
              placeholder="Passage title"
              disabled={isSubmitting}
            />
            <Textarea
              value={passageText}
              onChange={(e) => setPassageText(e.target.value)}
              placeholder="Full graded passage text…"
              rows={6}
              disabled={isSubmitting}
            />
          </div>

          <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Comprehension Questions</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setQuestions((prev) => [...prev, emptyQuestion()])
                }
                disabled={isSubmitting}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add question
              </Button>
            </div>
            {loadingChildren ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              questions.map((q, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-1 pt-2 text-sm text-muted-foreground">
                    {idx + 1}.
                  </div>
                  <div className="col-span-5">
                    <Input
                      value={q.question_text}
                      onChange={(e) =>
                        setQuestion(idx, { question_text: e.target.value })
                      }
                      placeholder="Question"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      value={q.correct_answer}
                      onChange={(e) =>
                        setQuestion(idx, { correct_answer: e.target.value })
                      }
                      placeholder="Answer key"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="col-span-2">
                    <Select
                      value={q.question_type}
                      onValueChange={(v) =>
                        setQuestion(idx, { question_type: v })
                      }
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PHILIRI_QUESTION_TYPES.map((qt) => (
                          <SelectItem key={qt} value={qt}>
                            {qt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setQuestions((prev) => prev.filter((_, i) => i !== idx))
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
