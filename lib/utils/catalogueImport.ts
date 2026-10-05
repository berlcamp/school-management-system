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
  if (s === "sned" || s === "-1") return -1;
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
    else if (grade === null) message = `Grade "${gradeRaw}" is not SNED, K or 1–12.`;
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
/**
 * A starter sheet for "Download template": the four headers in the documented
 * order and two example rows the importer accepts as-is, so the downloaded
 * file round-trips through parseCatalogueRows with nothing skipped.
 */
export function catalogueTemplateRows(): string[][] {
  return [
    ["Learning Area", "Grade", "LC Code", "Competency"],
    ["Mathematics", "1", "M1NS-Ia-1.1", "Visualizes and represents numbers from 0 to 100 using a variety of materials."],
    ["English", "K", "LLKV-Ia-1", "Talks about oneself, family and familiar places."],
  ];
}

/** Why the Import button is unavailable, or null when it is (or is busy). */
export function importBlockedReason(
  parsed: CatalogueImportResult | null,
  busy: boolean,
): string | null {
  if (busy) return null;
  if (!parsed) return "Choose a file to import.";
  if (parsed.entries.length === 0) return "No row in this sheet can be imported — see the skipped rows.";
  return null;
}

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

interface ExistingCatalogueRow {
  learning_area_id: number;
  grade_level: number;
  lc_code: string;
  competency_text: string;
}

/** Every catalogue row of the given areas, read past PostgREST's 1000-row cap. */
async function fetchExistingCatalogue(
  areaIds: number[],
): Promise<{ rows: ExistingCatalogueRow[]; error: string | null }> {
  const rows: ExistingCatalogueRow[] = [];
  if (areaIds.length === 0) return { rows, error: null };
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("sms_competency_catalogue")
      .select("learning_area_id, grade_level, lc_code, competency_text")
      .in("learning_area_id", areaIds)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { rows: [], error: error.message };
    rows.push(...((data ?? []) as ExistingCatalogueRow[]));
    if (!data || data.length < PAGE) break;
  }
  return { rows, error: null };
}

export interface CatalogueImportPreview {
  newCount: number;
  /** Existing entries whose text the sheet would overwrite. */
  overwrites: { learningArea: string; gradeLevel: number; lcCode: string; oldText: string; newText: string }[];
  /** Existing entries the sheet repeats with identical text. */
  unchanged: number;
  error: string | null;
}

/** Read-only: what importing these entries would add and overwrite. */
export async function previewCatalogueImport(
  entries: CatalogueImportEntry[],
): Promise<CatalogueImportPreview> {
  const empty = { newCount: 0, overwrites: [], unchanged: 0 };
  const { data: areaRows, error: areaErr } = await supabase.from("sms_learning_areas").select("id, name");
  if (areaErr) return { ...empty, error: areaErr.message };
  const areaIds = new Map<string, number>(
    (areaRows ?? []).map((a) => [String(a.name).trim().toLowerCase(), Number(a.id)]),
  );
  const wanted = [
    ...new Set(
      entries.map((e) => areaIds.get(e.learningArea.trim().toLowerCase())).filter((x): x is number => x !== undefined),
    ),
  ];
  const { rows, error } = await fetchExistingCatalogue(wanted);
  if (error) return { ...empty, error };
  const known = new Map(rows.map((c) => [`${c.learning_area_id}|${c.grade_level}|${c.lc_code}`, c.competency_text]));
  let newCount = 0;
  let unchanged = 0;
  const overwrites: CatalogueImportPreview["overwrites"] = [];
  for (const e of entries) {
    const id = areaIds.get(e.learningArea.trim().toLowerCase());
    const old = id === undefined ? undefined : known.get(`${id}|${e.gradeLevel}|${e.lcCode}`);
    if (old === undefined) newCount++;
    else if (old === e.competencyText) unchanged++;
    else
      overwrites.push({
        learningArea: e.learningArea.trim(),
        gradeLevel: e.gradeLevel,
        lcCode: e.lcCode,
        oldText: old,
        newText: e.competencyText,
      });
  }
  return { newCount, overwrites, unchanged, error: null };
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
  const { rows: existing, error: exErr } = await fetchExistingCatalogue(ids);
  if (exErr) return { inserted: 0, updated: 0, error: exErr };
  const known = new Set(existing.map((c) => `${c.learning_area_id}|${c.grade_level}|${c.lc_code}`));

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
