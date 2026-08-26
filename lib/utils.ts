import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Escape special characters in a string for safe use in PostgREST ilike patterns.
 * % and _ are wildcards in SQL LIKE; \ escapes them.
 */
export function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Reduce a typed/pasted LRN to the bare digits it is stored as. LRNs are shown
 * grouped (see formatLrn) and copied around with dashes, spaces or an "LRN:"
 * label, so every LRN search must strip the noise before it hits the column.
 * Returns "" when the input carries no digits at all.
 */
export function normalizeLrn(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Format a 12-digit LRN as 000000-000-000 for display — the grouping DepEd
 * writes, matching what <LrnBoxInput> and formatLrnInput() present on entry.
 * Anything that is not exactly 12 digits is returned untouched rather than
 * mis-grouped. Display only: the DepEd form generators in lib/pdf print the
 * raw digits and never call this.
 */
export function formatLrn(lrn: string | null | undefined): string {
  if (!lrn) return "—";
  const digits = lrn.replace(/\D/g, "");
  if (digits.length !== 12) return lrn;
  return `${digits.slice(0, 6)}-${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Group a partially-typed LRN as DepEd writes it — 000000-000-000 — for the
 * free-text LRN fields that cannot use <LrnBoxInput> (the students filter takes
 * a partial LRN; the tracking lookup's card is too narrow for twelve boxes).
 * Extra digits past twelve are dropped, and the grouping only appears once the
 * typist has passed a separator, so a half-typed LRN never grows a stray dash.
 * Always pair with normalizeLrn() before the value reaches a query.
 */
export function formatLrnInput(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 12);
  if (d.length <= 6) return d;
  if (d.length <= 9) return `${d.slice(0, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 6)}-${d.slice(6, 9)}-${d.slice(9)}`;
}
