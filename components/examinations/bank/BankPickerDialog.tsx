"use client";

/**
 * Picks an approved Question Bank question for one item of a Division exam
 * (migration 195, spec §7 "Exam builder", R8).
 *
 * Only questions for the TOS item's catalogue competency are listed, and only
 * of the part's question type — the builder saves every question with its
 * part's type, so a True/False bank question in a Multiple Choice part would
 * be refused by exam_guard_bank_link. Matching cognitive level first; the rest
 * under "Different cognitive level", each needing an explicit confirmation,
 * which is what sets bank_level_override.
 */

import type { QuestionDraft } from "@/components/examinations/ExamQuestionEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCognitiveLevelLabel,
  getExamQuestionTypeLabel,
  optionLetter,
} from "@/lib/constants/examinations";
import {
  BANK_LEVEL_MISMATCH_CONFIRM,
  type BankQuestionType,
} from "@/lib/constants/questionBank";
import { supabase } from "@/lib/supabase/client";
import {
  bankQuestionToDraft,
  partitionBankCandidates,
  type SlotInfo,
} from "@/lib/utils/questionBank";
import type { BankOption, BankQuestionWithOptions } from "@/types";
import { format } from "date-fns";
import { useEffect, useState } from "react";

interface Row extends BankQuestionWithOptions {
  author: { name: string | null; school: { name: string | null } | null } | null;
}

/** The bank question's own competency and level, which the draft does not carry. */
export type BankMeta = { catalogue_competency_id: string; cognitive_level: string };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  slot: SlotInfo;
  itemNumber: number;
  /** The part's question type; only bank questions of this type are offered. */
  questionType: BankQuestionType;
  /** Already used elsewhere in this exam — shown, but not offered again. */
  usedIds?: ReadonlySet<string>;
  onPick: (draft: QuestionDraft, meta: BankMeta) => void;
}

/** Approved bank questions for one exam item's competency. */
export function BankPickerDialog({
  isOpen,
  onClose,
  slot,
  itemNumber,
  questionType,
  usedIds,
  onPick,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!isOpen || !slot.catalogue_competency_id) return;
    (async () => {
      setLoading(true);
      setLoadError(null);
      setConfirmId(null);
      const { data, error } = await supabase
        .from("sms_exam_bank_questions")
        .select(
          "*, options:sms_exam_bank_options(*), author:created_by(name, school:school_id(name))",
        )
        .eq("catalogue_competency_id", Number(slot.catalogue_competency_id))
        .eq("question_type", questionType)
        .eq("review_status", "approved")
        .order("reviewed_at", { ascending: false });
      if (!isMounted) return;
      if (error) {
        console.error(error);
        setLoadError(error.message);
      }
      setRows(
        ((data ?? []) as Row[]).map((r) => ({
          ...r,
          id: String(r.id),
          catalogue_competency_id: String(r.catalogue_competency_id),
          options: [...((r.options ?? []) as BankOption[])].sort(
            (a, b) => a.position - b.position,
          ),
        })),
      );
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [isOpen, slot.catalogue_competency_id, questionType]);

  const { matching, otherLevel } = partitionBankCandidates(rows, slot);
  const meta = (r: Row): BankMeta => ({
    catalogue_competency_id: String(r.catalogue_competency_id),
    cognitive_level: r.cognitive_level,
  });

  const card = (r: Row, mismatch: boolean) => {
    const used = usedIds?.has(String(r.id)) ?? false;
    return (
      <div key={r.id} className="space-y-2 rounded border p-3">
        <p className="whitespace-pre-wrap text-sm">
          {r.question_text ?? "(figure only)"}
        </p>
        {r.options.length > 0 && (
          <ol className="space-y-0.5 pl-1 text-sm">
            {r.options.map((o, i) => (
              <li
                key={o.id}
                className={o.is_correct ? "font-medium text-green-700" : ""}
              >
                {optionLetter(i)}. {o.choice_text ?? "(figure)"}
              </li>
            ))}
          </ol>
        )}
        {r.question_type === "true_false" && (
          <p className="text-sm">Answer: {r.answer_key}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {getCognitiveLevelLabel(r.cognitive_level)} · {r.author?.name ?? "—"}
          {r.author?.school?.name ? `, ${r.author.school.name}` : ""}
          {r.reviewed_at
            ? ` · approved ${format(new Date(r.reviewed_at), "MMM d, yyyy")}`
            : ""}
        </p>
        {used ? (
          <p className="text-xs text-muted-foreground">
            Already used in this exam.
          </p>
        ) : mismatch && confirmId === String(r.id) ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              onChange={(e) => {
                if (e.target.checked)
                  onPick(bankQuestionToDraft(r, true), meta(r));
              }}
            />
            {BANK_LEVEL_MISMATCH_CONFIRM}
          </label>
        ) : (
          <Button
            type="button"
            size="sm"
            variant={mismatch ? "outline" : "green"}
            onClick={() =>
              mismatch
                ? setConfirmId(String(r.id))
                : onPick(bankQuestionToDraft(r, false), meta(r))
            }
          >
            Use for item {itemNumber}
          </Button>
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Question Bank — item {itemNumber}</DialogTitle>
          <DialogDescription>
            {slot.lc_code && <span className="font-mono">{slot.lc_code}</span>}
            {slot.lc_code ? " — " : ""}
            {slot.competency_text} · {getCognitiveLevelLabel(slot.cognitive_level)} ·{" "}
            {getExamQuestionTypeLabel(questionType)}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : loadError ? (
          <p className="text-sm text-red-700">
            Could not load the Question Bank: {loadError}
          </p>
        ) : matching.length + otherLevel.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No approved {getExamQuestionTypeLabel(questionType)} questions for
            this competency yet. Write a new question instead.
          </p>
        ) : (
          <div className="space-y-4">
            {matching.length > 0 && (
              <section className="space-y-2">
                <p className="text-sm font-semibold">Same cognitive level</p>
                {matching.map((r) => card(r, false))}
              </section>
            )}
            {otherLevel.length > 0 && (
              <section className="space-y-2">
                <p className="text-sm font-semibold">Different cognitive level</p>
                {otherLevel.map((r) => card(r, true))}
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
