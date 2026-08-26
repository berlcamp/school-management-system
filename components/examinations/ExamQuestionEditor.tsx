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
import { Check, Plus, Trash2 } from "lucide-react";
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
  onChange: (q: QuestionDraft) => void;
  onRemove: () => void;
}

export function ExamQuestionEditor({
  question,
  displayStart,
  schoolId,
  disabled,
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

  return (
    <div className="rounded-md border p-3 space-y-3">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="inline-flex min-w-8 items-center justify-center rounded bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
          {numberLabel}
        </span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              step="0.5"
              value={question.points}
              onChange={(e) => set({ points: Number(e.target.value || 0) })}
              className="h-8 w-16 text-center text-xs"
              title="Points"
              disabled={disabled}
            />
            <span className="text-xs text-muted-foreground">pt(s)</span>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            disabled={disabled}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Question / directions */}
      <Textarea
        value={question.question_text}
        onChange={(e) => set({ question_text: e.target.value })}
        placeholder={
          question.question_type === "matching"
            ? "Directions (e.g. Match Column A with Column B)"
            : "Question / statement"
        }
        rows={2}
        disabled={disabled}
      />

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
      {question.question_type === "multiple_choice" && (
        <div className="space-y-2">
          {question.options.map((o, i) => (
            <div key={o.key} className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant={o.is_correct ? "green" : "outline"}
                className="h-8 w-8 shrink-0"
                onClick={() => markCorrect(i)}
                disabled={disabled}
                title="Mark correct"
              >
                <Check className="h-4 w-4" />
              </Button>
              <span className="w-5 text-center text-sm font-semibold text-muted-foreground">
                {optionLetter(i)}
              </span>
              <Input
                value={o.choice_text}
                onChange={(e) => setOption(i, { choice_text: e.target.value })}
                placeholder={`Choice ${optionLetter(i)}`}
                disabled={disabled}
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
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => removeOption(i)}
                disabled={disabled || question.options.length <= 2}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addOption}
            disabled={disabled}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add choice
          </Button>
        </div>
      )}

      {(question.question_type === "true_false" ||
        question.question_type === "modified_true_false") && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-40">
            <Label className="mb-1 block text-xs">Correct answer</Label>
            <Select
              value={
                question.answer_key.startsWith("False")
                  ? "False"
                  : question.answer_key === "True"
                    ? "True"
                    : ""
              }
              onValueChange={(v) =>
                set({ answer_key: v === "True" ? "True" : "False: " })
              }
              disabled={disabled}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="True">True</SelectItem>
                <SelectItem value="False">False</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {question.question_type === "modified_true_false" &&
            question.answer_key.startsWith("False") && (
              <div className="flex-1 min-w-[200px]">
                <Label className="mb-1 block text-xs">
                  Correct word / phrase (the fix)
                </Label>
                <Input
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold">Column A (premises)</p>
            {question.subitems.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-5 text-center text-xs font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <Input
                  value={s.prompt_text}
                  onChange={(e) => setSubitem(i, { prompt_text: e.target.value })}
                  placeholder={`Premise ${i + 1}`}
                  disabled={disabled}
                />
                <Select
                  value={s.correct_answer}
                  onValueChange={(v) => setSubitem(i, { correct_answer: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8 w-16 shrink-0 text-xs">
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
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSubitem(i)}
                  disabled={disabled || question.subitems.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addSubitem}
              disabled={disabled}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add premise
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold">Column B (responses)</p>
            {question.options.map((o, i) => (
              <div key={o.key} className="flex items-center gap-2">
                <span className="w-5 text-center text-sm font-semibold text-muted-foreground">
                  {optionLetter(i)}
                </span>
                <Input
                  value={o.choice_text}
                  onChange={(e) => setOption(i, { choice_text: e.target.value })}
                  placeholder={`Response ${optionLetter(i)}`}
                  disabled={disabled}
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
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeOption(i)}
                  disabled={disabled || question.options.length <= 2}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addOption}
              disabled={disabled}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add response
            </Button>
          </div>
        </div>
      )}

      {question.question_type === "completion" && (
        <div className="space-y-2">
          {question.subitems.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">
                Blank {i + 1}
              </span>
              <Input
                value={s.correct_answer}
                onChange={(e) => setSubitem(i, { correct_answer: e.target.value })}
                placeholder="Correct answer for this blank"
                disabled={disabled}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => removeSubitem(i)}
                disabled={disabled || question.subitems.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addSubitem}
            disabled={disabled}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add blank
          </Button>
        </div>
      )}

      {question.question_type === "short_answer" && (
        <div>
          <Label className="mb-1 block text-xs">Correct answer</Label>
          <Input
            value={question.answer_key}
            onChange={(e) => set({ answer_key: e.target.value })}
            placeholder="Accepted answer"
            disabled={disabled}
          />
        </div>
      )}

      {question.question_type === "essay" && (
        <div>
          <Label className="mb-1 block text-xs">
            Rubric / expected answer (optional)
          </Label>
          <Textarea
            value={question.answer_key}
            onChange={(e) => set({ answer_key: e.target.value })}
            placeholder="Scoring guide — essays are not auto-scored in Item Analysis."
            rows={2}
            disabled={disabled}
          />
        </div>
      )}

      {info && !info.autoScorable && (
        <p className="text-[11px] italic text-amber-600">
          Not auto-scored — excluded from Item Analysis / MPS.
        </p>
      )}
    </div>
  );
}
