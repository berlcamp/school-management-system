"use client";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { Loader2, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  RecordEntryModal,
  type RecordFieldDef,
} from "../../components/RecordEntryModal";

export interface CardexColumn<T> {
  header: string;
  nowrap?: boolean;
  preWrap?: boolean;
  value: (row: T) => string;
}

interface CardexLogPanelProps<T extends { id: string }> {
  studentId: string;
  schoolId: string | number | null;
  schoolYear: string;
  createdBy: number | null;
  /** procurements table name, e.g. "sms_cardex_needs" */
  tableName: string;
  /** column to sort entries by (descending) */
  dateColumnKey: string;
  fields: RecordFieldDef[];
  columns: CardexColumn<T>[];
  addLabel: string;
  emptyLabel: string;
  buildPayload: (values: Record<string, string>) => Record<string, string | null>;
  rowToInitial: (row: T) => Record<string, string>;
  onPrint: (rows: T[]) => Promise<void>;
}

export function CardexLogPanel<T extends { id: string }>({
  studentId,
  schoolId,
  schoolYear,
  createdBy,
  tableName,
  dateColumnKey,
  fields,
  columns,
  addLabel,
  emptyLabel,
  buildPayload,
  rowToInitial,
  onPrint,
}: CardexLogPanelProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) {
      setRows([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .eq("student_id", Number(studentId))
      .eq("school_year", schoolYear)
      .order(dateColumnKey, { ascending: false });
    if (error) {
      toast.error("Failed to load entries.");
      setRows([]);
    } else {
      setRows((data || []) as T[]);
    }
    setLoading(false);
  }, [studentId, schoolYear, tableName, dateColumnKey]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (values: Record<string, string>) => {
    if (!studentId || schoolId == null) return;
    setSubmitting(true);
    const payload = buildPayload(values);
    let error;
    if (editing) {
      ({ error } = await supabase
        .from(tableName)
        .update(payload)
        .eq("id", editing.id));
    } else {
      ({ error } = await supabase.from(tableName).insert({
        ...payload,
        student_id: Number(studentId),
        school_id: Number(schoolId),
        school_year: schoolYear,
        created_by: createdBy,
      }));
    }
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Entry updated." : "Entry added.");
    setModalOpen(false);
    setEditing(null);
    load();
  };

  const handleDelete = async (row: T) => {
    if (!window.confirm("Delete this entry?")) return;
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Entry deleted.");
    load();
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await onPrint(rows);
    } catch {
      toast.error("Failed to generate printable.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} disabled={!studentId}>
          <Plus className="mr-1 h-4 w-4" /> {addLabel}
        </Button>
        <Button
          variant="outline"
          onClick={handlePrint}
          disabled={!studentId || printing}
        >
          {printing ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Printer className="mr-1 h-4 w-4" />
          )}
          Print
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !studentId ? (
        <p className="py-8 text-center text-muted-foreground">
          Select a learner to view their record.
        </p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto border rounded-md">
          <table className="text-sm border-collapse min-w-full">
            <thead>
              <tr className="bg-muted/60">
                {columns.map((c) => (
                  <th key={c.header} className="border px-3 py-2 text-left">
                    {c.header}
                  </th>
                ))}
                <th className="border px-3 py-2 text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-muted/30">
                  {columns.map((c) => (
                    <td
                      key={c.header}
                      className={`border px-3 py-2 ${c.nowrap ? "whitespace-nowrap" : ""} ${
                        c.preWrap ? "whitespace-pre-wrap" : ""
                      }`}
                    >
                      {c.value(row) || "—"}
                    </td>
                  ))}
                  <td className="border px-2 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => { setEditing(row); setModalOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600"
                        onClick={() => handleDelete(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecordEntryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? "Edit Entry" : addLabel}
        fields={fields}
        initial={editing ? rowToInitial(editing) : undefined}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
