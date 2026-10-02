/**
 * Question Bank helpers (migration 195). The database decides every rule;
 * these mirror it so the screens only offer what will pass.
 */
import { optionLetter, type CognitiveLevel } from "@/lib/constants/examinations";
import { LLC_COUNT, isBankSupportedType } from "@/lib/constants/questionBank";
import type { QuestionDraft } from "@/components/examinations/ExamQuestionEditor";
import { supabase } from "@/lib/supabase/client";
import type { BankQuestionWithOptions } from "@/types";

/** Mirrors 195's catalogue_normalize(): trim, upper-case, no spaces. */
export function normalizeLcCode(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

/** Mirrors llc_competency_ids(): lowest `n` by MPS, ties at the cut kept. */
export function llcCut<T extends { mps: number }>(rows: T[], n: number = LLC_COUNT): T[] {
  const sorted = [...rows].sort((a, b) => a.mps - b.mps);
  if (sorted.length <= n) return sorted;
  const cutoff = sorted[n - 1].mps;
  return sorted.filter((r) => r.mps <= cutoff);
}

/** What a TOS item asks for, keyed by item number in the exam builder. */
export interface SlotInfo {
  catalogue_competency_id: string | null;
  cognitive_level: CognitiveLevel;
  lc_code: string | null;
  competency_text: string;
}

export type BankSlotStatus = "ok" | "level_mismatch" | "wrong_competency" | "no_slot";

/** Mirrors exam_guard_bank_link() for one item. */
export function bankSlotStatus(
  bank: { catalogue_competency_id: string; cognitive_level: string },
  slot: SlotInfo | undefined,
): BankSlotStatus {
  if (!slot || slot.catalogue_competency_id == null) return "no_slot";
  if (String(slot.catalogue_competency_id) !== String(bank.catalogue_competency_id))
    return "wrong_competency";
  return slot.cognitive_level === bank.cognitive_level ? "ok" : "level_mismatch";
}

export function partitionBankCandidates<
  T extends { catalogue_competency_id: string; cognitive_level: string },
>(cands: T[], slot: SlotInfo): { matching: T[]; otherLevel: T[] } {
  const matching: T[] = [];
  const otherLevel: T[] = [];
  for (const c of cands) {
    const s = bankSlotStatus(c, slot);
    if (s === "ok") matching.push(c);
    else if (s === "level_mismatch") otherLevel.push(c);
  }
  return { matching, otherLevel };
}

export function questionSourceLabel(row: {
  source_bank_question_id?: string | number | null;
}): "Question Bank" | "New" {
  return row.source_bank_question_id != null ? "Question Bank" : "New";
}

/** Mirrors exam_review_submit('question'): null when submittable. */
export function validateBankDraft(d: QuestionDraft): string | null {
  if (!isBankSupportedType(d.question_type))
    return "This question type is not accepted in the Question Bank yet.";
  if (!d.question_text.trim() && !d.image_path.trim())
    return "Write the question (or add a figure) before submitting.";
  if (d.question_type === "multiple_choice") {
    if (d.options.length < 2 || d.options.length > 5)
      return "A multiple-choice question needs 2 to 5 choices.";
    if (d.options.filter((o) => o.is_correct).length !== 1)
      return "Mark exactly one choice as correct.";
    if (d.options.some((o) => !o.choice_text.trim() && !o.image_path.trim()))
      return "Every choice needs text or a figure.";
    return null;
  }
  const tf = d.answer_key.trim().toLowerCase();
  if (!tf.startsWith("true") && !tf.startsWith("false"))
    return "Choose True or False as the answer.";
  return null;
}

/** Mirrors bank_expected_key(): the answer-sheet letter the item scores on. */
export function expectedBankKey(q: BankQuestionWithOptions): string | null {
  if (q.question_type === "true_false") {
    if (q.answer_key === "True") return "A";
    if (q.answer_key === "False") return "B";
    return null;
  }
  const sorted = [...q.options].sort((a, b) => a.position - b.position || Number(a.id) - Number(b.id));
  const i = sorted.findIndex((o) => o.is_correct);
  return i >= 0 ? optionLetter(i) : null;
}

let seq = 0;

/** The exam-builder draft for a bank question: a verbatim, locked copy. */
export function bankQuestionToDraft(
  q: BankQuestionWithOptions,
  levelOverride: boolean,
): QuestionDraft {
  const key = () => `bank_${q.id}_${Date.now()}_${seq++}`;
  return {
    key: key(),
    tos_item_id: null,
    item_count: 1,
    question_type: q.question_type,
    question_text: q.question_text ?? "",
    answer_key: q.answer_key ?? "",
    points: 1,
    image_path: q.image_path ?? "",
    image_name: q.image_name ?? "",
    options: [...q.options]
      .sort((a, b) => a.position - b.position)
      .map((o) => ({
        key: key(),
        choice_text: o.choice_text ?? "",
        is_correct: o.is_correct,
        image_path: o.image_path ?? "",
        image_name: o.image_name ?? "",
      })),
    subitems: [],
    source_bank_question_id: String(q.id),
    bank_level_override: levelOverride,
  };
}

export interface LlcRow {
  catalogue_competency_id: string;
  lc_code: string;
  competency_text: string;
  mps: number;
  learners: number;
  sections: number;
  schools: number;
  results: number;
}

export async function fetchLlc(
  areaId: string | number,
  gradeLevel: number,
  schoolYear: string,
): Promise<{ rows: LlcRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("division_llc", {
    p_learning_area_id: Number(areaId),
    p_grade_level: gradeLevel,
    p_school_year: schoolYear,
  });
  if (error) return { rows: [], error: error.message };
  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    catalogue_competency_id: String(r.catalogue_competency_id),
    lc_code: String(r.lc_code),
    competency_text: String(r.competency_text),
    mps: Number(r.mps),
    learners: Number(r.learners),
    sections: Number(r.sections),
    schools: Number(r.schools),
    results: Number(r.results),
  }));
  return { rows, error: null };
}

export async function fetchLlcCoverage(
  areaId: string | number,
  gradeLevel: number,
  schoolYear: string,
): Promise<{ results: number; schools: number; learners: number } | null> {
  const { data, error } = await supabase.rpc("division_llc_coverage", {
    p_learning_area_id: Number(areaId),
    p_grade_level: gradeLevel,
    p_school_year: schoolYear,
  });
  const row = ((data ?? []) as Record<string, unknown>[])[0];
  if (error || !row) return null;
  return { results: Number(row.results), schools: Number(row.schools), learners: Number(row.learners) };
}

export async function setBankQuestionLevel(
  id: string | number,
  level: CognitiveLevel,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("bank_question_set_level", { p_id: Number(id), p_level: level });
  return { error: error ? error.message : null };
}

export interface SaveBankQuestionInput {
  id?: string | null;
  catalogueCompetencyId: string;
  sourceLlcSchoolYear: string;
  cognitiveLevel: CognitiveLevel;
  createdBy: string | number;
  draft: QuestionDraft;
}

/** Insert or update a bank question, then replace its options. */
export async function saveBankQuestion(
  input: SaveBankQuestionInput,
): Promise<{ id: string | null; error: string | null }> {
  const d = input.draft;
  const body = {
    cognitive_level: input.cognitiveLevel,
    question_type: d.question_type,
    question_text: d.question_text.trim() || null,
    answer_key: d.answer_key.trim() || null,
    image_path: d.image_path.trim() || null,
    image_name: d.image_name.trim() || null,
  };
  let id = input.id ?? null;
  if (id) {
    const { error } = await supabase.from("sms_exam_bank_questions").update(body).eq("id", Number(id));
    if (error) return { id, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("sms_exam_bank_questions")
      .insert([{
        ...body,
        catalogue_competency_id: Number(input.catalogueCompetencyId),
        source_llc_school_year: input.sourceLlcSchoolYear,
        created_by: Number(input.createdBy),
      }])
      .select("id")
      .single();
    if (error) return { id: null, error: error.message };
    id = String(data.id);
  }
  const del = await supabase.from("sms_exam_bank_options").delete().eq("question_id", Number(id));
  if (del.error) return { id, error: del.error.message };
  if (d.question_type === "multiple_choice" && d.options.length > 0) {
    const { error } = await supabase.from("sms_exam_bank_options").insert(
      d.options.map((o, i) => ({
        question_id: Number(id),
        label: optionLetter(i),
        choice_text: o.choice_text.trim() || null,
        is_correct: o.is_correct,
        image_path: o.image_path.trim() || null,
        image_name: o.image_name.trim() || null,
        position: i,
      })),
    );
    if (error) return { id, error: error.message };
  }
  return { id, error: null };
}
