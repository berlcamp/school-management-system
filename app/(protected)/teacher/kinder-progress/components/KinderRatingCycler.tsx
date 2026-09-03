"use client";

import { KINDER_RATING_LABELS } from "@/lib/constants/kinderProgress";
import type { KinderProgressRating } from "@/types";

/**
 * A single rating cell.
 *
 * Cycles blank → BG → DV → CO → blank on click rather than opening a dropdown:
 * an adviser fills 60 competencies for every learner in the section, and a
 * three-value scale is faster to tap through than to select. The cell shows the
 * letter the printed card will carry, so screen and paper read alike.
 */

const CYCLE: (KinderProgressRating | "")[] = ["", "BG", "DV", "CO"];

const STYLES: Record<KinderProgressRating | "", string> = {
  "": "bg-background text-muted-foreground border-input hover:bg-muted",
  BG: "bg-red-50 text-red-700 border-red-300 hover:bg-red-100",
  DV: "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100",
  CO: "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100",
};

interface KinderRatingCyclerProps {
  value: KinderProgressRating | "";
  onChange: (value: KinderProgressRating | "") => void;
  disabled?: boolean;
}

export function KinderRatingCycler({
  value,
  onChange,
  disabled,
}: KinderRatingCyclerProps) {
  const next = () => {
    const idx = CYCLE.indexOf(value);
    onChange(CYCLE[(idx + 1) % CYCLE.length]);
  };

  return (
    <button
      type="button"
      onClick={next}
      disabled={disabled}
      title={
        value
          ? `${value} — ${KINDER_RATING_LABELS[value]} (click to change)`
          : "Not yet rated (click to set)"
      }
      aria-label={value ? KINDER_RATING_LABELS[value] : "Not yet rated"}
      className={`h-7 w-11 rounded-md border text-xs font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${STYLES[value]}`}
    >
      {value || "—"}
    </button>
  );
}
