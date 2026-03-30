"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RATING_OPTIONS = [
  { value: "1", label: "1 - Cannot yet perform" },
  { value: "2", label: "2 - With assistance" },
  { value: "3", label: "3 - Independent" },
];

interface ECCDRatingSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function ECCDRatingSelect({
  value,
  onChange,
  disabled,
  compact,
}: ECCDRatingSelectProps) {
  return (
    <Select
      value={value || "none"}
      onValueChange={(v) => onChange(v === "none" ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger className="h-9 w-full min-w-0 text-sm">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">—</SelectItem>
        {RATING_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {compact ? o.value : o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const ECCD_RATING_LABELS: Record<string, string> = {
  "1": "Cannot yet perform",
  "2": "With assistance",
  "3": "Independent",
};
