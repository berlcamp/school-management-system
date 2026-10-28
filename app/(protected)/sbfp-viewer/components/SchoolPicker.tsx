"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SBFP_DISTRICTS } from "@/lib/constants/sbfp";
import { schoolsByDistrict, type SbfpSchoolOption } from "@/lib/utils/sbfp";
import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

/** Searchable school picker, grouped under the division's districts. */
export function SchoolPicker({
  schools,
  value,
  onChange,
}: {
  schools: readonly SbfpSchoolOption[];
  value: string;
  onChange: (schoolId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => schoolsByDistrict(schools, SBFP_DISTRICTS), [schools]);
  const selected = schools.find((s) => s.id === value);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-md">
      <span id="sbfp-school-label" className="text-sm font-medium text-slate-700">
        School
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls="sbfp-school-list"
            aria-labelledby="sbfp-school-label"
            className="flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-white px-3 text-left text-sm shadow-xs transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700"
          >
            <span className={`truncate ${selected ? "text-slate-900" : "text-slate-500"}`}>
              {selected ? selected.name : "Choose a school"}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search schools…" />
            <CommandList id="sbfp-school-list" className="max-h-[320px]">
              <CommandEmpty>No school found.</CommandEmpty>
              {groups.map((g) => (
                <CommandGroup key={g.district ?? "other"} heading={g.district ? `${g.district} District` : "Other"}>
                  {g.schools.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={`${s.name} ${s.id}`}
                      onSelect={() => {
                        onChange(s.id);
                        setOpen(false);
                      }}
                      className="cursor-pointer"
                    >
                      <Check
                        className={`h-4 w-4 ${s.id === value ? "opacity-100" : "opacity-0"}`}
                        aria-hidden="true"
                      />
                      {s.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
