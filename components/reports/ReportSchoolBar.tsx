"use client";

/**
 * The school picker at the head of `/school-reports/*`, shown only to the
 * division users who have no school of their own. A school-level user is pinned
 * to their active school and sees nothing here.
 */

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useReportSchool } from "@/components/reports/ReportSchoolContext";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, School as SchoolIcon } from "lucide-react";
import { useState } from "react";

export function ReportSchoolBar() {
  const { isDivisionUser, schoolId, schoolName, schools, selectSchool } =
    useReportSchool();
  const [open, setOpen] = useState(false);

  if (!isDivisionUser) return null;

  return (
    <div className="mx-4 mt-4 mb-0 rounded-lg border bg-muted/40 px-4 py-3 md:mx-6 md:mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <SchoolIcon className="h-4 w-4 text-primary" />
          Reporting on
        </div>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between font-normal sm:w-80 bg-background"
            >
              <span className="truncate">
                {schoolName ?? "Select a school..."}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search school..." />
              <CommandList>
                <CommandEmpty>No school found.</CommandEmpty>
                <CommandGroup>
                  {schools.map((school) => (
                    <CommandItem
                      key={school.id}
                      value={school.name}
                      onSelect={() => {
                        selectSchool(school.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          schoolId === school.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {school.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {schoolId ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => selectSchool(null)}
          >
            Clear
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Choose a school to generate its reports.
          </p>
        )}
      </div>
    </div>
  );
}
