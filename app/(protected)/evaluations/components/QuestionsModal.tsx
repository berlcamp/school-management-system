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
import { supabase } from "@/lib/supabase/client";
import { Evaluation, EvaluationQuestion } from "@/types";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface Props {
  isOpen: boolean;
  evaluation: Evaluation;
  onClose: () => void;
}

interface QuestionRow {
  id?: string;
  question_text: string;
  order_number: number;
  isNew?: boolean;
}

export const QuestionsModal = ({ isOpen, evaluation, onClose }: Props) => {
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [originalIds, setOriginalIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchQuestions = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("sms_evaluation_questions")
        .select("*")
        .eq("evaluation_id", evaluation.id)
        .order("order_number", { ascending: true });

      if (error) {
        console.error(error);
        toast.error("Failed to load questions");
      } else {
        const rows: QuestionRow[] = (data || []).map(
          (q: EvaluationQuestion) => ({
            id: q.id,
            question_text: q.question_text,
            order_number: q.order_number,
          }),
        );
        setQuestions(rows);
        setOriginalIds(new Set((data || []).map((q: EvaluationQuestion) => q.id)));
      }
      setLoading(false);
    };

    fetchQuestions();
  }, [isOpen, evaluation.id]);

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        question_text: "",
        order_number: prev.length + 1,
        isNew: true,
      },
    ]);
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((q, i) => ({ ...q, order_number: i + 1 }));
    });
  };

  const updateQuestionText = (index: number, text: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, question_text: text } : q)),
    );
  };

  const moveQuestion = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= questions.length) return;

    setQuestions((prev) => {
      const updated = [...prev];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      return updated.map((q, i) => ({ ...q, order_number: i + 1 }));
    });
  };

  const handleSave = async () => {
    const nonEmpty = questions.filter((q) => q.question_text.trim());
    if (nonEmpty.length === 0) {
      toast.error("Add at least one question");
      return;
    }

    setSaving(true);
    try {
      // Delete removed questions
      const currentIds = new Set(
        nonEmpty.filter((q) => q.id).map((q) => q.id!),
      );
      const deletedIds = [...originalIds].filter((id) => !currentIds.has(id));

      if (deletedIds.length > 0) {
        const { error } = await supabase
          .from("sms_evaluation_questions")
          .delete()
          .in("id", deletedIds);
        if (error) throw error;
      }

      // Upsert existing + new questions
      for (const q of nonEmpty) {
        if (q.id) {
          const { error } = await supabase
            .from("sms_evaluation_questions")
            .update({
              question_text: q.question_text.trim(),
              order_number: q.order_number,
            })
            .eq("id", q.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("sms_evaluation_questions")
            .insert({
              evaluation_id: evaluation.id,
              question_text: q.question_text.trim(),
              order_number: q.order_number,
            });
          if (error) throw error;
        }
      }

      toast.success("Questions saved successfully!");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save questions");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[650px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Manage Questions
          </DialogTitle>
          <DialogDescription>{evaluation.title}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {questions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No questions yet. Click &quot;Add Question&quot; to get started.
              </p>
            )}
            {questions.map((q, index) => (
              <div
                key={q.id || `new-${index}`}
                className="flex items-start gap-2 group"
              >
                <span className="flex-shrink-0 mt-2.5 text-sm font-medium text-muted-foreground w-6 text-right">
                  {index + 1}.
                </span>
                <Input
                  value={q.question_text}
                  onChange={(e) => updateQuestionText(index, e.target.value)}
                  placeholder="Enter question..."
                  className="flex-1 h-10"
                  disabled={saving}
                />
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveQuestion(index, "up")}
                    disabled={index === 0 || saving}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveQuestion(index, "down")}
                    disabled={index === questions.length - 1 || saving}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => removeQuestion(index)}
                    disabled={saving}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addQuestion}
              disabled={saving}
              className="w-full mt-2 border-dashed"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Question
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2 space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="h-10"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="h-10 min-w-[100px]"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving...
              </span>
            ) : (
              "Save Questions"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
