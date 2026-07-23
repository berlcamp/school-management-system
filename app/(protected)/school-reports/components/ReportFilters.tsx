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
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getSchoolYearOptions } from "@/lib/utils/schoolYear";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

export const ALL_TEACHERS = "all";

export interface TeacherOption {
  id: string;
  name: string;
}

interface ReportFiltersProps {
  schoolYear: string;
  onSchoolYearChange: (value: string) => void;
  teacherId: string;
  onTeacherChange: (value: string) => void;
  teacherOptions: TeacherOption[];
}

export function ReportFilters({
  schoolYear,
  onSchoolYearChange,
  teacherId,
  onTeacherChange,
  teacherOptions,
}: ReportFiltersProps) {
  const [open, setOpen] = useState(false);

  const selectedLabel =
    teacherId === ALL_TEACHERS
      ? "All Teachers"
      : (teacherOptions.find((t) => t.id === teacherId)?.name ??
        "All Teachers");

  return (
    <div className="flex flex-wrap gap-4">
      <div className="space-y-1.5 w-full sm:w-48">
        <Label className="text-xs text-muted-foreground">School Year</Label>
        <Select value={schoolYear} onValueChange={onSchoolYearChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="School Year" />
          </SelectTrigger>
          <SelectContent>
            {getSchoolYearOptions().map((sy) => (
              <SelectItem key={sy} value={sy}>
                {sy}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 w-full sm:w-72">
        <Label className="text-xs text-muted-foreground">Teacher</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between font-normal"
            >
              <span className="truncate">{selectedLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search teacher..." />
              <CommandList>
                <CommandEmpty>No teacher found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="All Teachers"
                    onSelect={() => {
                      onTeacherChange(ALL_TEACHERS);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        teacherId === ALL_TEACHERS
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    All Teachers
                  </CommandItem>
                  {teacherOptions.map((t) => (
                    <CommandItem
                      key={t.id}
                      value={t.name}
                      onSelect={() => {
                        onTeacherChange(t.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          teacherId === t.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {t.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
