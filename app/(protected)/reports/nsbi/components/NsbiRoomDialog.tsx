"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import {
  NSBI_ACTUAL_USAGE_LABELS,
  NSBI_ACTUAL_USAGES,
  NSBI_ROOM_CONDITIONS,
  NSBI_ROOM_USAGES,
} from "@/lib/constants/nsbi";
import type { NsbiRoomCondition, NsbiRoomUsage } from "@/types";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { RoomDraft, TRISTATE_UNSET } from "./drafts";
import { FieldLabel, NumberField } from "./NsbiFields";

/**
 * One room: NSBI Table 2 (Cols. 2–8). Edits a LOCAL COPY and hands it back on
 * Apply, so backing out of a half-typed room leaves the return as it was.
 */

interface Props {
  open: boolean;
  draft: RoomDraft | null;
  /** 1-based position within its building, for the title. Null while adding. */
  index: number | null;
  buildingName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: RoomDraft) => void;
  disabled: boolean;
}

/**
 * Col. 6. A LIST, not a checkbox set: the answering guide records a room shared
 * by two concurrent SPED classes as "SPED classroom and SPED classroom", so the
 * same usage must be addable twice and the number of entries is the number of
 * concurrent usages. Every entry is removable individually.
 */
function ActualUsageEditor({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((code, i) => (
        <Badge
          key={`${code}-${i}`}
          variant="secondary"
          className="gap-1 font-normal"
        >
          {NSBI_ACTUAL_USAGE_LABELS[code] ?? code}
          {!disabled ? (
            <button
              type="button"
              aria-label={`Remove ${NSBI_ACTUAL_USAGE_LABELS[code] ?? code}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </Badge>
      ))}
      {!disabled ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
            >
              <Plus className="mr-1 h-3 w-3" />
              Usage
            </Button>
          </PopoverTrigger>
          <PopoverContent className="max-h-72 w-72 overflow-y-auto p-1">
            {NSBI_ACTUAL_USAGES.map((group) => (
              <div key={group.group} className="mb-1">
                <div className="px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.groupLabel}
                </div>
                {group.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className="w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                    onClick={() => onChange([...value, o.value])}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

export function NsbiRoomDialog({
  open,
  draft,
  index,
  buildingName,
  onOpenChange,
  onSubmit,
  disabled,
}: Props) {
  const [local, setLocal] = useState<RoomDraft | null>(draft);

  useEffect(() => {
    if (open) setLocal(draft);
  }, [open, draft]);

  if (!local) return null;

  const p = `r${local.key}__`;
  const set = (patch: Partial<RoomDraft>) =>
    setLocal((prev) => (prev ? { ...prev, ...patch } : prev));

  const handleSubmit = () => {
    onSubmit({ ...local, room_number: local.room_number.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {index === null ? "Add room" : `Edit room #${index + 1}`}
          </DialogTitle>
          <DialogDescription>
            Table 2 for {buildingName || "(unnamed building)"}. Width is the
            chalkboard side, length the window side (answering guide, note 24).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              id={`${p}floor_number`}
              label="Floor No. (Col. 2)"
              value={local.floor_number}
              onChange={(v) => set({ floor_number: v })}
              disabled={disabled}
            />
            <div className="space-y-1">
              <FieldLabel
                htmlFor={`${p}room_number`}
                text="Room Name or No. (Col. 3)"
              />
              <Input
                id={`${p}room_number`}
                className="h-9"
                value={local.room_number}
                onChange={(e) => set({ room_number: e.target.value })}
                disabled={disabled}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel
                htmlFor={`${p}condition`}
                text="Room Condition (Col. 4)"
              />
              <Select
                value={local.condition || TRISTATE_UNSET}
                onValueChange={(v) =>
                  set({
                    condition:
                      v === TRISTATE_UNSET ? "" : (v as NsbiRoomCondition),
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger id={`${p}condition`} className="h-9">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TRISTATE_UNSET}>—</SelectItem>
                  {NSBI_ROOM_CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <FieldLabel
                htmlFor={`${p}room_usage`}
                text="Room Usage (Col. 5)"
              />
              <Select
                value={local.room_usage || TRISTATE_UNSET}
                onValueChange={(v) =>
                  set({
                    room_usage:
                      v === TRISTATE_UNSET ? "" : (v as NsbiRoomUsage),
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger id={`${p}room_usage`} className="h-9">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TRISTATE_UNSET}>—</SelectItem>
                  {NSBI_ROOM_USAGES.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Actual Usage/s (Col. 6)</Label>
            <ActualUsageEditor
              value={local.actual_usages}
              onChange={(next) => set({ actual_usages: next })}
              disabled={disabled}
            />
            <p className="text-[0.7rem] text-muted-foreground">
              Add the same usage twice when two classes share the room at once —
              the number of entries is the number of concurrent usages.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              id={`${p}width_m`}
              label="Width in metres (Col. 7)"
              value={local.width_m}
              onChange={(v) => set({ width_m: v })}
              disabled={disabled}
              step="0.01"
            />
            <NumberField
              id={`${p}length_m`}
              label="Length in metres (Col. 8)"
              value={local.length_m}
              onChange={(v) => set({ length_m: v })}
              disabled={disabled}
              step="0.01"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {disabled ? "Close" : "Cancel"}
          </Button>
          {!disabled ? (
            <Button type="button" onClick={handleSubmit}>
              {index === null ? "Add room" : "Apply"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
