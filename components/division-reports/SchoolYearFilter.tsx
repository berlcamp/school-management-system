"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSchoolYearOptions } from "@/lib/utils/schoolYear";

interface SchoolYearFilterProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export function SchoolYearFilter({
  value,
  onChange,
  label = "School Year",
}: SchoolYearFilterProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[150px]">
          <SelectValue />
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
  );
}
