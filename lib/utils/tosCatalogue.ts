/**
 * TOS builder rules for the competency catalogue (migration 195). The
 * database's tos_guard_catalogue / tos_competency_guard_catalogue decide;
 * this only explains, before Save, what they would refuse.
 */
interface Row {
  catalogue_competency_id: string | null;
  competency_text: string;
}

export function unmappedCount(rows: Row[]): number {
  return rows.filter((r) => r.competency_text.trim() && !r.catalogue_competency_id).length;
}

export function catalogueSaveError(input: { learningAreaId: string; rows: Row[] }): string | null {
  if (!input.learningAreaId) return "Choose a learning area from the competency catalogue.";
  const live = input.rows.filter((r) => r.competency_text.trim() || r.catalogue_competency_id);
  const n = unmappedCount(live);
  if (n > 0) return `Map ${n} competenc${n === 1 ? "y" : "ies"} to the catalogue before saving.`;
  const ids = live.map((r) => String(r.catalogue_competency_id));
  if (new Set(ids).size !== ids.length) return "The same competency is listed twice.";
  return null;
}
