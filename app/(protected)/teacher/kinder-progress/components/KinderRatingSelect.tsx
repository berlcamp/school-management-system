"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KINDER_RATINGS, KINDER_RATING_LABELS } from "@/lib/constants/kinderProgress";
import type { KinderProgressRating } from "@/types";

/**
 * A single rating cell.
 *
 * The dropdown names each level in full ("BG — Beginning"), because the three
 * letters are DepEd shorthand an adviser should not have to remember, while the
 * closed trigger shows only the letter the printed card will carry — so the
 * grid reads the same on screen as it does on paper.
 *
 * `NONE` stands in for "not yet rated": Radix treats the empty string as
 * "no value" and refuses it as an item value, and clearing a cell has to be
 * reachable from the same list that set it.
 */

const NONE = "__none";

const TRIGGER_STYLES: Record<KinderProgressRating | "", string> = {
  "": "text-muted-foreground",
  BG: "border-red-300 bg-red-50 font-semibold text-red-700",
  DV: "border-amber-300 bg-amber-50 font-semibold text-amber-700",
  CO: "border-emerald-300 bg-emerald-50 font-semibold text-emerald-700",
};

interface KinderRatingSelectProps {
  value: KinderProgressRating | "";
  onChange: (value: KinderProgressRating | "") => void;
  disabled?: boolean;
}

export function KinderRatingSelect({
  value,
  onChange,
  disabled,
}: KinderRatingSelectProps) {
  return (
    <Select
      value={value || NONE}
      onValueChange={(v) =>
        onChange(v === NONE ? "" : (v as KinderProgressRating))
      }
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        aria-label={value ? KINDER_RATING_LABELS[value] : "Not yet rated"}
        className={`w-[4.75rem] justify-center gap-1 px-2 text-xs ${TRIGGER_STYLES[value]}`}
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>&mdash; Not yet rated</SelectItem>
        {KINDER_RATINGS.map((r) => (
          <SelectItem key={r} value={r}>
            {r} &mdash; {KINDER_RATING_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
