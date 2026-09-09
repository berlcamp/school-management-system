"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PACE_RATINGS,
  PACE_RATING_LABELS,
  PACE_RATING_LABELS_FILIPINO,
} from "@/lib/constants/pace";
import type { PaceRating } from "@/types";

/**
 * A single PACE rating cell, on the same rules as `KinderRatingSelect`.
 *
 * The dropdown names each level in full and in Filipino, because the five
 * letters are DepEd shorthand an adviser should not have to hold in their
 * head, while the closed trigger shows only the letter the printed form will
 * carry — so the screen reads the same as the paper.
 *
 * `NONE` stands in for "not yet rated": Radix refuses the empty string as an
 * item value, and clearing a cell has to be reachable from the list that set
 * it.
 */

const NONE = "__none";

const TRIGGER_STYLES: Record<PaceRating | "", string> = {
  "": "text-muted-foreground",
  A: "border-emerald-300 bg-emerald-50 font-semibold text-emerald-700",
  B: "border-sky-300 bg-sky-50 font-semibold text-sky-700",
  C: "border-amber-300 bg-amber-50 font-semibold text-amber-700",
  D: "border-orange-300 bg-orange-50 font-semibold text-orange-700",
  E: "border-red-300 bg-red-50 font-semibold text-red-700",
};

interface PaceRatingSelectProps {
  value: PaceRating | "";
  onChange: (value: PaceRating | "") => void;
  disabled?: boolean;
}

export function PaceRatingSelect({
  value,
  onChange,
  disabled,
}: PaceRatingSelectProps) {
  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => onChange(v === NONE ? "" : (v as PaceRating))}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        aria-label={value ? PACE_RATING_LABELS[value] : "Not yet rated"}
        className={`w-[3.75rem] justify-center gap-1 px-2 text-xs ${TRIGGER_STYLES[value]}`}
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>&mdash; Not yet rated</SelectItem>
        {PACE_RATINGS.map((r) => (
          <SelectItem key={r} value={r}>
            {r} &mdash; {PACE_RATING_LABELS[r]} ({PACE_RATING_LABELS_FILIPINO[r]})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
