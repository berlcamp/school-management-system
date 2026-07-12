"use client";

/**
 * Shared Exam builder (create / edit), used by the Division and Teacher
 * examination pages. Diverges only by `mode`:
 *   - division: saved with school_id = NULL (shared to all teachers)
 *   - teacher:  saved with school_id = <schoolId> (private to created_by)
 *
 * The exam is authored as an ordered list of PARTS. Each part is one question
 * type (e.g. "Part I. Multiple Choice") with its own directions and its own
 * questions. A type may be used by at most one part (the printed exam and the
 * sms_exam_sections table are keyed per question_type). Item numbering runs
 * continuously across parts.
 *
 * On save: upsert sms_exams; flatten parts → sms_exam_questions (preserve ids);
 * rebuild each question's options + subitems; rebuild sms_exam_sections from the
 * parts that carry questions.
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
import type { Exam } from "@/types";
import { Plus, Trash2 } from "lucide-react";
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

/** One authored part: a question type + directions + its questions. */
interface PartDraft {
  key: string;
  question_type: ExamQuestionType;
  instructions: string;
  questions: QuestionDraft[];
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

const blankQuestion = (type: ExamQuestionType): QuestionDraft =>
  seedForType(
    {
      key: newKey(),
      tos_item_id: null,
      item_count: 1,
      question_type: type,
      question_text: "",
      answer_key: "",
      points: 1,
      options: [],
      subitems: [],
    },
    type,
  );

const blankPart = (type: ExamQuestionType): PartDraft => ({
  key: newKey(),
  question_type: type,
  instructions: EXAM_DEFAULT_DIRECTIONS[type],
  questions: [],
});

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
  const [parts, setParts] = useState<PartDraft[]>([]);
  const [originalQuestionIds, setOriginalQuestionIds] = useState<string[]>([]);
  const [totalTosItems, setTotalTosItems] = useState<number | null>(null);

  // Load selectable TOS with the same visibility as the lists. In edit mode the
  // exam's current TOS is merged in even if it is inactive / out of filter, so
  // it stays selectable.
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const tosSelect =
      "id, title, subject_name, grade_level, exam_type, grading_period, school_year";
    (async () => {
      let query = supabase
        .from("sms_tos")
        .select(tosSelect)
        .eq("is_active", true);
      query =
        mode === "division"
          ? query.is("school_id", null)
          : query.or(`school_id.is.null,created_by.eq.${userId}`);
      const { data } = await query.order("created_at", { ascending: false });
      if (!active) return;
      let opts: TosOption[] = (data || []).map((t) => ({
        id: String(t.id),
        label: `${t.title?.trim() || generateTosTitle(t)} · ${t.school_year}`,
      }));
      if (
        editData?.tos_id &&
        !opts.some((o) => o.id === String(editData.tos_id))
      ) {
        const { data: cur } = await supabase
          .from("sms_tos")
          .select(tosSelect)
          .eq("id", editData.tos_id)
          .single();
        if (cur) {
          opts = [
            {
              id: String(cur.id),
              label: `${cur.title?.trim() || generateTosTitle(cur)} · ${cur.school_year}`,
            },
            ...opts,
          ];
        }
      }
      if (!active) return;
      setTosOptions(opts);
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
      setParts([]);
      setOriginalQuestionIds([]);
      setTotalTosItems(null);
    }
  }, [isOpen, editData]);

  async function fetchTosItemCount(selectedTosId: string) {
    const { count } = await supabase
      .from("sms_tos_items")
      .select("id", { count: "exact", head: true })
      .eq("tos_id", selectedTosId);
    setTotalTosItems(count ?? 0);
  }

  async function loadExamChildren(examId: string, examTosId: string) {
    setLoading(true);
    void fetchTosItemCount(examTosId);

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
          .select("question_type, instructions, position")
          .eq("exam_id", examId),
      ]);

    const secInstr = new Map(
      (secRows || []).map((s) => [s.question_type, s.instructions ?? ""]),
    );
    const secPos = new Map(
      (secRows || []).map((s) => [s.question_type, s.position ?? 0]),
    );

    // Rebuild each question draft (already ordered by position).
    const drafts: QuestionDraft[] = (qRows || []).map((q) => ({
      key: newKey(),
      id: String(q.id),
      tos_item_id: q.tos_item_id ? String(q.tos_item_id) : null,
      item_count: Number(q.item_count) || 1,
      question_type: q.question_type as ExamQuestionType,
      question_text: q.question_text || "",
      answer_key: q.answer_key || "",
      points: Number(q.points) || 1,
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
    }));

    // Group into parts by type (questions keep their position order); order the
    // parts by their section position, falling back to first appearance.
    const byType = new Map<ExamQuestionType, QuestionDraft[]>();
    for (const d of drafts) {
      const bucket = byType.get(d.question_type);
      if (bucket) bucket.push(d);
      else byType.set(d.question_type, [d]);
    }
    const rebuilt: PartDraft[] = [...byType.entries()]
      .sort((a, b) => (secPos.get(a[0]) ?? 999) - (secPos.get(b[0]) ?? 999))
      .map(([type, questions]) => ({
        key: newKey(),
        question_type: type,
        instructions: secInstr.get(type) ?? EXAM_DEFAULT_DIRECTIONS[type],
        questions,
      }));

    setParts(rebuilt);
    setOriginalQuestionIds((qRows || []).map((q) => String(q.id)));
    setLoading(false);
  }

  const handleTosChange = (id: string) => {
    setTosId(id);
    void fetchTosItemCount(id);
  };

  // ---- part / question mutations ----
  const usedTypes = new Set(parts.map((p) => p.question_type));
  const availableTypes = EXAM_QUESTION_TYPES.filter(
    (t) => !usedTypes.has(t.value),
  );

  const addPart = (type: ExamQuestionType) =>
    setParts((prev) => [...prev, blankPart(type)]);

  const removePart = (pi: number) =>
    setParts((prev) => prev.filter((_, i) => i !== pi));

  const movePart = (pi: number, dir: -1 | 1) =>
    setParts((prev) => {
      const next = [...prev];
      const target = pi + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[pi], next[target]] = [next[target], next[pi]];
      return next;
    });

  const setPartInstructions = (pi: number, value: string) =>
    setParts((prev) =>
      prev.map((p, i) => (i === pi ? { ...p, instructions: value } : p)),
    );

  const addQuestion = (pi: number) =>
    setParts((prev) =>
      prev.map((p, i) =>
        i === pi
          ? { ...p, questions: [...p.questions, blankQuestion(p.question_type)] }
          : p,
      ),
    );

  const updateQuestion = (pi: number, qi: number, q: QuestionDraft) =>
    setParts((prev) =>
      prev.map((p, i) =>
        i === pi
          ? { ...p, questions: p.questions.map((x, j) => (j === qi ? q : x)) }
          : p,
      ),
    );

  const removeQuestion = (pi: number, qi: number) =>
    setParts((prev) =>
      prev.map((p, i) =>
        i === pi
          ? { ...p, questions: p.questions.filter((_, j) => j !== qi) }
          : p,
      ),
    );

  // Numbering across parts (in order) for the item labels.
  let running = 1;
  const partViews = parts.map((part, pi) => {
    const entries = part.questions.map((q, qi) => {
      const start = running;
      running += questionItemCount(q);
      return { q, qi, start };
    });
    return { part, pi, entries };
  });
  const placedItems = parts.reduce(
    (s, p) => s + p.questions.reduce((t, q) => t + questionItemCount(q), 0),
    0,
  );

  const onSubmit = async () => {
    if (isSubmitting) return;
    if (!tosId) return toast.error("Select a TOS first.");
    if (!versionLabel.trim()) return toast.error("Version label is required.");
    const nonEmptyParts = parts.filter((p) => p.questions.length > 0);
    if (nonEmptyParts.length === 0)
      return toast.error("Add at least one part with a question.");

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

      // Flatten parts (in order) into positioned questions with running numbers.
      const ordered: { draft: QuestionDraft; type: ExamQuestionType }[] = [];
      for (const p of nonEmptyParts) {
        for (const q of p.questions) {
          ordered.push({ draft: q, type: p.question_type });
        }
      }

      const keptIds: string[] = [];
      const finalQuestions: { id: string; draft: QuestionDraft }[] = [];
      let itemNo = 1;
      for (let i = 0; i < ordered.length; i++) {
        const { draft, type } = ordered[i];
        const count = questionItemCount(draft);
        const row = {
          tos_item_id: draft.tos_item_id ? Number(draft.tos_item_id) : null,
          item_number: itemNo,
          item_count: count,
          question_type: type,
          question_text: draft.question_text.trim() || null,
          answer_key: draft.answer_key.trim() || null,
          points: draft.points,
          position: i,
        };
        itemNo += count;
        if (draft.id) {
          keptIds.push(draft.id);
          await supabase
            .from("sms_exam_questions")
            .update(row)
            .eq("id", draft.id);
          finalQuestions.push({ id: draft.id, draft });
        } else {
          const { data: ins, error } = await supabase
            .from("sms_exam_questions")
            .insert([{ ...row, exam_id: Number(examId) }])
            .select()
            .single();
          if (error) throw new Error(error.message);
          finalQuestions.push({ id: String(ins.id), draft });
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

      // Rebuild the per-part (per-type) section directions.
      await supabase.from("sms_exam_sections").delete().eq("exam_id", examId);
      if (nonEmptyParts.length > 0) {
        await supabase.from("sms_exam_sections").insert(
          nonEmptyParts.map((p, i) => ({
            exam_id: Number(examId),
            question_type: p.question_type,
            instructions: p.instructions.trim() || null,
            position: i,
          })),
        );
      }

      const { data: fresh } = await supabase
        .from("sms_exams")
        .select(
          "*, tos:tos_id!inner(subject_name, grade_level, exam_type, grading_period, school_year, title)",
        )
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

          {/* Parts */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Parts</p>
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
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="space-y-5">
                {parts.length === 0 && (
                  <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {tosId
                      ? "No parts yet. Add a part (e.g. Multiple Choice) to begin."
                      : "Select a TOS above, then add parts to build the exam."}
                  </p>
                )}

                {partViews.map(({ part, pi, entries }) => (
                  <div key={part.key} className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-semibold">
                        Part {toRoman(pi + 1)}.{" "}
                        {getExamQuestionTypeLabel(part.question_type)}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => movePart(pi, -1)}
                          disabled={isSubmitting || pi === 0}
                          title="Move part up"
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => movePart(pi, 1)}
                          disabled={isSubmitting || pi === parts.length - 1}
                          title="Move part down"
                        >
                          ↓
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removePart(pi)}
                          disabled={isSubmitting}
                          title="Remove part"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <Textarea
                      value={part.instructions}
                      onChange={(e) => setPartInstructions(pi, e.target.value)}
                      placeholder="Directions for this part…"
                      rows={2}
                      disabled={isSubmitting}
                      className="bg-background"
                    />

                    {entries.length === 0 ? (
                      <p className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
                        No questions in this part yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {entries.map(({ q, qi, start }) => (
                          <ExamQuestionEditor
                            key={q.key}
                            question={q}
                            displayStart={start}
                            disabled={isSubmitting}
                            onChange={(nq) => updateQuestion(pi, qi, nq)}
                            onRemove={() => removeQuestion(pi, qi)}
                          />
                        ))}
                      </div>
                    )}

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addQuestion(pi)}
                      disabled={isSubmitting}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add question
                    </Button>
                  </div>
                ))}

                {/* Add part */}
                {availableTypes.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(v) => addPart(v as ExamQuestionType)}
                    disabled={isSubmitting || !tosId}
                  >
                    <SelectTrigger className="w-full sm:w-[260px]">
                      <SelectValue placeholder="+ Add part…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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
