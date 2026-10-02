"use client";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CatalogueCompetency } from "@/types";
import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";

interface Props {
  options: CatalogueCompetency[];
  value: string | null;
  /** Entries already picked elsewhere on the same TOS. */
  excludeIds?: string[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (c: CatalogueCompetency) => void;
}

/** Search the catalogue by LC code or text; retired entries are not offered. */
export function CataloguePicker({ options, value, excludeIds = [], disabled, placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.id) === String(value));
  const choices = options.filter(
    (o) => o.is_active && (!excludeIds.includes(String(o.id)) || String(o.id) === String(value)),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-auto min-h-9 w-full justify-between whitespace-normal text-left font-normal"
        >
          <span className={selected ? "" : "text-muted-foreground"}>
            {selected ? (
              <>
                <span className="mr-2 font-mono text-xs">{selected.lc_code}</span>
                {selected.competency_text}
                {!selected.is_active && <span className="ml-2 text-xs text-amber-600">(retired)</span>}
              </>
            ) : (
              placeholder ?? "Pick a competency"
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(36rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search LC code or competency…" />
          <CommandList>
            <CommandEmpty>No competency in the catalogue for this learning area and grade.</CommandEmpty>
            <CommandGroup>
              {choices.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.lc_code} ${o.competency_text}`}
                  onSelect={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                >
                  <span className="mr-2 font-mono text-xs">{o.lc_code}</span>
                  <span className="text-sm">{o.competency_text}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
