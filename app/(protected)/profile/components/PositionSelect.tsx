"use client";

/**
 * Position picker for /profile: the common DepEd plantilla positions, grouped,
 * with "Other" for a title not on the list (typed and stored as written).
 */

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEPED_POSITION_GROUPS, matchDepedPosition } from "@/lib/constants";
import { useState } from "react";

const OTHER = "__other";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function PositionSelect({ value, onChange }: Props) {
  const listed = matchDepedPosition(value);
  const [typing, setTyping] = useState(!!value && !listed);

  return (
    <div className="space-y-2">
      <Select
        value={typing ? OTHER : (listed ?? "")}
        onValueChange={(v) => {
          if (v === OTHER) {
            setTyping(true);
            onChange("");
          } else {
            setTyping(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger className="w-full sm:w-72">
          <SelectValue placeholder="Select position" />
        </SelectTrigger>
        <SelectContent>
          {DEPED_POSITION_GROUPS.map((g) => (
            <SelectGroup key={g.label}>
              <SelectLabel>{g.label}</SelectLabel>
              {g.positions.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
          <SelectGroup>
            <SelectLabel>Not listed</SelectLabel>
            <SelectItem value={OTHER}>Other position (type it)</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {typing && (
        <Input
          aria-label="Position — specify"
          placeholder="e.g. ICT Coordinator"
          value={value}
          maxLength={120}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
