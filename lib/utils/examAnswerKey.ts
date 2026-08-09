/**
 * Answer-key data access for the Examinations module.
 *
 * The key is stored flat (migration 132) — item number to correct letter — and
 * this module is the only place that reads or writes it, so the editor, the
 * sheet generator and the scanner cannot drift apart on what "the key" means.
 *
 * `deriveAnswerKeyFromQuestions` is the bridge back to the Exam Builder: an
 * exam typed into the builder already knows its own answers, and retyping them
 * would be both tedious and a chance to introduce a discrepancy. Deriving is a
 * one-way prefill, never a live read — once derived, the key is the teacher's
 * to correct, and editing a question afterwards does not silently rewrite a key
 * that answer sheets have already been printed against.
 */

import { optionLetter } from "@/lib/constants/examinations";
import type { AnswerKeyItem } from "@/lib/omr/score";
import { supabase } from "@/lib/supabase/client";

export const DEFAULT_CHOICE_COUNT = 4;
export const DEFAULT_POINTS = 1;

/** True/False items are bubbled as two choices in this fixed order. */
export const TRUE_FALSE_CHOICES = ["True", "False"] as const;

export interface SaveKeyResult {
  saved: number;
  removed: number;
}

/** The stored key for an exam, ordered by item number. */
export async function fetchAnswerKey(
  examId: string | number,
): Promise<AnswerKeyItem[]> {
  const { data, error } = await supabase
    .from("sms_exam_answer_keys")
    .select("item_number, correct_answer, choice_count, points")
    .eq("exam_id", Number(examId))
    .order("item_number");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    itemNumber: Number(row.item_number),
    correctAnswer: row.correct_answer ?? null,
    choiceCount: Number(row.choice_count) || DEFAULT_CHOICE_COUNT,
    points: Number(row.points) || DEFAULT_POINTS,
  }));
}

/**
 * Read the authored questions and flatten them into a key.
 *
 * Only bubble-answerable types produce a keyed item. Identification, completion
 * and essay questions still get a row — the learner is answering them on the
 * exam paper, and dropping the row would renumber everything below it — but
 * with a null answer, so they sit outside the machine-scored total instead of
 * being marked wrong for everybody.
 */
export async function deriveAnswerKeyFromQuestions(
  examId: string | number,
): Promise<AnswerKeyItem[]> {
  const { data, error } = await supabase
    .from("sms_exam_questions")
    // One literal, not a concatenation: PostgREST's typings parse the select
    // string at the type level and a built-up string degrades to `unknown`.
    .select(
      "id, item_number, item_count, question_type, answer_key, points, options:sms_exam_options(label, is_correct, position), subitems:sms_exam_subitems(correct_answer, position)",
    )
    .eq("exam_id", Number(examId))
    .order("item_number");

  if (error) throw new Error(error.message);

  const items: AnswerKeyItem[] = [];

  for (const question of data ?? []) {
    const span = Math.max(1, Number(question.item_count) || 1);
    const points = Number(question.points) || DEFAULT_POINTS;
    const options = [...((question.options ?? []) as OptionRow[])].sort(
      (a, b) => a.position - b.position,
    );
    const subitems = [...((question.subitems ?? []) as SubitemRow[])].sort(
      (a, b) => a.position - b.position,
    );

    for (let offset = 0; offset < span; offset += 1) {
      const itemNumber = Number(question.item_number) + offset;
      let correctAnswer: string | null = null;
      let choiceCount = DEFAULT_CHOICE_COUNT;

      if (question.question_type === "multiple_choice") {
        choiceCount = clampChoices(options.length);
        const index = options.findIndex((o) => o.is_correct);
        if (index >= 0) correctAnswer = options[index].label || optionLetter(index);
      } else if (question.question_type === "true_false") {
        choiceCount = 2;
        const answer = (question.answer_key ?? "").trim().toLowerCase();
        if (answer === "true") correctAnswer = "A";
        else if (answer === "false") correctAnswer = "B";
      } else if (question.question_type === "matching") {
        // One bubbled item per Column-A premise; the key is its Column-B letter.
        choiceCount = clampChoices(options.length);
        correctAnswer = subitems[offset]?.correct_answer?.trim() || null;
      }
      // short_answer / completion / modified_true_false / essay: written on the
      // exam paper, not bubbled — keep the row, leave it unkeyed.

      items.push({
        itemNumber,
        correctAnswer: correctAnswer ? correctAnswer.toUpperCase() : null,
        choiceCount,
        points,
      });
    }
  }

  items.sort((a, b) => a.itemNumber - b.itemNumber);
  return items;
}

/**
 * Replace an exam's key with `items`.
 *
 * Rows are upserted rather than wiped and re-inserted so the key keeps its
 * identity across edits, and item numbers no longer present are removed — the
 * common case being a teacher who shortened the exam.
 */
export async function persistAnswerKey(
  examId: string | number,
  items: AnswerKeyItem[],
): Promise<SaveKeyResult> {
  const exam = Number(examId);

  if (items.length > 0) {
    const { error } = await supabase.from("sms_exam_answer_keys").upsert(
      items.map((item) => ({
        exam_id: exam,
        item_number: item.itemNumber,
        correct_answer: item.correctAnswer,
        choice_count: item.choiceCount,
        points: item.points,
      })),
      { onConflict: "exam_id,item_number" },
    );
    if (error) throw new Error(error.message);
  }

  const keptNumbers = items.map((i) => i.itemNumber);
  let removeQuery = supabase
    .from("sms_exam_answer_keys")
    .delete({ count: "exact" })
    .eq("exam_id", exam);
  if (keptNumbers.length > 0) {
    removeQuery = removeQuery.not(
      "item_number",
      "in",
      `(${keptNumbers.join(",")})`,
    );
  }
  const { error: removeError, count } = await removeQuery;
  if (removeError) throw new Error(removeError.message);

  return { saved: items.length, removed: count ?? 0 };
}

/** A blank key of `count` items, all unkeyed. */
export function blankAnswerKey(
  count: number,
  choiceCount = DEFAULT_CHOICE_COUNT,
  points = DEFAULT_POINTS,
): AnswerKeyItem[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({
    itemNumber: i + 1,
    correctAnswer: null,
    choiceCount,
    points,
  }));
}

/**
 * Grow or shrink a key to `count` items, keeping the answers already typed.
 * Shrinking discards the tail rather than renumbering, because item 12 means
 * item 12 on the printed paper.
 */
export function resizeAnswerKey(
  key: AnswerKeyItem[],
  count: number,
  choiceCount = DEFAULT_CHOICE_COUNT,
  points = DEFAULT_POINTS,
): AnswerKeyItem[] {
  const next: AnswerKeyItem[] = [];
  for (let i = 0; i < Math.max(0, count); i += 1) {
    next.push(
      key[i] ?? {
        itemNumber: i + 1,
        correctAnswer: null,
        choiceCount,
        points,
      },
    );
  }
  return next;
}

/**
 * Parse a typed-out key into letters.
 *
 * Accepts the shapes a teacher actually has to hand: a run of letters
 * ("ABCDA"), a spaced or comma-separated list, or a numbered list pasted from
 * a document ("1. A" / "1) A" per line). Anything that is not a letter A–E is
 * treated as a gap and leaves that item unkeyed.
 */
export function parseKeyText(text: string): (string | null)[] {
  const numbered = /^\s*\d+\s*[.)\-:]\s*([A-Ea-e])\s*$/;
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");

  if (lines.length > 1 && lines.every((line) => numbered.test(line))) {
    return lines.map((line) => (line.match(numbered) as RegExpMatchArray)[1].toUpperCase());
  }

  return text
    .replace(/[^A-Za-z\s,]/g, " ")
    .split(/[\s,]+/)
    .join("")
    .split("")
    .map((ch) => {
      const upper = ch.toUpperCase();
      return upper >= "A" && upper <= "E" ? upper : null;
    });
}

interface OptionRow {
  label: string | null;
  is_correct: boolean;
  position: number;
}

interface SubitemRow {
  correct_answer: string | null;
  position: number;
}

function clampChoices(count: number): number {
  if (!count || count < 2) return DEFAULT_CHOICE_COUNT;
  return Math.min(5, count);
}
