"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NSBI_FIELD_HELP } from "@/lib/constants/nsbi";
import { HelpCircle } from "lucide-react";
import { fromTristate, toTristate, TRISTATE_UNSET } from "./drafts";

/**
 * The field primitives shared by the Building and Room edit modals.
 *
 * They used to live inside NsbiBuildingCard; the Rooms form needs the same
 * labels-with-help and the same "blank is not zero" number input, so they sit
 * in one module rather than being written twice and drifting.
 */

/** A field label with the answering guide's definition behind a hover. */
export function FieldLabel({
  htmlFor,
  text,
}: {
  htmlFor: string;
  text: string;
}) {
  const help = NSBI_FIELD_HELP[htmlFor.split("__").pop() ?? ""];
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor} className="text-xs">
        {text}
      </Label>
      {help ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              aria-label={`What is ${text}?`}
            >
              <HelpCircle className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{help}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

/** Yes / No / not yet answered. Blank is a distinct state on a signed form. */
export function TristateField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: boolean | null;
  onChange: (next: boolean | null) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel htmlFor={id} text={label} />
      <Select
        value={toTristate(value)}
        onValueChange={(v) => onChange(fromTristate(v))}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
          <SelectItem value={TRISTATE_UNSET}>—</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  disabled,
  step,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  step?: string;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel htmlFor={id} text={label} />
      <Input
        id={id}
        type="number"
        min="0"
        step={step}
        inputMode="decimal"
        className="h-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
