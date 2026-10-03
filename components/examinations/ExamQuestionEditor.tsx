"use client";

/**
 * Editor for one exam question. Renders the fields appropriate to the question
 * type and returns the whole updated draft via `onChange`. The builder owns the
 * list and item numbering; this component is self-contained per question.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getExamQuestionType,
  optionLetter,
  type ExamQuestionType,
} from "@/lib/constants/examinations";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, Info, Plus, Trash2 } from "lucide-react";
import { ExamImageField } from "./ExamImageField";

export interface OptionDraft {
  key: string;
  id?: string;
  choice_text: string;
  is_correct: boolean;
  /** Optional figure for this choice (migration 159). "" = none. */
  image_path: string;
  image_name: string;
}

export interface SubitemDraft {
  key: string;
  id?: string;
  prompt_text: string;
  correct_answer: string;
}

export interface QuestionDraft {
  key: string;
  id?: string;
  tos_item_id: string | null;
  item_count: number;
  question_type: ExamQuestionType;
  question_text: string;
  answer_key: string;
  points: number;
  /** Optional figure shown with the question (migration 159). "" = none. */
  image_path: string;
  image_name: string;
  options: OptionDraft[];
  subitems: SubitemDraft[];
  /** Migration 195: set when this item is a copy of a Question Bank question. */
  source_bank_question_id: string | null;
  /** Migration 195: the author confirmed a cognitive-level mismatch. */
  bank_level_override: boolean;
}

let seq = 0;
const key = () => `q${Date.now()}_${seq++}`;

export const emptyOption = (): OptionDraft => ({
  key: key(),
  choice_text: "",
  is_correct: false,
  image_path: "",
  image_name: "",
});

export const emptySubitem = (): SubitemDraft => ({
  key: key(),
  prompt_text: "",
  correct_answer: "",
});

/** item_count for a question = number of scorable items it covers. */
export function questionItemCount(q: QuestionDraft): number {
  if (q.question_type === "matching" || q.question_type === "completion") {
    return Math.max(1, q.subitems.length);
  }
  return 1;
}

/** Seed the child rows a newly-selected type needs. */
export function seedForType(q: QuestionDraft, type: ExamQuestionType): QuestionDraft {
  const next: QuestionDraft = { ...q, question_type: type };
  if (type === "multiple_choice") {
    next.options =
      q.options.length > 0
        ? q.options
        : [emptyOption(), emptyOption(), emptyOption(), emptyOption()];
    next.subitems = [];
  } else if (type === "matching") {
    next.options =
      q.options.length > 0
        ? q.options
        : [emptyOption(), emptyOption(), emptyOption(), emptyOption()];
    next.subitems =
      q.subitems.length > 0
        ? q.subitems
        : [emptySubitem(), emptySubitem(), emptySubitem(), emptySubitem()];
  } else if (type === "completion") {
    next.options = [];
    next.subitems = q.subitems.length > 0 ? q.subitems : [emptySubitem(), emptySubitem()];
  } else {
    next.options = [];
    next.subitems = [];
  }
  next.item_count = questionItemCount(next);
  return next;
}

interface ExamQuestionEditorProps {
  question: QuestionDraft;
  displayStart: number;
  /** Upload scope for figures: `school_id`, or null for a division exam. */
  schoolId: number | null;
  disabled?: boolean;
  /** The Question Bank stores no points (an exam sets its own), so its editor hides the field. */
  hidePoints?: boolean;
  onChange: (q: QuestionDraft) => void;
  /** Omitted where a single question is edited on its own (Question Bank). */
  onRemove?: () => void;
}

export function ExamQuestionEditor({
  question,
  displayStart,
  schoolId,
  disabled,
  hidePoints,
  onChange,
  onRemove,
}: ExamQuestionEditorProps) {
  const info = getExamQuestionType(question.question_type);
  const set = (patch: Partial<QuestionDraft>) => {
    const next = { ...question, ...patch };
    next.item_count = questionItemCount(next);
    onChange(next);
  };
  const span = questionItemCount(question);
  const numberLabel =
    span > 1 ? `${displayStart}–${displayStart + span - 1}` : `${displayStart}`;

  // ---- option helpers (MC + matching Column B) ----
  const setOption = (i: number, patch: Partial<OptionDraft>) =>
    set({
      options: question.options.map((o, oi) =>
        oi === i ? { ...o, ...patch } : o,
      ),
    });
  const markCorrect = (i: number) =>
    set({
      options: question.options.map((o, oi) => ({
        ...o,
        is_correct: oi === i,
      })),
    });
  const addOption = () => set({ options: [...question.options, emptyOption()] });
  const removeOption = (i: number) =>
    set({ options: question.options.filter((_, oi) => oi !== i) });

  // ---- subitem helpers (matching premises / completion blanks) ----
  const setSubitem = (i: number, patch: Partial<SubitemDraft>) =>
    set({
      subitems: question.subitems.map((s, si) =>
        si === i ? { ...s, ...patch } : s,
      ),
    });
  const addSubitem = () => set({ subitems: [...question.subitems, emptySubitem()] });
  const removeSubitem = (i: number) =>
    set({ subitems: question.subitems.filter((_, si) => si !== i) });


  const isMc = question.question_type === "multiple_choice";
  const noCorrect = isMc && !question.options.some((o) => o.is_correct);
  const fid = (name: string) => `${question.key}-${name}`;

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3 sm:p-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 min-w-9 items-center justify-center rounded-md bg-emerald-600 px-2 text-xs font-semibold tabular-nums text-white">
            {span > 1 ? `Items ${numberLabel}` : `Item ${numberLabel}`}
          </span>
          {info && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {info.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!hidePoints && (
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor={fid("points")}
                className="text-xs font-normal text-muted-foreground"
              >
                Points
              </Label>
              <Input
                id={fid("points")}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                value={question.points}
                onChange={(e) => set({ points: Number(e.target.value || 0) })}
                className="h-8 w-16 text-center text-xs tabular-nums"
                disabled={disabled}
              />
            </div>
          )}
          {onRemove && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              disabled={disabled}
              aria-label={`Remove item ${numberLabel}`}
              title="Remove question"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Question / directions */}
      <div>
        <Label htmlFor={fid("text")} className="sr-only">
          {question.question_type === "matching" ? "Directions" : "Question"}
        </Label>
        <Textarea
          id={fid("text")}
          value={question.question_text}
          onChange={(e) => set({ question_text: e.target.value })}
          placeholder={
            question.question_type === "matching"
              ? "Directions (e.g. Match Column A with Column B)"
              : "Type the question or statement…"
          }
          rows={2}
          disabled={disabled}
        />
      </div>

      {/* Figure for the question (migration 159). Adds to the text above, does
          not replace it: a picture item still needs its stem. */}
      <ExamImageField
        imagePath={question.image_path}
        imageName={question.image_name}
        schoolId={schoolId}
        disabled={disabled}
        onChange={(patch) => set(patch)}
      />

      {/* Type-specific body */}
      {isMc && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Choices — click a letter to mark the correct answer.
          </p>
          {question.options.map((o, i) => (
            <div
              key={o.key}
              className={cn(
                "flex items-center gap-2 rounded-md border p-1.5 transition-colors",
                o.is_correct
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-transparent",
              )}
            >
              <button
                type="button"
                onClick={() => markCorrect(i)}
                disabled={disabled}
                aria-pressed={o.is_correct}
                aria-label={`Choice ${optionLetter(i)}${o.is_correct ? " (correct answer)" : " — mark as correct"}`}
                title={o.is_correct ? "Correct answer" : "Mark as correct"}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  o.is_correct
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "bg-background text-muted-foreground hover:border-emerald-500 hover:text-emerald-700",
                )}
              >
                {o.is_correct ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  optionLetter(i)
                )}
              </button>
              <Input
                value={o.choice_text}
                onChange={(e) => setOption(i, { choice_text: e.target.value })}
                placeholder={`Choice ${optionLetter(i)}`}
                aria-label={`Choice ${optionLetter(i)} text`}
                disabled={disabled}
                className="bg-background"
              />
              <ExamImageField
                imagePath={o.image_path}
                imageName={o.image_name}
                schoolId={schoolId}
                size="option"
                disabled={disabled}
                onChange={(patch) => setOption(i, patch)}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeOption(i)}
                disabled={disabled || question.options.length <= 2}
                aria-label={`Remove choice ${optionLetter(i)}`}
                title="Remove choice"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={addOption}
              disabled={disabled}
            >
              <Plus className="h-3.5 w-3.5" /> Add choice
            </Button>
            {noCorrect && !disabled && (
              <span className="flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                No correct answer marked yet
              </span>
            )}
          </div>
        </div>
      )}

      {(question.question_type === "true_false" ||
        question.question_type === "modified_true_false") && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-xs font-medium">Correct answer</p>
            <div
              role="radiogroup"
              aria-label="Correct answer"
              className="inline-flex rounded-md border bg-muted/40 p-0.5"
            >
              {(["True", "False"] as const).map((v) => {
                const current = question.answer_key.startsWith("False")
                  ? "False"
                  : question.answer_key === "True"
                    ? "True"
                    : "";
                const selected = current === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() =>
                      set({ answer_key: v === "True" ? "True" : "False: " })
                    }
                    className={cn(
                      "min-h-8 min-w-16 rounded px-3 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                      selected
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
          {question.question_type === "modified_true_false" &&
            question.answer_key.startsWith("False") && (
              <div className="min-w-[200px] flex-1">
                <Label htmlFor={fid("fix")} className="mb-1 block text-xs">
                  Correct word / phrase (the fix)
                </Label>
                <Input
                  id={fid("fix")}
                  value={question.answer_key.replace(/^False:\s?/, "")}
                  onChange={(e) =>
                    set({ answer_key: `False: ${e.target.value}` })
                  }
                  placeholder="The correct term"
                  disabled={disabled}
                />
              </div>
            )}
        </div>
      )}

      {question.question_type === "matching" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-md bg-muted/30 p-2.5">
            <div className="flex items-baseline justify-between px-0.5 text-xs font-semibold">
              <span>Column A (premises)</span>
              <span className="font-normal text-muted-foreground">Answer</span>
            </div>
            {question.subitems.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-5 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <Input
                  value={s.prompt_text}
                  onChange={(e) => setSubitem(i, { prompt_text: e.target.value })}
                  placeholder={`Premise ${i + 1}`}
                  aria-label={`Premise ${i + 1}`}
                  disabled={disabled}
                  className="bg-background"
                />
                <Select
                  value={s.correct_answer}
                  onValueChange={(v) => setSubitem(i, { correct_answer: v })}
                  disabled={disabled}
                >
                  <SelectTrigger
                    className="h-8 w-16 shrink-0 bg-background text-xs"
                    aria-label={`Answer for premise ${i + 1}`}
                  >
                    <SelectValue placeholder="?" />
                  </SelectTrigger>
                  <SelectContent>
                    {question.options.map((_, oi) => (
                      <SelectItem key={oi} value={optionLetter(oi)}>
                        {optionLetter(oi)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSubitem(i)}
                  disabled={disabled || question.subitems.length <= 1}
                  aria-label={`Remove premise ${i + 1}`}
                  title="Remove premise"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={addSubitem}
              disabled={disabled}
            >
              <Plus className="h-3.5 w-3.5" /> Add premise
            </Button>
          </div>
          <div className="space-y-2 rounded-md bg-muted/30 p-2.5">
            <p className="px-0.5 text-xs font-semibold">Column B (responses)</p>
            {question.options.map((o, i) => (
              <div key={o.key} className="flex items-center gap-2">
                <span className="w-5 text-center text-sm font-semibold text-muted-foreground">
                  {optionLetter(i)}
                </span>
                <Input
                  value={o.choice_text}
                  onChange={(e) => setOption(i, { choice_text: e.target.value })}
                  placeholder={`Response ${optionLetter(i)}`}
                  aria-label={`Response ${optionLetter(i)}`}
                  disabled={disabled}
                  className="bg-background"
                />
                <ExamImageField
                  imagePath={o.image_path}
                  imageName={o.image_name}
                  schoolId={schoolId}
                  size="option"
                  disabled={disabled}
                  onChange={(patch) => setOption(i, patch)}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeOption(i)}
                  disabled={disabled || question.options.length <= 2}
                  aria-label={`Remove response ${optionLetter(i)}`}
                  title="Remove response"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={addOption}
              disabled={disabled}
            >
              <Plus className="h-3.5 w-3.5" /> Add response
            </Button>
          </div>
        </div>
      )}

      {question.question_type === "completion" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            One answer per blank; each blank is one item.
          </p>
          {question.subitems.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <Label
                htmlFor={fid(`blank-${s.key}`)}
                className="w-16 shrink-0 text-xs font-normal text-muted-foreground"
              >
                Blank {i + 1}
              </Label>
              <Input
                id={fid(`blank-${s.key}`)}
                value={s.correct_answer}
                onChange={(e) => setSubitem(i, { correct_answer: e.target.value })}
                placeholder="Correct answer for this blank"
                disabled={disabled}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeSubitem(i)}
                disabled={disabled || question.subitems.length <= 1}
                aria-label={`Remove blank ${i + 1}`}
                title="Remove blank"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={addSubitem}
            disabled={disabled}
          >
            <Plus className="h-3.5 w-3.5" /> Add blank
          </Button>
        </div>
      )}

      {question.question_type === "short_answer" && (
        <div>
          <Label htmlFor={fid("answer")} className="mb-1 block text-xs">
            Correct answer
          </Label>
          <Input
            id={fid("answer")}
            value={question.answer_key}
            onChange={(e) => set({ answer_key: e.target.value })}
            placeholder="Accepted answer"
            disabled={disabled}
          />
        </div>
      )}

      {question.question_type === "essay" && (
        <div>
          <Label htmlFor={fid("rubric")} className="mb-1 block text-xs">
            Rubric / expected answer{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id={fid("rubric")}
            value={question.answer_key}
            onChange={(e) => set({ answer_key: e.target.value })}
            placeholder="Scoring guide for whoever checks the essays"
            rows={2}
            disabled={disabled}
          />
        </div>
      )}

      {info && !info.autoScorable && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Not auto-scored — excluded from Item Analysis / MPS.
        </p>
      )}
    </div>
  );
}
