"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getGradeLevelLabel, GRADE_LEVELS } from "@/lib/constants";
import type { SrcColumn } from "@/lib/constants/src";
import { Plus, Trash2 } from "lucide-react";

/** A row is an open bag of primitives; the column spec gives it meaning. */
export type SrcRowValue = string | number | null;
export type SrcRow = Record<string, SrcRowValue>;

/**
 * The editor boundary. Section payload rows are declared interfaces, which
 * have no index signature and so are not assignable to SrcRow either way.
 * These two functions are the single, named place where a typed row is
 * widened into an editable record and back; the column spec passed alongside
 * is what actually keeps the keys honest at runtime. Keep the conversion here
 * rather than casting at each call site.
 */
export function toSrcRows<T>(rows: T[]): SrcRow[] {
  return rows as unknown as SrcRow[];
}

export function fromSrcRows<T>(rows: SrcRow[]): T[] {
  return rows as unknown as T[];
}

interface SrcRowsEditorProps {
  columns: SrcColumn[];
  rows: SrcRow[];
  onChange: (rows: SrcRow[]) => void;
  disabled?: boolean;
  /** Shown in place of the table when there is nothing entered yet. */
  emptyLabel?: string;
  addLabel?: string;
}

function blankRow(columns: SrcColumn[]): SrcRow {
  const row: SrcRow = {};
  for (const col of columns) {
    row[col.key] = col.type === "text" || col.type === "select" ? "" : null;
  }
  return row;
}

function parseValue(col: SrcColumn, raw: string): SrcRowValue {
  if (col.type === "text" || col.type === "select") return raw;
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return col.type === "integer" || col.type === "grade_level"
    ? Math.trunc(n)
    : n;
}

export function SrcRowsEditor({
  columns,
  rows,
  onChange,
  disabled = false,
  emptyLabel = "No rows yet.",
  addLabel = "Add row",
}: SrcRowsEditorProps) {
  const updateCell = (index: number, key: string, value: SrcRowValue) => {
    const next = rows.map((r, i) => (i === index ? { ...r, [key]: value } : r));
    onChange(next);
  };

  const addRow = () => onChange([...rows, blankRow(columns)]);
  const removeRow = (index: number) =>
    onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key} className={col.className}>
                    {col.label}
                  </TableHead>
                ))}
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={index}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.type === "select" ? (
                        <Select
                          value={String(row[col.key] ?? "")}
                          onValueChange={(v) => updateCell(index, col.key, v)}
                          disabled={disabled}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {(col.options ?? []).map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : col.type === "grade_level" ? (
                        <Select
                          value={
                            row[col.key] === null || row[col.key] === undefined
                              ? ""
                              : String(row[col.key])
                          }
                          onValueChange={(v) =>
                            updateCell(index, col.key, Number(v))
                          }
                          disabled={disabled}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {GRADE_LEVELS.map((gl) => (
                              <SelectItem key={gl} value={String(gl)}>
                                {getGradeLevelLabel(gl)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={col.type === "text" ? "text" : "number"}
                          inputMode={
                            col.type === "integer" ? "numeric" : undefined
                          }
                          step={
                            col.type === "decimal" ||
                            col.type === "money" ||
                            col.type === "percent"
                              ? "0.01"
                              : undefined
                          }
                          value={
                            row[col.key] === null || row[col.key] === undefined
                              ? ""
                              : String(row[col.key])
                          }
                          onChange={(e) =>
                            updateCell(
                              index,
                              col.key,
                              parseValue(col, e.target.value),
                            )
                          }
                          disabled={disabled}
                        />
                      )}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(index)}
                      disabled={disabled}
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={disabled}
      >
        <Plus className="mr-2 h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}
