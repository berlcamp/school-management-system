/**
 * Loads the competency (MELC) mapping for an exam so Item Analysis can report
 * mean percentage score per competency. Each auto-scorable exam item is mapped
 * to its TOS competency via sms_tos_items; competencies with no auto-scorable
 * item are dropped. Returns rows in TOS competency order.
 */

import { supabase } from "@/lib/supabase/client";
import type { CompetencyInput } from "@/lib/utils/itemAnalysis";

export async function loadExamCompetencyInputs(
  examId: string | number,
  autoScorableItems: Set<number>,
): Promise<CompetencyInput[]> {
  // Resolve the exam's TOS.
  const { data: exam } = await supabase
    .from("sms_exams")
    .select("tos_id")
    .eq("id", examId)
    .maybeSingle();
  const tosId = exam?.tos_id;
  if (!tosId) return [];

  const [{ data: compRows }, { data: placement }] = await Promise.all([
    supabase
      .from("sms_tos_competencies")
      .select("id, competency_text, lc_code, position")
      .eq("tos_id", tosId)
      .order("position"),
    supabase
      .from("sms_tos_items")
      .select("item_number, competency_id")
      .eq("tos_id", tosId),
  ]);

  const itemsByCompetency = new Map<string, number[]>();
  (placement ?? []).forEach((row) => {
    if (!autoScorableItems.has(row.item_number)) return;
    const key = String(row.competency_id);
    const list = itemsByCompetency.get(key) ?? [];
    list.push(row.item_number);
    itemsByCompetency.set(key, list);
  });

  const inputs: CompetencyInput[] = [];
  (compRows ?? []).forEach((c) => {
    const itemNumbers = itemsByCompetency.get(String(c.id));
    if (!itemNumbers || itemNumbers.length === 0) return;
    inputs.push({
      competencyId: String(c.id),
      competencyText: c.competency_text as string,
      lcCode: (c.lc_code as string | null) ?? null,
      itemNumbers: itemNumbers.sort((a, b) => a - b),
    });
  });
  return inputs;
}
