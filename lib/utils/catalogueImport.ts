/**
 * Competency catalogue import (migration 195). Columns, in any order:
 * Learning Area | Grade | LC Code | Competency. Nothing is ever deleted:
 * rows upsert by (learning area, grade, LC code).
 */
import { supabase } from "@/lib/supabase/client";
import { normalizeLcCode } from "@/lib/utils/questionBank";

export interface CatalogueImportEntry {
  learningArea: string;
  gradeLevel: number;
  lcCode: string;
  competencyText: string;
}

export interface CatalogueImportResult {
  entries: CatalogueImportEntry[];
  errors: { row: number; message: string }[];
}

const HEADERS = ["learning area", "grade", "lc code", "competency"] as const;

export function parseGrade(v: unknown): number | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "k" || s.startsWith("kinder")) return 0;
  const m = s.match(/^(?:grade\s*)?(\d{1,2})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 12 ? n : null;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export function parseCatalogueRows(rows: unknown[][]): CatalogueImportResult {
  const entries: CatalogueImportEntry[] = [];
  const errors: { row: number; message: string }[] = [];
  const header = (rows[0] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
  const idx = HEADERS.map((h) => header.indexOf(h));
  if (idx.some((i) => i < 0)) {
    errors.push({
      row: 1,
      message: "The first row must be the headers: Learning Area | Grade | LC Code | Competency.",
    });
    return { entries, errors };
  }

  const seen = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const rowNo = i + 1;
    const r = rows[i] ?? [];
    const [area, gradeRaw, lcRaw, text] = idx.map((j) => squash(String(r[j] ?? "")));
    if (!area && !gradeRaw && !lcRaw && !text) continue;
    const grade = parseGrade(gradeRaw);
    const lcCode = normalizeLcCode(lcRaw);
    let message: string | null = null;
    if (!area) message = "Learning Area is blank.";
    else if (grade === null) message = `Grade "${gradeRaw}" is not K or 1–12.`;
    else if (!lcCode) message = "LC Code is blank.";
    else if (!text) message = "Competency is blank.";
    if (message) {
      errors.push({ row: rowNo, message });
      continue;
    }
    const key = `${area.toLowerCase()}|${grade}|${lcCode}`;
    const prev = seen.get(key);
    if (prev !== undefined) {
      errors.push({ row: rowNo, message: `Duplicate of row ${prev} (same learning area, grade and LC code).` });
      continue;
    }
    seen.set(key, rowNo);
    entries.push({ learningArea: area, gradeLevel: grade as number, lcCode, competencyText: text });
  }
  return { entries, errors };
}

/**
 * Learning-area names the entries need that do not exist yet, de-duplicated
 * case-insensitively (the first spelling wins) to match the DB's unique index
 * on lower(btrim(name)). `known` holds lower-cased existing names.
 */
export function newLearningAreaNames(
  entries: CatalogueImportEntry[],
  known: ReadonlySet<string>,
): string[] {
  const out = new Map<string, string>();
  for (const e of entries) {
    const k = e.learningArea.trim().toLowerCase();
    if (!known.has(k) && !out.has(k)) out.set(k, e.learningArea.trim());
  }
  return [...out.values()];
}

/** Create missing learning areas, then upsert every entry. */
export async function importCatalogue(
  entries: CatalogueImportEntry[],
): Promise<{ inserted: number; updated: number; error: string | null }> {
  const { data: areaRows, error: areaErr } = await supabase.from("sms_learning_areas").select("id, name");
  if (areaErr) return { inserted: 0, updated: 0, error: areaErr.message };
  const areaIds = new Map<string, number>(
    (areaRows ?? []).map((a) => [String(a.name).trim().toLowerCase(), Number(a.id)]),
  );
  const missing = newLearningAreaNames(entries, new Set(areaIds.keys()));
  if (missing.length > 0) {
    const { data, error } = await supabase
      .from("sms_learning_areas")
      .insert(missing.map((name) => ({ name })))
      .select("id, name");
    if (error) return { inserted: 0, updated: 0, error: error.message };
    (data ?? []).forEach((a) => areaIds.set(String(a.name).trim().toLowerCase(), Number(a.id)));
  }

  const ids = [...new Set(entries.map((e) => areaIds.get(e.learningArea.trim().toLowerCase()) as number))];
  const { data: existing, error: exErr } = await supabase
    .from("sms_competency_catalogue")
    .select("learning_area_id, grade_level, lc_code")
    .in("learning_area_id", ids);
  if (exErr) return { inserted: 0, updated: 0, error: exErr.message };
  const known = new Set(
    (existing ?? []).map((c) => `${c.learning_area_id}|${c.grade_level}|${c.lc_code}`),
  );

  const payload = entries.map((e) => ({
    learning_area_id: areaIds.get(e.learningArea.trim().toLowerCase()) as number,
    grade_level: e.gradeLevel,
    lc_code: e.lcCode,
    competency_text: e.competencyText,
  }));
  const updated = payload.filter((p) => known.has(`${p.learning_area_id}|${p.grade_level}|${p.lc_code}`)).length;

  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase
      .from("sms_competency_catalogue")
      .upsert(payload.slice(i, i + 500), { onConflict: "learning_area_id,grade_level,lc_code" });
    if (error) return { inserted: 0, updated: 0, error: error.message };
  }
  return { inserted: payload.length - updated, updated, error: null };
}
