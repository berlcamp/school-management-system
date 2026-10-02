/**
 * Suggestions for the TOS builder's "Map competencies" step (migration 195):
 * a free-typed competency from before the catalogue, matched to an entry.
 * A suggestion only — the teacher confirms or picks another.
 */
import { normalizeLcCode } from "@/lib/utils/questionBank";

export interface MatchCandidate {
  id: string;
  lc_code: string;
  competency_text: string;
}

export const MATCH_THRESHOLD = 0.5;

const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );

/** Jaccard similarity of the words longer than two letters. */
export function textSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach((t) => {
    if (tb.has(t)) shared += 1;
  });
  return shared / (ta.size + tb.size - shared);
}

export function suggestCatalogueMatch<T extends MatchCandidate>(
  row: { competency_text: string; lc_code: string | null },
  candidates: T[],
): T | null {
  const lc = normalizeLcCode(row.lc_code ?? "");
  if (lc) {
    const exact = candidates.find((c) => c.lc_code === lc);
    if (exact) return exact;
  }
  let best: T | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const s = textSimilarity(row.competency_text, c.competency_text);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best : null;
}
