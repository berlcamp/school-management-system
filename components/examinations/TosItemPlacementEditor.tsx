"use client";

/**
 * Item-placement editor: exam item numbers are auto-assigned sequentially
 * across competencies (competency 1 → items 1..n1, competency 2 → n1+1.., …).
 * For each item the user picks a Bloom cognitive level. The produced levels are
 * held per competency (`itemLevels`) in the builder and turned into
 * sms_tos_items rows on save.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BLOOM_LEVELS, type CognitiveLevel } from "@/lib/constants/examinations";

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

export function TosItemPlacementEditor({
  competencies,
  onChangeLevel,
  disabled,
}: TosItemPlacementEditorProps) {
  const withItems = competencies.filter((c) => c.no_of_items > 0);
  if (withItems.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add competencies with item counts first, then assign each item&apos;s
        cognitive level here.
      </p>
    );
  }

  // Starting item number for each competency (cumulative across the list).
  const starts: number[] = [];
  competencies.reduce((running, c, i) => {
    starts[i] = running;
    return running + Math.max(0, c.no_of_items);
  }, 0);

  return (
    <div className="space-y-4">
      {competencies.map((competency, compIndex) => {
        const start = starts[compIndex];
        if (competency.no_of_items <= 0) return null;

        return (
          <div key={competency.key} className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">
              <span className="mr-1 text-muted-foreground">
                {compIndex + 1}.
              </span>
              {competency.competency_text || (
                <span className="italic text-muted-foreground">
                  (untitled competency)
                </span>
              )}
              <span className="ml-2 text-xs text-muted-foreground">
                {competency.no_of_items} item
                {competency.no_of_items === 1 ? "" : "s"}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: competency.no_of_items }).map(
                (_, itemIndex) => {
                  const itemNumber = start + itemIndex + 1;
                  const level =
                    competency.itemLevels[itemIndex] ?? BLOOM_LEVELS[0].value;
                  return (
                    <div
                      key={itemIndex}
                      className="flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1"
                    >
                      <span className="w-6 text-center text-xs font-semibold text-muted-foreground">
                        {itemNumber}
                      </span>
                      <Select
                        value={level}
                        onValueChange={(v) =>
                          onChangeLevel(
                            compIndex,
                            itemIndex,
                            v as CognitiveLevel,
                          )
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-7 w-[130px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BLOOM_LEVELS.map((lvl) => (
                            <SelectItem
                              key={lvl.value}
                              value={lvl.value}
                              className="text-xs"
                            >
                              {lvl.label} ({lvl.tier})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                },
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
