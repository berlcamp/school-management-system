"use client";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getGradeLevelLabel, GRADE_LEVELS } from "@/lib/constants";
import type { SrcColumn } from "@/lib/constants/src";
import { useEffect, useState } from "react";
import { parseSrcValue, type SrcRow } from "./srcRow";

/**
 * One SRC table row, edited in a modal against its section's column spec.
 *
 * The modal holds a LOCAL COPY and only hands it back on Apply, so backing out
 * of a half-typed row leaves the section as it was. Applying still only touches
 * screen state; the page's Save draft is what writes.
 */

interface Props {
  open: boolean;
  columns: SrcColumn[];
  row: SrcRow | null;
  /** 1-based position in the table, for the title. Null while adding. */
  index: number | null;
  /** The table's own "Add …" wording, reused as the add dialog's title. */
  addLabel: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (row: SrcRow) => void;
  disabled: boolean;
}

/** Radix Select rejects "" as an item value; this stands in for "not set". */
const UNSET = "__unset__";

export function SrcRowDialog({
  open,
  columns,
  row,
  index,
  addLabel,
  onOpenChange,
  onSubmit,
  disabled,
}: Props) {
  const [local, setLocal] = useState<SrcRow | null>(row);

  // Re-seed whenever a different row is opened, so reopening a row that was
  // closed without applying shows what is stored, not the abandoned edits.
  useEffect(() => {
    if (open) setLocal(row);
  }, [open, row]);

  if (!local) return null;

  const set = (key: string, value: SrcRow[string]) =>
    setLocal((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSubmit = () => {
    onSubmit(local);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {index === null ? addLabel : `Edit row #${index + 1}`}
          </DialogTitle>
          <DialogDescription>
            A blank number is left out of the printed table rather than printed
            as zero.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {columns.map((col) => {
            const id = `src-field-${col.key}`;
            const raw = local[col.key];
            const asString =
              raw === null || raw === undefined ? "" : String(raw);

            return (
              <div key={col.key} className="space-y-1">
                <Label htmlFor={id} className="text-xs">
                  {col.label}
                </Label>

                {col.type === "select" ? (
                  <Select
                    value={asString === "" ? UNSET : asString}
                    onValueChange={(v) =>
                      set(col.key, v === UNSET ? "" : v)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger id={id} className="h-9">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET}>—</SelectItem>
                      {(col.options ?? []).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : col.type === "grade_level" ? (
                  <Select
                    value={asString === "" ? UNSET : asString}
                    onValueChange={(v) =>
                      set(col.key, v === UNSET ? null : Number(v))
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger id={id} className="h-9">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET}>—</SelectItem>
                      {GRADE_LEVELS.map((gl) => (
                        <SelectItem key={gl} value={String(gl)}>
                          {getGradeLevelLabel(gl)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={id}
                    className="h-9"
                    type={col.type === "text" ? "text" : "number"}
                    inputMode={col.type === "integer" ? "numeric" : undefined}
                    step={
                      col.type === "decimal" ||
                      col.type === "money" ||
                      col.type === "percent"
                        ? "0.01"
                        : undefined
                    }
                    value={asString}
                    onChange={(e) =>
                      set(col.key, parseSrcValue(col, e.target.value))
                    }
                    disabled={disabled}
                  />
                )}
              </div>
            );
          })}
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
              {index === null ? "Add row" : "Apply"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
