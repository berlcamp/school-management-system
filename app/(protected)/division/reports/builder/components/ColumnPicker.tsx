"use client";

/**
 * Column picker for the Report Generator.
 *
 * The chosen order is the order they print, and it is the order the user
 * clicked them in — the RPC returns a JSONB object per row and JSONB does not
 * preserve key order, so this list is the only thing that knows it.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ReportField } from "@/lib/utils/reportBuilder";
import { ChevronLeft, ChevronRight, ListChecks, X } from "lucide-react";

interface ColumnPickerProps {
  fields: ReportField[];
  value: string[];
  onChange: (columns: string[]) => void;
}

export function ColumnPicker({ fields, value, onChange }: ColumnPickerProps) {
  const chosen = value
    .map((key) => fields.find((f) => f.field_key === key))
    .filter((f): f is ReportField => f !== undefined);

  const toggle = (key: string, checked: boolean) => {
    if (checked) {
      if (!value.includes(key)) onChange([...value, key]);
    } else {
      onChange(value.filter((k) => k !== key));
    }
  };

  const move = (index: number, delta: number) => {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Columns
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <ListChecks className="mr-1.5 h-3.5 w-3.5" />
              Choose columns
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <ScrollArea className="h-80">
              <div className="space-y-1 p-3">
                {fields.map((field) => (
                  <label
                    key={field.field_key}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={value.includes(field.field_key)}
                      onChange={(e) =>
                        toggle(field.field_key, e.target.checked)
                      }
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
        {value.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onChange([])}
          >
            Clear
          </Button>
        )}
      </div>

      {chosen.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No columns chosen — the report will use this dataset&apos;s defaults.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((field, index) => (
            <Badge
              key={field.field_key}
              variant="secondary"
              className="gap-0.5 py-1 pl-2 pr-1 text-xs font-normal"
            >
              <span className="mr-1">{field.label}</span>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${field.label} earlier`}
                className="rounded hover:bg-background/60 disabled:opacity-30"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === chosen.length - 1}
                aria-label={`Move ${field.label} later`}
                className="rounded hover:bg-background/60 disabled:opacity-30"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => toggle(field.field_key, false)}
                aria-label={`Remove ${field.label}`}
                className="rounded hover:bg-background/60"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
