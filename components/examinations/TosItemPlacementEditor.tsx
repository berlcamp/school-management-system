"use client";

/**
 * Item-placement editor: exam item numbers are auto-assigned sequentially
 * across competencies (competency 1 → items 1..n1, competency 2 → n1+1.., …).
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
import {
  BLOOM_LEVELS,
  THINKING_SKILL_TIERS,
  type CognitiveLevel,
} from "@/lib/constants/examinations";
import { cn } from "@/lib/utils";
import { PaintBucket } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface PlacementCompetency {
  key: string;
  competency_text: string;
  no_of_items: number;
  itemLevels: CognitiveLevel[];
}

interface TosItemPlacementEditorProps {
  competencies: PlacementCompetency[];
  onChangeLevel: (
    competencyIndex: number,
    itemIndex: number,
    level: CognitiveLevel,
  ) => void;
  disabled?: boolean;
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

  // Starting item number for each competency (cumulative across the list).
  const starts: number[] = [];
  competencies.reduce((running, c, i) => {
    starts[i] = running;
    return running + Math.max(0, c.no_of_items);
  }, 0);

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

      {/* Item grid, one block per competency */}
      <div className="space-y-3">
        {competencies.map((competency, compIndex) => {
          const start = starts[compIndex];
          if (competency.no_of_items <= 0) return null;
          const first = start + 1;
          const last = start + competency.no_of_items;

          return (
            <div
              key={competency.key}
              className="rounded-lg border bg-background p-3"
            >
              <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Competency {compIndex + 1} · Item
                    {first === last ? ` ${first}` : `s ${first}–${last}`}
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
              <div className="flex flex-wrap gap-1.5 select-none">
                {Array.from({ length: competency.no_of_items }).map(
                  (_, itemIndex) => {
                    const itemNumber = start + itemIndex + 1;
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
                        aria-label={`Item ${itemNumber}: ${label}. Activate to set to ${brushLabel}.`}
                        title={`Item ${itemNumber} · ${label}`}
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
                          {itemNumber}
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
