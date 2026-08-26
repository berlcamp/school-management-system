"use client";

/**
 * View + print an exam (paper, with an optional answer key). Loads questions,
 * options, subitems and the parent TOS header, then renders ExamPreview.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase/client";
import type { ExamQuestionType } from "@/lib/constants/examinations";
import type { Exam } from "@/types";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  ExamPreview,
  type ExamPreviewHeader,
  type ExamPreviewQuestion,
} from "./ExamPreview";
import { canReadExamPaper } from "@/lib/utils/examReleaseCode";
import { ExamUnlockPanel } from "./ExamUnlockPanel";
import { PrintPortal } from "./PrintPortal";

interface ExamViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: Exam | null;
}

export function ExamViewModal({ isOpen, onClose, exam }: ExamViewModalProps) {
  const [loading, setLoading] = useState(false);
  const [header, setHeader] = useState<ExamPreviewHeader | null>(null);
  const [questions, setQuestions] = useState<ExamPreviewQuestion[]>([]);
  const [directions, setDirections] = useState<
    Partial<Record<ExamQuestionType, string>>
  >({});
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  // null while unknown. A sealed exam (migration 161) returns no question rows
  // rather than an error, so asking first is what separates "not released yet"
  // from "an exam nobody has written questions for".
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!isOpen || !exam?.id) return;
    let active = true;
    (async () => {
      setLoading(true);

      // A check that could not be run is not a seal — see canReadExamPaper.
      const { allowed: mayRead, error: gateError } = await canReadExamPaper(
        exam.id,
      );
      if (!active) return;
      if (gateError) {
        toast.error(`Could not check the release status: ${gateError}`);
      }
      setAllowed(mayRead);
      if (!mayRead) {
        setLoading(false);
        return;
      }

      const { data: tos } = await supabase
        .from("sms_tos")
        .select(
          "subject_name, grade_level, exam_type, grading_period, school_year",
        )
        .eq("id", exam.tos_id)
        .single();

      const { data: qRows } = await supabase
        .from("sms_exam_questions")
        .select("*")
        .eq("exam_id", exam.id)
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
            .eq("exam_id", exam.id),
        ]);

      if (!active) return;

      setDirections(
        Object.fromEntries(
          (secRows || []).map((s) => [s.question_type, s.instructions ?? ""]),
        ),
      );

      setHeader({
        title: exam.title,
        version_label: exam.version_label,
        subject_name: tos?.subject_name ?? "",
        grade_level: tos?.grade_level ?? 0,
        exam_type: tos?.exam_type ?? "Examination",
        grading_period: tos?.grading_period ?? 1,
        school_year: tos?.school_year ?? "",
        instructions: exam.instructions,
      });

      setQuestions(
        (qRows || []).map((q) => ({
          item_number: q.item_number,
          item_count: Number(q.item_count) || 1,
          question_type: q.question_type as ExamQuestionType,
          question_text: q.question_text,
          answer_key: q.answer_key,
          image_path: q.image_path,
          options: (oRows || [])
            .filter((o) => String(o.question_id) === String(q.id))
            .sort((a, b) => a.position - b.position)
            .map((o) => ({
              choice_text: o.choice_text,
              is_correct: !!o.is_correct,
              image_path: o.image_path,
            })),
          subitems: (sRows || [])
            .filter((s) => String(s.question_id) === String(q.id))
            .sort((a, b) => a.position - b.position)
            .map((s) => ({
              prompt_text: s.prompt_text,
              correct_answer: s.correct_answer,
            })),
        })),
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [
    isOpen,
    exam?.id,
    exam?.tos_id,
    exam?.title,
    exam?.version_label,
    exam?.instructions,
    reloadToken,
  ]);

  if (!exam) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4">
            <span>Exam</span>
            <div
              className={`mr-6 flex items-center gap-2 ${allowed === false ? "hidden" : ""}`}
            >
              <Button
                type="button"
                size="sm"
                variant={showAnswerKey ? "green" : "outline"}
                onClick={() => setShowAnswerKey((v) => !v)}
              >
                {showAnswerKey ? "Hide" : "Show"} answer key
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => window.print()}
              >
                <Printer className="mr-1.5 h-4 w-4" /> Print
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {allowed === false ? (
          <ExamUnlockPanel
            examId={exam.id}
            examTitle={exam.title?.trim() || undefined}
            onUnlocked={() => {
              setAllowed(null);
              setReloadToken((n) => n + 1);
            }}
          />
        ) : loading || !header ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {/* On-screen preview */}
            <div className="bg-white p-2">
              <ExamPreview
                header={header}
                questions={questions}
                directions={directions}
                showAnswerKey={showAnswerKey}
              />
            </div>
            {/* Print copy (outside the transformed dialog) */}
            <PrintPortal id="exam-print-area">
              <ExamPreview
                header={header}
                questions={questions}
                directions={directions}
                showAnswerKey={showAnswerKey}
              />
            </PrintPortal>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
