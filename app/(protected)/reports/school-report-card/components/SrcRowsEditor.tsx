"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SrcColumn } from "@/lib/constants/src";
import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { SrcRowDialog } from "./SrcRowDialog";
import { blankSrcRow, formatSrcValue, type SrcRow } from "./srcRow";

// The row conversions live in ./srcRow so the table and the modal share them;
// re-exported here because every section imports them alongside this editor.
export {
  fromSrcRows,
  toSrcRows,
  type SrcRow,
  type SrcRowValue,
} from "./srcRow";

/**
 * One SRC section's table. The row is display-only, in the same `app__table`
 * dress every other module's list wears, and every field is edited in a modal —
 * a grid of live inputs made a 5-column section unreadable at a glance and
 * offered no way to back out of a half-typed row.
 */

interface SrcRowsEditorProps {
  columns: SrcColumn[];
  rows: SrcRow[];
  onChange: (rows: SrcRow[]) => void;
  disabled?: boolean;
  /** Shown in place of the table when there is nothing entered yet. */
  emptyLabel?: string;
  addLabel?: string;
}

export function SrcRowsEditor({
  columns,
  rows,
  onChange,
  disabled = false,
  emptyLabel = "No rows yet.",
  addLabel = "Add row",
}: SrcRowsEditorProps) {
  // `index` null marks an add; nothing reaches `rows` until Apply, so
  // cancelling never leaves a blank row behind on the section.
  const [editing, setEditing] = useState<{
    row: SrcRow;
    index: number | null;
  } | null>(null);

  const submitRow = (row: SrcRow) => {
    const at = editing?.index ?? null;
    onChange(at === null ? [...rows, row] : rows.map((r, i) => (i === at ? row : r)));
  };

  const removeRow = (index: number) =>
    onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="app__table_container">
          <div className="app__table_wrapper">
            <table className="app__table">
              <thead className="app__table_thead">
                <tr>
                  {columns.map((col) => (
                    <th key={col.key} className="app__table_th">
                      {col.label}
                    </th>
                  ))}
                  <th className="app__table_th_right">Actions</th>
                </tr>
              </thead>
              <tbody className="app__table_tbody">
                {rows.map((row, index) => (
                  <tr key={index} className="app__table_tr">
                    {columns.map((col, colIndex) => (
                      <td key={col.key} className="app__table_td">
                        {colIndex === 0 ? (
                          <div className="app__table_cell_title">
                            {formatSrcValue(col, row[col.key])}
                          </div>
                        ) : (
                          <span className="text-sm">
                            {formatSrcValue(col, row[col.key])}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="app__table_td_actions">
                      <div className="app__table_action_container">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            >
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={() => setEditing({ row, index })}
                              className="cursor-pointer"
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              {disabled ? "View" : "Edit"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => removeRow(index)}
                              disabled={disabled}
                              variant="destructive"
                              className="cursor-pointer"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          setEditing({ row: blankSrcRow(columns), index: null })
        }
        disabled={disabled}
      >
        <Plus className="mr-2 h-4 w-4" />
        {addLabel}
      </Button>

      <SrcRowDialog
        open={editing !== null}
        columns={columns}
        row={editing?.row ?? null}
        index={editing?.index ?? null}
        addLabel={addLabel}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSubmit={submitRow}
        disabled={disabled}
      />
    </div>
  );
}
