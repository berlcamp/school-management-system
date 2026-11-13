"use client";

/**
 * Item-placement editor: exam item numbers are auto-assigned sequentially
 * across competencies (competency 1 → items 1..n1, competency 2 → n1+1.., …)
 * unless the teacher places them by hand (`customNumbering`), typing each
 * competency's numbers — competency 1 on items 1, 4 and 9 — because tests
 * are often ordered easy-to-difficult or by test type. The builder resolves
 * the numbers; this component only displays and edits them.
 * For each item the user picks a Bloom cognitive level. The produced levels are
 * held per competency (`itemLevels`) in the builder and turned into
 * sms_tos_items rows on save.
 *
 * Interaction is "brush" style rather than one dropdown per item: the teacher
 * picks a level once, then clicks (or drags across) item chips to apply it, or
 * fills a whole competency at once. A 50-item TOS was 100 clicks through
 * dropdowns; most TOS put whole competencies at one level.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BLOOM_LEVELS,
  THINKING_SKILL_TIERS,
  type CognitiveLevel,
} from "@/lib/constants/examinations";
import { cn } from "@/lib/utils";
import { formatItemRanges, parseItemNumbers } from "@/lib/utils/tos";
import { AlertTriangle, PaintBucket } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface PlacementCompetency {
  key: string;
  competency_text: string;
  no_of_items: number;
  itemLevels: CognitiveLevel[];
  /** Exam item numbers of this competency's items, ascending. */
  itemNumbers: number[];
}

interface TosItemPlacementEditorProps {
  competencies: PlacementCompetency[];
  onChangeLevel: (
    competencyIndex: number,
    itemIndex: number,
    level: CognitiveLevel,
  ) => void;
  /** True when the teacher types each competency's item numbers. */
  customNumbering?: boolean;
  onChangeNumbers?: (competencyIndex: number, numbers: number[]) => void;
  /** Why the custom placement cannot be saved yet, if it cannot. */
  numberingError?: string | null;
  disabled?: boolean;
}

/**
 * A competency's item numbers as typed text. Committed on blur / Enter, so a
 * half-typed "1, 4," does not flash an error; a parse error stays on the
 * field and leaves the last good numbers in place.
 */
function ItemNumbersField({
  id,
  numbers,
  count,
  onCommit,
  disabled,
}: {
  id: string;
  numbers: number[];
  count: number;
  onCommit: (numbers: number[]) => void;
  disabled?: boolean;
}) {
  const formatted = formatItemRanges(numbers);
  const [text, setText] = useState(formatted);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = editing ? text : formatted;

  const commit = () => {
    setEditing(false);
    const parsed = parseItemNumbers(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    onCommit(parsed.numbers);
  };

  const mismatch = !error && numbers.length !== count;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          Item nos.
        </label>
        <Input
          id={id}
          value={shown}
          inputMode="text"
          placeholder="e.g. 1, 4, 9 or 1-3, 7"
          disabled={disabled}
          aria-invalid={!!error || mismatch}
          aria-describedby={`${id}-help`}
          className="h-8 w-full max-w-xs text-sm tabular-nums sm:w-64"
          onFocus={() => {
            setText(formatted);
            setEditing(true);
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span
          className={cn(
            "text-xs tabular-nums",
            mismatch ? "text-amber-700" : "text-muted-foreground",
          )}
        >
          {numbers.length} of {count}
        </span>
      </div>
      {error && (
        <p id={`${id}-help`} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// Colour carries the tier (LOTS sky, MOTS violet, HOTS amber) and the shade
// the level within it; every chip also prints its abbreviation, so nothing
// depends on colour alone.
const LEVEL_STYLE: Record<
  CognitiveLevel,
  { abbr: string; chip: string; swatch: string }
> = {
  remembering: {
    abbr: "Rem",
    chip: "bg-sky-50 text-sky-800 border-sky-200",
    swatch: "bg-sky-300",
  },
  understanding: {
    abbr: "Und",
    chip: "bg-sky-100 text-sky-900 border-sky-300",
    swatch: "bg-sky-500",
  },
  applying: {
    abbr: "App",
    chip: "bg-violet-50 text-violet-800 border-violet-200",
    swatch: "bg-violet-300",
  },
  analyzing: {
    abbr: "Ana",
    chip: "bg-violet-100 text-violet-900 border-violet-300",
    swatch: "bg-violet-500",
  },
  evaluating: {
    abbr: "Eva",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    swatch: "bg-amber-300",
  },
  creating: {
    abbr: "Cre",
    chip: "bg-amber-100 text-amber-900 border-amber-300",
    swatch: "bg-amber-500",
  },
};

const TIER_SHORT: Record<string, string> = {
  LOTS: "Lower-order",
  MOTS: "Moderate-order",
  HOTS: "Higher-order",
};

export function TosItemPlacementEditor({
  competencies,
  onChangeLevel,
  customNumbering = false,
  onChangeNumbers,
  numberingError,
  disabled,
}: TosItemPlacementEditorProps) {
  const [brush, setBrush] = useState<CognitiveLevel>(BLOOM_LEVELS[0].value);
  // Drag-to-paint: true between pointerdown on a chip and pointerup anywhere.
  const painting = useRef(false);

  useEffect(() => {
    const stop = () => {
      painting.current = false;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  const withItems = competencies.filter((c) => c.no_of_items > 0);
  if (withItems.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-8 text-center">
        <p className="text-sm font-medium">No items to place yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Give your competencies days (or item counts) above, then set each
          item&apos;s cognitive level here.
        </p>
      </div>
    );
  }

  // Custom numbering: which of 1..total no competency has claimed yet.
  const totalItems = competencies.reduce(
    (s, c) => s + Math.max(0, c.no_of_items),
    0,
  );
  const claimed = new Set(competencies.flatMap((c) => c.itemNumbers));
  const unplaced: number[] = [];
  if (customNumbering) {
    for (let n = 1; n <= totalItems; n++) if (!claimed.has(n)) unplaced.push(n);
  }

  // Distribution across the whole TOS, per level and per tier.
  const levelCounts = new Map<CognitiveLevel, number>();
  let total = 0;
  for (const c of competencies) {
    for (let k = 0; k < c.no_of_items; k++) {
      const lvl = c.itemLevels[k] ?? BLOOM_LEVELS[0].value;
      levelCounts.set(lvl, (levelCounts.get(lvl) ?? 0) + 1);
      total += 1;
    }
  }
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const paint = (compIndex: number, itemIndex: number, current: CognitiveLevel) => {
    if (disabled || current === brush) return;
    onChangeLevel(compIndex, itemIndex, brush);
  };

  const fillCompetency = (compIndex: number, count: number) => {
    for (let k = 0; k < count; k++) onChangeLevel(compIndex, k, brush);
  };

  const brushLabel =
    BLOOM_LEVELS.find((l) => l.value === brush)?.label ?? brush;

  return (
    <div className="space-y-4">
      {/* Brush picker, grouped by thinking-skill tier */}
      <div className="rounded-lg border bg-background p-3">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <PaintBucket className="h-3.5 w-3.5" aria-hidden />
          Pick a level, then click or drag across items to apply it.
        </div>
        <div
          role="radiogroup"
          aria-label="Cognitive level to apply"
          className="grid gap-2 sm:grid-cols-3"
        >
          {THINKING_SKILL_TIERS.map((tier) => {
            const tierCount = tier.levels.reduce(
              (s, l) => s + (levelCounts.get(l) ?? 0),
              0,
            );
            return (
              <div key={tier.key} className="rounded-md bg-muted/40 p-2">
                <div className="mb-1.5 flex items-baseline justify-between px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>
                    {tier.key}{" "}
                    <span className="normal-case tracking-normal">
                      · {TIER_SHORT[tier.key] ?? tier.label}
                    </span>
                  </span>
                  <span className="tabular-nums normal-case tracking-normal">
                    {tierCount} · {pct(tierCount)}%
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5 min-[480px]:grid-cols-2 sm:grid-cols-1 lg:grid-cols-2">
                  {tier.levels.map((value) => {
                    const lvl = BLOOM_LEVELS.find((l) => l.value === value);
                    const style = LEVEL_STYLE[value];
                    const selected = brush === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={disabled}
                        onClick={() => setBrush(value)}
                        className={cn(
                          "flex min-h-9 min-w-0 items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-left text-xs transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                          selected
                            ? "border-emerald-600 ring-1 ring-emerald-600"
                            : "hover:bg-accent",
                        )}
                      >
                        <span
                          className={cn("h-3 w-3 shrink-0 rounded-sm", style.swatch)}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {lvl?.label}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {levelCounts.get(value) ?? 0}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {customNumbering && (numberingError || unplaced.length > 0) && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            {numberingError && <p>{numberingError}</p>}
            {unplaced.length > 0 && (
              <p className={numberingError ? "mt-0.5 text-xs" : undefined}>
                Not yet placed: items {formatItemRanges(unplaced)}.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Item grid, one block per competency */}
      <div className="space-y-3">
        {competencies.map((competency, compIndex) => {
          if (competency.no_of_items <= 0) return null;
          const numbers = competency.itemNumbers;
          const rangeLabel =
            numbers.length === 0
              ? " numbers not set"
              : `${numbers.length === 1 ? "" : "s"} ${formatItemRanges(numbers)}`;

          return (
            <div
              key={competency.key}
              className="rounded-lg border bg-background p-3"
            >
              <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Competency {compIndex + 1} · Item{rangeLabel}
                  </p>
                  <p className="line-clamp-2 text-sm">
                    {competency.competency_text || (
                      <span className="italic text-muted-foreground">
                        No competency picked yet
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    fillCompetency(compIndex, competency.no_of_items)
                  }
                  title={`Set all ${competency.no_of_items} items to ${brushLabel}`}
                >
                  Set all to {brushLabel}
                </Button>
              </div>
              {customNumbering && onChangeNumbers && (
                <div className="-mt-1 mb-2.5">
                  <ItemNumbersField
                    id={`tos-item-numbers-${competency.key}`}
                    numbers={numbers}
                    count={competency.no_of_items}
                    onCommit={(next) => onChangeNumbers(compIndex, next)}
                    disabled={disabled}
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 select-none">
                {Array.from({ length: competency.no_of_items }).map(
                  (_, itemIndex) => {
                    const itemNumber: number | undefined = numbers[itemIndex];
                    const itemLabel =
                      itemNumber === undefined
                        ? `Item ${itemIndex + 1} of this competency (no number yet)`
                        : `Item ${itemNumber}`;
                    const level =
                      competency.itemLevels[itemIndex] ?? BLOOM_LEVELS[0].value;
                    const style = LEVEL_STYLE[level];
                    const label =
                      BLOOM_LEVELS.find((l) => l.value === level)?.label ??
                      level;
                    return (
                      <button
                        key={itemIndex}
                        type="button"
                        disabled={disabled}
                        aria-label={`${itemLabel}: ${label}. Activate to set to ${brushLabel}.`}
                        title={`${itemLabel} · ${label}`}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          // Let the pointer move on to sibling chips.
                          (e.target as HTMLElement).releasePointerCapture?.(
                            e.pointerId,
                          );
                          painting.current = true;
                          paint(compIndex, itemIndex, level);
                        }}
                        onPointerEnter={() => {
                          if (painting.current) paint(compIndex, itemIndex, level);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            paint(compIndex, itemIndex, level);
                          }
                        }}
                        className={cn(
                          "flex h-11 w-12 flex-col items-center justify-center rounded-md border leading-none transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                          "hover:brightness-95",
                          style.chip,
                        )}
                      >
                        <span className="text-sm font-semibold tabular-nums">
                          {itemNumber ?? "–"}
                        </span>
                        <span className="mt-1 text-[10px] font-medium uppercase tracking-wide opacity-80">
                          {style.abbr}
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
