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

/** Format a 12-digit LRN as XXXX-XXXX-XXXX for display. */
export function formatLrn(lrn: string | null | undefined): string {
  if (!lrn) return "—";
  const digits = lrn.replace(/\D/g, "");
  if (digits.length !== 12) return lrn;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
}
