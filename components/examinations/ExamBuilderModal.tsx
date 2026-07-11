"use client";

/**
 * Shared Exam builder (create / edit), used by the Division and Teacher
 * examination pages. Diverges only by `mode`:
 *   - division: saved with school_id = NULL (shared to all teachers)
 *   - teacher:  saved with school_id = <schoolId> (private to created_by)
 *
 * On create, pick a TOS + version label; one blank question is generated per
 * TOS item, pre-tagged with its competency + cognitive level. On save: upsert
 * sms_exams, sync sms_exam_questions (preserve ids), rebuild each question's
 * options + subitems.
 */

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
  EXAM_DEFAULT_DIRECTIONS,
  EXAM_QUESTION_TYPES,
  getExamQuestionTypeLabel,
  optionLetter,
  toRoman,
  type ExamQuestionType,
} from "@/lib/constants/examinations";
import { useAppDispatch } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { generateTosTitle } from "@/lib/utils/tos";
import type { CognitiveLevel } from "@/lib/constants/examinations";
import type { Exam } from "@/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  ExamQuestionEditor,
  questionItemCount,
  seedForType,
  type QuestionDraft,
} from "./ExamQuestionEditor";

interface TosOption {
  id: string;
  label: string;
}

interface ExamBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: Exam | null;
  mode: "division" | "teacher";
  schoolId: number | null;
  userId: string | number | null;
}

let seq = 0;
const newKey = () => `q${Date.now()}_${seq++}`;

const blankQuestion = (
  tosItemId: string | null,
  competency_text?: string,
  cognitive_level?: CognitiveLevel,
): QuestionDraft =>
  seedForType(
    {
      key: newKey(),
      tos_item_id: tosItemId,
      item_count: 1,
      question_type: "multiple_choice",
      question_text: "",
      answer_key: "",
      points: 1,
      competency_text,
      cognitive_level,
      options: [],
      subitems: [],
    },
    "multiple_choice",
  );

export function ExamBuilderModal({
  isOpen,
  onClose,
  editData,
  mode,
  schoolId,
  userId,
}: ExamBuilderModalProps) {
  const dispatch = useAppDispatch();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  const [tosOptions, setTosOptions] = useState<TosOption[]>([]);
  const [tosId, setTosId] = useState("");
  const [versionLabel, setVersionLabel] = useState("Set A");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [originalQuestionIds, setOriginalQuestionIds] = useState<string[]>([]);
  const [totalTosItems, setTotalTosItems] = useState<number | null>(null);
  const [sectionInstructions, setSectionInstructions] = useState<
    Partial<Record<ExamQuestionType, string>>
  >({});

  // Load selectable TOS (create mode) with the same visibility as the lists.
  useEffect(() => {
    if (!isOpen || editData?.id) return;
    let active = true;
    (async () => {
      let query = supabase
        .from("sms_tos")
        .select(
          "id, title, subject_name, grade_level, exam_type, grading_period, school_year",
        )
        .eq("is_active", true);
      query =
        mode === "division"
          ? query.is("school_id", null)
          : query.or(`school_id.is.null,created_by.eq.${userId}`);
      const { data } = await query.order("created_at", { ascending: false });
      if (!active) return;
      setTosOptions(
        (data || []).map((t) => ({
          id: String(t.id),
          label: `${t.title?.trim() || generateTosTitle(t)} · ${t.school_year}`,
        })),
      );
    })();
    return () => {
      active = false;
    };
  }, [isOpen, editData, mode, userId]);

  // Reset / hydrate on open.
  useEffect(() => {
    if (!isOpen) return;

    if (editData?.id) {
      setTosId(String(editData.tos_id));
      setVersionLabel(editData.version_label || "Set A");
      setTitle(editData.title || "");
      setInstructions(editData.instructions || "");
      setIsActive(editData.is_active ?? true);
      void loadExamChildren(String(editData.id), String(editData.tos_id));
    } else {
      setTosId("");
      setVersionLabel("Set A");
      setTitle("");
      setInstructions("");
      setIsActive(true);
      setQuestions([]);
      setOriginalQuestionIds([]);
      setTotalTosItems(null);
      setSectionInstructions({});
    }
  }, [isOpen, editData]);

  async function loadTosScaffold(selectedTosId: string) {
    const [{ data: items }, { data: comps }] = await Promise.all([
      supabase
        .from("sms_tos_items")
        .select("id, item_number, cognitive_level, competency_id")
        .eq("tos_id", selectedTosId)
        .order("item_number"),
      supabase
        .from("sms_tos_competencies")
        .select("id, competency_text")
        .eq("tos_id", selectedTosId),
    ]);
    const compMap = new Map(
      (comps || []).map((c) => [String(c.id), c.competency_text as string]),
    );
    setTotalTosItems((items || []).length);
    return (items || []).map((it) =>
      blankQuestion(
        String(it.id),
        compMap.get(String(it.competency_id)),
        it.cognitive_level as CognitiveLevel,
      ),
    );
  }

  async function loadExamChildren(examId: string, examTosId: string) {
    setLoading(true);
    const { data: qRows } = await supabase
      .from("sms_exam_questions")
      .select("*")
      .eq("exam_id", examId)
      .order("position");
    const questionIds = (qRows || []).map((q) => q.id);

    const [{ data: oRows }, { data: sRows }, { data: secRows }] =
      await Promise.all([
        supabase
          .from("sms_exam_options")
          .select("*")
          .in("question_id", questionIds),
        supabase
          .from("sms_exam_subitems")
          .select("*")
          .in("question_id", questionIds),
        supabase
          .from("sms_exam_sections")
          .select("question_type, instructions")
          .eq("exam_id", examId),
      ]);

    setSectionInstructions(
      Object.fromEntries(
        (secRows || []).map((s) => [s.question_type, s.instructions ?? ""]),
      ),
    );

    // TOS competency/cognitive tags for display.
    const [{ data: items }, { data: comps }] = await Promise.all([
      supabase
        .from("sms_tos_items")
        .select("id, cognitive_level, competency_id")
        .eq("tos_id", examTosId),
      supabase
        .from("sms_tos_competencies")
        .select("id, competency_text")
        .eq("tos_id", examTosId),
    ]);
    const compMap = new Map(
      (comps || []).map((c) => [String(c.id), c.competency_text as string]),
    );
    const itemMeta = new Map(
      (items || []).map((it) => [
        String(it.id),
        {
          cognitive_level: it.cognitive_level as CognitiveLevel,
          competency_text: compMap.get(String(it.competency_id)),
        },
      ]),
    );

    const drafts: QuestionDraft[] = (qRows || []).map((q) => {
      const meta = q.tos_item_id ? itemMeta.get(String(q.tos_item_id)) : undefined;
      return {
        key: newKey(),
        id: String(q.id),
        tos_item_id: q.tos_item_id ? String(q.tos_item_id) : null,
        item_count: Number(q.item_count) || 1,
        question_type: q.question_type,
        question_text: q.question_text || "",
        answer_key: q.answer_key || "",
        points: Number(q.points) || 1,
        competency_text: meta?.competency_text,
        cognitive_level: meta?.cognitive_level,
        options: (oRows || [])
          .filter((o) => String(o.question_id) === String(q.id))
          .sort((a, b) => a.position - b.position)
          .map((o) => ({
            key: newKey(),
            id: String(o.id),
            choice_text: o.choice_text || "",
            is_correct: !!o.is_correct,
          })),
        subitems: (sRows || [])
          .filter((s) => String(s.question_id) === String(q.id))
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            key: newKey(),
            id: String(s.id),
            prompt_text: s.prompt_text || "",
            correct_answer: s.correct_answer || "",
          })),
      };
    });
    setQuestions(drafts);
    setOriginalQuestionIds((qRows || []).map((q) => String(q.id)));
    setLoading(false);
  }

  const handleTosChange = async (id: string) => {
    setTosId(id);
    setLoading(true);
    const drafts = await loadTosScaffold(id);
    setQuestions(drafts);
    setLoading(false);
  };

  const updateQuestion = (index: number, q: QuestionDraft) =>
    setQuestions((prev) => prev.map((p, i) => (i === index ? q : p)));

  const removeQuestion = (index: number) =>
    setQuestions((prev) => prev.filter((_, i) => i !== index));

  const addQuestion = () =>
    setQuestions((prev) => [...prev, blankQuestion(null)]);

  const setSectionInstruction = (type: ExamQuestionType, value: string) =>
    setSectionInstructions((prev) => ({ ...prev, [type]: value }));

  const sectionDirections = (type: ExamQuestionType) =>
    sectionInstructions[type] ?? EXAM_DEFAULT_DIRECTIONS[type];

  // Group questions by type (fixed part order); number items across groups.
  const groupOrder = EXAM_QUESTION_TYPES.map((t) => t.value);
  const groupViews: {
    type: ExamQuestionType;
    entries: { q: QuestionDraft; index: number; start: number }[];
  }[] = [];
  let running = 1;
  for (const type of groupOrder) {
    const entries: { q: QuestionDraft; index: number; start: number }[] = [];
    questions.forEach((q, index) => {
      if (q.question_type !== type) return;
      entries.push({ q, index, start: running });
      running += questionItemCount(q);
    });
    if (entries.length > 0) groupViews.push({ type, entries });
  }
  const orderedQuestions = groupViews.flatMap((g) =>
    g.entries.map((e) => e.q),
  );
  const presentTypes = groupViews.map((g) => g.type);
  const placedItems = questions.reduce((s, q) => s + questionItemCount(q), 0);

  const onSubmit = async () => {
    if (isSubmitting) return;
    if (!tosId) return toast.error("Select a TOS first.");
    if (!versionLabel.trim()) return toast.error("Version label is required.");
    if (questions.length === 0) return toast.error("Add at least one question.");

    setIsSubmitting(true);
    try {
      const headerPayload = {
        tos_id: Number(tosId),
        version_label: versionLabel.trim(),
        title: title.trim() || null,
        instructions: instructions.trim() || null,
        school_id: mode === "division" ? null : schoolId,
        is_active: isActive,
      };

      let examId: string;
      if (editData?.id) {
        const { error } = await supabase
          .from("sms_exams")
          .update(headerPayload)
          .eq("id", editData.id);
        if (error) throw new Error(error.message);
        examId = String(editData.id);
      } else {
        const { data: inserted, error } = await supabase
          .from("sms_exams")
          .insert([{ ...headerPayload, created_by: userId ?? null }])
          .select()
          .single();
        if (error) throw new Error(error.message);
        examId = String(inserted.id);
      }

      // Sync questions in grouped (part) order (update kept / insert / delete).
      const keptIds: string[] = [];
      const finalQuestions: { id: string; draft: QuestionDraft }[] = [];
      let itemNo = 1;
      for (let i = 0; i < orderedQuestions.length; i++) {
        const q = orderedQuestions[i];
        const count = questionItemCount(q);
        const row = {
          tos_item_id: q.tos_item_id ? Number(q.tos_item_id) : null,
          item_number: itemNo,
          item_count: count,
          question_type: q.question_type,
          question_text: q.question_text.trim() || null,
          answer_key: q.answer_key.trim() || null,
          points: q.points,
          position: i,
        };
        itemNo += count;
        if (q.id) {
          keptIds.push(q.id);
          await supabase.from("sms_exam_questions").update(row).eq("id", q.id);
          finalQuestions.push({ id: q.id, draft: q });
        } else {
          const { data: ins, error } = await supabase
            .from("sms_exam_questions")
            .insert([{ ...row, exam_id: Number(examId) }])
            .select()
            .single();
          if (error) throw new Error(error.message);
          finalQuestions.push({ id: String(ins.id), draft: q });
        }
      }
      const removed = originalQuestionIds.filter((id) => !keptIds.includes(id));
      if (removed.length > 0) {
        await supabase.from("sms_exam_questions").delete().in("id", removed);
      }

      // Rebuild options + subitems for every question.
      for (const { id, draft } of finalQuestions) {
        await supabase.from("sms_exam_options").delete().eq("question_id", id);
        await supabase.from("sms_exam_subitems").delete().eq("question_id", id);

        if (draft.options.length > 0) {
          await supabase.from("sms_exam_options").insert(
            draft.options.map((o, oi) => ({
              question_id: Number(id),
              label: optionLetter(oi),
              choice_text: o.choice_text.trim() || null,
              is_correct: o.is_correct,
              position: oi,
            })),
          );
        }
        if (draft.subitems.length > 0) {
          await supabase.from("sms_exam_subitems").insert(
            draft.subitems.map((s, si) => ({
              question_id: Number(id),
              prompt_text: s.prompt_text.trim() || null,
              correct_answer: s.correct_answer.trim() || null,
              position: si,
            })),
          );
        }
      }

      // Rebuild the per-type section directions.
      await supabase.from("sms_exam_sections").delete().eq("exam_id", examId);
      if (presentTypes.length > 0) {
        await supabase.from("sms_exam_sections").insert(
          presentTypes.map((type, i) => ({
            exam_id: Number(examId),
            question_type: type,
            instructions: sectionDirections(type).trim() || null,
            position: i,
          })),
        );
      }

      const { data: fresh } = await supabase
        .from("sms_exams")
        .select("*")
        .eq("id", examId)
        .single();
      if (fresh) {
        dispatch(editData?.id ? updateList(fresh) : addItem(fresh));
      }

      toast.success(editData ? "Exam updated!" : "Exam created!");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error saving exam");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {editData ? "Edit" : "Create"} Exam
          </DialogTitle>
          <DialogDescription>
            {mode === "division"
              ? "Division-authored exams are visible to all subject teachers."
              : "Your exam is private to you. Division-authored exams are shared to everyone."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="mb-1.5 block">
                Table of Specification <span className="text-red-500">*</span>
              </Label>
              {editData?.id ? (
                <Input
                  value={
                    tosOptions.find((t) => t.id === tosId)?.label ||
                    "Based on its TOS"
                  }
                  disabled
                />
              ) : (
                <Select
                  value={tosId}
                  onValueChange={handleTosChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a TOS to build from" />
                  </SelectTrigger>
                  <SelectContent>
                    {tosOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label className="mb-1.5 block">
                Version <span className="text-red-500">*</span>
              </Label>
              <Input
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.target.value)}
                placeholder="e.g., Set A"
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

            <div className="col-span-2">
              <Label className="mb-1.5 block">Title (optional)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Leave blank to use the TOS title"
                disabled={isSubmitting}
              />
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block">Test directions (optional)</Label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="General instructions shown at the top of the exam…"
                rows={2}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Questions</p>
              <div className="flex items-center gap-3">
                {totalTosItems != null && (
                  <span className="text-xs text-muted-foreground">
                    {placedItems} item{placedItems === 1 ? "" : "s"} · TOS target{" "}
                    {totalTosItems}
                    {placedItems !== totalTosItems && (
                      <span className="ml-1 text-amber-600">
                        ({placedItems > totalTosItems ? "over" : "under"} by{" "}
                        {Math.abs(totalTosItems - placedItems)})
                      </span>
                    )}
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addQuestion}
                  disabled={isSubmitting || !tosId}
                >
                  Add question
                </Button>
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : questions.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                {tosId
                  ? "No questions."
                  : "Select a TOS above to scaffold one question per item."}
              </p>
            ) : (
              <div className="space-y-5">
                {groupViews.map((group, gi) => (
                  <div key={group.type} className="space-y-2">
                    <div className="rounded-md bg-muted/50 px-3 py-2">
                      <p className="text-sm font-semibold">
                        Part {toRoman(gi + 1)}.{" "}
                        {getExamQuestionTypeLabel(group.type)}
                      </p>
                      <Textarea
                        value={sectionDirections(group.type)}
                        onChange={(e) =>
                          setSectionInstruction(group.type, e.target.value)
                        }
                        placeholder="Directions for this part…"
                        rows={2}
                        disabled={isSubmitting}
                        className="mt-1.5 bg-background"
                      />
                    </div>
                    {group.entries.map(({ q, index, start }) => (
                      <ExamQuestionEditor
                        key={q.key}
                        question={q}
                        displayStart={start}
                        disabled={isSubmitting}
                        onChange={(nq) => updateQuestion(index, nq)}
                        onRemove={() => removeQuestion(index)}
                      />
                    ))}
                  </div>
                ))}
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
