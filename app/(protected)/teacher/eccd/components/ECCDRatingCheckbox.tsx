"use client";

import { Checkbox } from "@/components/ui/checkbox";

interface ECCDRatingCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ECCDRatingCheckbox({
  checked,
  onChange,
  disabled,
}: ECCDRatingCheckboxProps) {
  return (
    <div className="flex items-center justify-center">
      <Checkbox
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
    </div>
  );
}
