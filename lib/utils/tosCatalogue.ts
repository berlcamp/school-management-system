/**
 * TOS builder rules for the competency catalogue (migration 195). The
 * database's tos_guard_catalogue / tos_competency_guard_catalogue decide;
 * this only explains, before Save, what they would refuse.
 */
interface Row {
  /** Set on a row already saved to sms_tos_competencies. */
  id?: string;
  catalogue_competency_id: string | null;
  competency_text: string;
}

export function unmappedCount(rows: Row[]): number {
  return rows.filter((r) => r.competency_text.trim() && !r.catalogue_competency_id).length;
}

/**
 * Why Save must stay disabled, or null when it may go ahead.
 *
 * `archived`: the TOS is being saved archived (is_active false). 195's
 * guards never re-check an archived TOS (spec R3), so neither does this —
 * except for a saved row left blank, which would otherwise be silently
 * deleted along with its days and items.
 */
export function catalogueSaveError(input: {
  learningAreaId: string;
  rows: Row[];
  archived?: boolean;
}): string | null {
  const blank = input.rows.filter(
    (r) => r.id && !r.catalogue_competency_id && !r.competency_text.trim(),
  ).length;
  if (blank > 0)
    return `Pick a competency for ${blank} cleared row${blank === 1 ? "" : "s"}, or remove ${blank === 1 ? "it" : "them"}.`;
  if (input.archived) return null;
  if (!input.learningAreaId) return "Choose a learning area from the competency catalogue.";
  const live = input.rows.filter((r) => r.competency_text.trim() || r.catalogue_competency_id);
  const n = unmappedCount(live);
  if (n > 0) return `Map ${n} competenc${n === 1 ? "y" : "ies"} to the catalogue before saving.`;
  const ids = live.map((r) => String(r.catalogue_competency_id));
  if (new Set(ids).size !== ids.length) return "The same competency is listed twice.";
  return null;
}
