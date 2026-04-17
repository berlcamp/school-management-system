"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getGradeLevelLabel } from "@/lib/constants";
import { getMasteryLevel } from "@/lib/utils/mps";
import { Pencil, Trash2 } from "lucide-react";

export interface MpsQuarterRow {
  key: string;
  primaryLabel: string;
  secondaryLabel?: string;
  gradeLevel?: number | null;
  q1?: number | null;
  q2?: number | null;
  q3?: number | null;
  q4?: number | null;
  // For row-edit actions (optional — only by-quarter tab uses these)
  editableRowId?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

interface MpsTableProps {
  primaryHeader: string; // e.g. "Subject" or "Section"
  secondaryHeader?: string; // e.g. "Section" or "Subject"
  showGradeLevel?: boolean;
  rows: MpsQuarterRow[];
  showActions?: boolean;
  emptyText?: string;
}

function avg(values: Array<number | null | undefined>): number | null {
  const present = values.filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );
  if (present.length === 0) return null;
  return present.reduce((acc, v) => acc + v, 0) / present.length;
}

function CellValue({ value }: { value: number | null | undefined }) {
  if (value == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="tabular-nums">{value.toFixed(2)}</span>;
}

function MasteryBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const m = getMasteryLevel(value);
  return (
    <Badge variant="outline" className={`${m.colorClass} border`}>
      {m.label}
    </Badge>
  );
}

export function MpsTable({
  primaryHeader,
  secondaryHeader,
  showGradeLevel,
  rows,
  showActions,
  emptyText,
}: MpsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
        {emptyText ?? "No MPS records found."}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-background overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{primaryHeader}</th>
            {secondaryHeader && (
              <th className="px-3 py-2 text-left font-medium">
                {secondaryHeader}
              </th>
            )}
            {showGradeLevel && (
              <th className="px-3 py-2 text-left font-medium">Grade Level</th>
            )}
            <th className="px-3 py-2 text-center font-medium w-20">Q1</th>
            <th className="px-3 py-2 text-center font-medium w-20">Q2</th>
            <th className="px-3 py-2 text-center font-medium w-20">Q3</th>
            <th className="px-3 py-2 text-center font-medium w-20">Q4</th>
            <th className="px-3 py-2 text-center font-medium w-20">Avg</th>
            <th className="px-3 py-2 text-left font-medium">Mastery (Avg)</th>
            {showActions && <th className="px-3 py-2 w-24"></th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const rowAvg = avg([row.q1, row.q2, row.q3, row.q4]);
            return (
              <tr key={row.key} className="hover:bg-muted/40">
                <td className="px-3 py-2 font-medium">{row.primaryLabel}</td>
                {secondaryHeader && (
                  <td className="px-3 py-2">{row.secondaryLabel ?? "—"}</td>
                )}
                {showGradeLevel && (
                  <td className="px-3 py-2">
                    {row.gradeLevel != null
                      ? getGradeLevelLabel(row.gradeLevel)
                      : "—"}
                  </td>
                )}
                <td className="px-3 py-2 text-center">
                  <CellValue value={row.q1} />
                </td>
                <td className="px-3 py-2 text-center">
                  <CellValue value={row.q2} />
                </td>
                <td className="px-3 py-2 text-center">
                  <CellValue value={row.q3} />
                </td>
                <td className="px-3 py-2 text-center">
                  <CellValue value={row.q4} />
                </td>
                <td className="px-3 py-2 text-center font-semibold">
                  <CellValue value={rowAvg} />
                </td>
                <td className="px-3 py-2">
                  <MasteryBadge value={rowAvg} />
                </td>
                {showActions && (
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      {row.onEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={row.onEdit}
                          className="h-7 w-7"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {row.onDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={row.onDelete}
                          className="h-7 w-7 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface MpsSingleRow {
  key: string;
  subject: string;
  section: string;
  gradeLevel: number | null;
  quarter: number;
  mps: number;
  onEdit?: () => void;
  onDelete?: () => void;
}

interface MpsQuarterTableProps {
  rows: MpsSingleRow[];
  emptyText?: string;
  showActions?: boolean;
}

export function MpsQuarterTable({
  rows,
  emptyText,
  showActions,
}: MpsQuarterTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
        {emptyText ?? "No MPS records found."}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-background overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Subject</th>
            <th className="px-3 py-2 text-left font-medium">Section</th>
            <th className="px-3 py-2 text-left font-medium">Grade Level</th>
            <th className="px-3 py-2 text-center font-medium w-20">Quarter</th>
            <th className="px-3 py-2 text-center font-medium w-24">MPS</th>
            <th className="px-3 py-2 text-left font-medium">Mastery</th>
            {showActions && <th className="px-3 py-2 w-24"></th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.key} className="hover:bg-muted/40">
              <td className="px-3 py-2 font-medium">{row.subject}</td>
              <td className="px-3 py-2">{row.section}</td>
              <td className="px-3 py-2">
                {row.gradeLevel != null
                  ? getGradeLevelLabel(row.gradeLevel)
                  : "—"}
              </td>
              <td className="px-3 py-2 text-center">Q{row.quarter}</td>
              <td className="px-3 py-2 text-center font-semibold tabular-nums">
                {row.mps.toFixed(2)}
              </td>
              <td className="px-3 py-2">
                <MasteryBadge value={row.mps} />
              </td>
              {showActions && (
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1 justify-end">
                    {row.onEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={row.onEdit}
                        className="h-7 w-7"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {row.onDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={row.onDelete}
                        className="h-7 w-7 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
