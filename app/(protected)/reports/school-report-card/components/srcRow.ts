import { getGradeLevelLabel } from "@/lib/constants";
import type { SrcColumn } from "@/lib/constants/src";
import { formatPhp } from "@/lib/utils/src";

/**
 * The row shapes and value conversions shared by the SRC table and its edit
 * modal. They live outside both components so the display and the form cannot
 * disagree about what a cell holds.
 */

/** A row is an open bag of primitives; the column spec gives it meaning. */
export type SrcRowValue = string | number | null;
export type SrcRow = Record<string, SrcRowValue>;

/**
 * The editor boundary. Section payload rows are declared interfaces, which
 * have no index signature and so are not assignable to SrcRow either way.
 * These two functions are the single, named place where a typed row is
 * widened into an editable record and back; the column spec passed alongside
 * is what actually keeps the keys honest at runtime. Keep the conversion here
 * rather than casting at each call site.
 */
export function toSrcRows<T>(rows: T[]): SrcRow[] {
  return rows as unknown as SrcRow[];
}

export function fromSrcRows<T>(rows: SrcRow[]): T[] {
  return rows as unknown as T[];
}

export function blankSrcRow(columns: SrcColumn[]): SrcRow {
  const row: SrcRow = {};
  for (const col of columns) {
    row[col.key] = col.type === "text" || col.type === "select" ? "" : null;
  }
  return row;
}

/** Input text back to the column's stored type. "" clears rather than zeroes. */
export function parseSrcValue(col: SrcColumn, raw: string): SrcRowValue {
  if (col.type === "text" || col.type === "select") return raw;
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return col.type === "integer" || col.type === "grade_level"
    ? Math.trunc(n)
    : n;
}

/**
 * The stored value as the row should read on screen. Money and percentages are
 * dressed the way generateSchoolReportCard prints them, so the table is a
 * preview of the document rather than a second opinion about it.
 */
export function formatSrcValue(col: SrcColumn, value: SrcRowValue): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (col.type) {
    case "select":
      return (
        col.options?.find((o) => o.value === String(value))?.label ??
        String(value)
      );
    case "grade_level":
      return getGradeLevelLabel(Number(value));
    case "money":
      return formatPhp(Number(value));
    case "percent":
      return `${Number(value).toFixed(2)}%`;
    case "decimal":
      return Number(value).toFixed(2);
    case "integer":
      return String(Math.trunc(Number(value)));
    default:
      return String(value);
  }
}
