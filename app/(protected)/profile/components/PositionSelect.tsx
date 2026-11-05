"use client";

/**
 * Position picker for /profile and the /staff modal: the common DepEd plantilla
 * positions, grouped, with "Other" for a title not on the list (typed and stored
 * as written).
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
  disabled?: boolean;
  /** Width of the dropdown, for a form whose fields run the full width. */
  triggerClassName?: string;
}

export function PositionSelect({
  value,
  onChange,
  disabled,
  triggerClassName = "w-full sm:w-72",
}: Props) {
  const listed = matchDepedPosition(value);
  // Derived as well as chosen: the value may arrive after mount (a form reset),
  // and an unlisted one must still open on its text box rather than look blank.
  const [choseOther, setChoseOther] = useState(false);
  const typing = choseOther || (!!value && !listed);

  return (
    <div className="space-y-2">
      <Select
        value={typing ? OTHER : (listed ?? "")}
        disabled={disabled}
        onValueChange={(v) => {
          if (v === OTHER) {
            setChoseOther(true);
            onChange("");
          } else {
            setChoseOther(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger className={triggerClassName}>
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
          disabled={disabled}
          onChange={(e) => {
            setChoseOther(true);
            onChange(e.target.value);
          }}
        />
      )}
    </div>
  );
}
