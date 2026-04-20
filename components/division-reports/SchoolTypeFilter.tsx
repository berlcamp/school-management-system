"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SCHOOL_TYPES } from "@/lib/constants";

interface SchoolTypeFilterProps {
  value: string; // "all" or one of SCHOOL_TYPES values
  onChange: (value: string) => void;
  label?: string;
}

export function SchoolTypeFilter({
  value,
  onChange,
  label = "School Type",
}: SchoolTypeFilterProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {SCHOOL_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
