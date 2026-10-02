"use client";

import {
  ExamQuestionEditor,
  seedForType,
  type QuestionDraft,
} from "@/components/examinations/ExamQuestionEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BLOOM_LEVELS,
  getExamQuestionTypeLabel,
  type CognitiveLevel,
} from "@/lib/constants/examinations";
import {
  BANK_SUPPORTED_TYPES,
  isBankSupportedType,
  type BankQuestionType,
} from "@/lib/constants/questionBank";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { saveBankQuestion, validateBankDraft } from "@/lib/utils/questionBank";
import type { BankOption, BankQuestion } from "@/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  competency: { id: string; lc_code: string; competency_text: string };
  /**
   * The school year of the Least Learned list the question is written from
   * (R7) — stored as `source_llc_school_year` on insert, never typed.
   */
  schoolYear: string;
  /** Editing an existing draft / returned question. */
  editId?: string | null;
}

const blank = (type: BankQuestionType): QuestionDraft =>
  seedForType(
    {
      key: `bq_${Date.now()}`,
      tos_item_id: null,
      item_count: 1,
      question_type: type,
      question_text: "",
      answer_key: "",
      points: 1,
      image_path: "",
      image_name: "",
      options: [],
      subitems: [],
      source_bank_question_id: null,
      bank_level_override: false,
    },
    type,
  );

/** Write or edit one Question Bank question for a least learned competency. */
export function BankQuestionModal({
  isOpen,
  onClose,
  onSaved,
  competency,
  schoolYear,
  editId,
}: Props) {
  const me = useAppSelector((s) => s.user.user?.system_user_id ?? null);
  const [level, setLevel] = useState<CognitiveLevel>(BLOOM_LEVELS[0].value);
  const [draft, setDraft] = useState<QuestionDraft>(() => blank("multiple_choice"));
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!isOpen) return;
    if (!editId) {
      setLevel(BLOOM_LEVELS[0].value);
      setDraft(blank("multiple_choice"));
      return;
    }
    (async () => {
      setLoadingEdit(true);
      const [qRes, oRes] = await Promise.all([
        supabase
          .from("sms_exam_bank_questions")
          .select("*")
          .eq("id", Number(editId))
          .maybeSingle(),
        supabase
          .from("sms_exam_bank_options")
          .select("*")
          .eq("question_id", Number(editId))
          .order("position"),
      ]);
      if (!isMounted) return;
      setLoadingEdit(false);
      const bq = qRes.data as BankQuestion | null;
      if (qRes.error || oRes.error || !bq || !isBankSupportedType(bq.question_type)) {
        toast.error(
          qRes.error?.message ??
            oRes.error?.message ??
            "This question could not be opened for editing.",
        );
        onClose();
        return;
      }
      setLevel(bq.cognitive_level as CognitiveLevel);
      setDraft({
        ...blank(bq.question_type),
        question_text: bq.question_text ?? "",
        answer_key: bq.answer_key ?? "",
        image_path: bq.image_path ?? "",
        image_name: bq.image_name ?? "",
        options: ((oRes.data ?? []) as BankOption[]).map((o) => ({
          key: `o_${o.id}`,
          choice_text: o.choice_text ?? "",
          is_correct: o.is_correct,
          image_path: o.image_path ?? "",
          image_name: o.image_name ?? "",
        })),
      });
    })();
    return () => {
      isMounted = false;
    };
    // onClose is a fresh closure each render; reloading on it would refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editId]);

  const onSave = async () => {
    if (busy || loadingEdit) return;
    if (me == null) {
      toast.error("Your account is still loading. Try again in a moment.");
      return;
    }
    const problem = validateBankDraft(draft);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    const res = await saveBankQuestion({
      id: editId ?? null,
      catalogueCompetencyId: competency.id,
      sourceLlcSchoolYear: schoolYear,
      cognitiveLevel: level,
      createdBy: me,
      draft,
    });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      editId
        ? "Question saved."
        : "Saved as a draft. Submit it to QA from the Question Bank.",
    );
    onSaved();
    onClose();
  };

  const disabled = busy || loadingEdit;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editId ? "Edit question" : "Write a Question Bank question"}
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{competency.lc_code}</span> —{" "}
            {competency.competency_text}
            <span className="mt-1 block text-xs">
              Least Learned list: S.Y. {schoolYear}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block">Question type</Label>
            <Select
              value={draft.question_type}
              disabled={!!editId || disabled}
              onValueChange={(v) => {
                if (isBankSupportedType(v)) setDraft(blank(v));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BANK_SUPPORTED_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {getExamQuestionTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block">Cognitive level</Label>
            <Select
              value={level}
              disabled={disabled}
              onValueChange={(v) => setLevel(v as CognitiveLevel)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLOOM_LEVELS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label} ({l.tier})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <ExamQuestionEditor
          question={draft}
          displayStart={1}
          schoolId={null}
          disabled={disabled}
          onChange={setDraft}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={disabled}>
            {busy ? "Saving…" : editId ? "Save" : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
