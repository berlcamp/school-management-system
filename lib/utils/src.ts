import { SBM_BANDS } from "@/lib/constants/src";
import type { SrcSectionKey, SrcSectionPayloadMap } from "@/types";

/**
 * School Report Card helpers — banding, ratio formatting, empty payloads.
 */

export interface SbmBand {
  level: string;
  description: string;
}

/**
 * Bands an SBM rating (0.00–3.00) into its Level of Practice.
 * Returns null when unrated, so the UI can show a blank rather than Level I.
 */
export function getSbmBand(rating: number | null | undefined): SbmBand | null {
  if (rating === null || rating === undefined || Number.isNaN(rating)) return null;
  const band = SBM_BANDS.find((b) => rating >= b.min && rating <= b.max);
  return band ? { level: band.level, description: band.description } : null;
}

/**
 * Formats a learner-to-resource ratio as DepEd prints it ("1:23").
 * Rounds to the nearest whole learner per unit; returns null when there is
 * nothing to divide by, rather than a misleading "1:0".
 */
export function formatSrcRatio(
  learners: number | null | undefined,
  units: number | null | undefined,
): string | null {
  const l = Number(learners);
  const u = Number(units);
  if (!Number.isFinite(l) || !Number.isFinite(u) || u <= 0 || l < 0) return null;
  return `1:${Math.round(l / u)}`;
}

/** Percentage helper shared by the dropout and promotion sections. */
export function computeSrcRate(
  numerator: number,
  denominator: number,
): number | null {
  if (!denominator || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

const EMPTY_PAYLOADS: { [K in SrcSectionKey]: SrcSectionPayloadMap[K] } = {
  enrollment: { rows: [] },
  health: { rows: [] },
  materials: { rows: [] },
  professional_development: { rows: [] },
  funding: { partners: [], contributions: [] },
  awards: { rows: [] },
  dropouts: { rows: [], causes: [] },
  promotion: { rows: [] },
  academic_performance: { rows: [] },
  sbm: {},
  cfss: {},
  stakeholder_participation: { rows: [] },
  learner_teacher: { rows: [] },
  learner_classroom: { rows: [] },
  learner_toilet: { rows: [] },
  learner_seat: { rows: [] },
};

/** A fresh, correctly-shaped payload for a section with no data yet. */
export function emptySrcPayload<K extends SrcSectionKey>(
  key: K,
): SrcSectionPayloadMap[K] {
  return structuredClone(EMPTY_PAYLOADS[key]);
}

/** Peso formatting for the funding section and MOOE figure. */
export function formatPhp(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "";
  return `Php ${Number(amount).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
