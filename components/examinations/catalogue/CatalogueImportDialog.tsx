"use client";

import { FormSection } from "@/components/examinations/BuilderLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  catalogueTemplateRows,
  importBlockedReason,
  importCatalogue,
  parseCatalogueRows,
  previewCatalogueImport,
  type CatalogueImportPreview,
  type CatalogueImportResult,
} from "@/lib/utils/catalogueImport";
import { catalogueGradeLabel } from "@/lib/constants/questionBank";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { useEffect, useId, useState, type DragEvent } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

const COLUMNS = ["Learning Area", "Grade", "LC Code", "Competency"] as const;

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        tone === "ok" && "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
        tone === "warn" && "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
        tone === "bad" && "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
        tone === "neutral" && "bg-muted/30",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function CatalogueImportDialog({ isOpen, onClose, onImported }: Props) {
  const inputId = useId();
  const [parsed, setParsed] = useState<CatalogueImportResult | null>(null);
  const [preview, setPreview] = useState<CatalogueImportPreview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);

  // A closed dialog forgets its file: reopening must not offer the last one.
  useEffect(() => {
    if (!isOpen) {
      setParsed(null);
      setPreview(null);
      setFileName(null);
      setReadError(null);
      setDragging(false);
      setFileKey((k) => k + 1);
    }
  }, [isOpen]);

  // Which existing entries the sheet would overwrite (read-only).
  useEffect(() => {
    let isMounted = true;
    setPreview(null);
    if (parsed && parsed.entries.length > 0) {
      void previewCatalogueImport(parsed.entries).then((p) => {
        if (isMounted) setPreview(p);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [parsed]);

  const onFile = async (file: File) => {
    setFileName(file.name);
    setReadError(null);
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
      setParsed(parseCatalogueRows(rows));
    } catch {
      setParsed(null);
      setReadError("That file could not be read as a spreadsheet. Save it as .xlsx or .csv and try again.");
    }
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void onFile(file);
  };

  const downloadTemplate = () => {
    const sheet = XLSX.utils.aoa_to_sheet(catalogueTemplateRows());
    sheet["!cols"] = [{ wch: 18 }, { wch: 8 }, { wch: 16 }, { wch: 70 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Competencies");
    XLSX.writeFile(book, "competency_catalogue_template.xlsx");
  };

  const onImport = async () => {
    if (!parsed || busy || parsed.entries.length === 0) return;
    setBusy(true);
    const res = await importCatalogue(parsed.entries);
    setBusy(false);
    if (res.error) return toast.error(res.error);
    toast.success(`Imported: ${res.inserted} new, ${res.updated} updated.`);
    setParsed(null);
    onImported();
    onClose();
  };

  const blocked = importBlockedReason(parsed, busy);
  const count = parsed?.entries.length ?? 0;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import competencies from Excel</DialogTitle>
          <DialogDescription>
            New entries are added and existing ones — same learning area, grade and LC code — take the
            sheet&apos;s text. Nothing is ever deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormSection
            step={1}
            title="Prepare the sheet"
            description="The first row must be these four headers. Columns may be in any order."
            action={
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="mr-1.5 h-4 w-4" /> Template
              </Button>
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {COLUMNS.map((c) => (
                <span key={c} className="rounded border bg-muted/40 px-2 py-1 font-mono text-xs">
                  {c}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Grade is SNED, K or 1–12. A learning area that does not exist yet is created.
            </p>
          </FormSection>

          <FormSection step={2} title="Choose the file" description="Excel (.xlsx, .xls) or .csv — the first sheet is read.">
            <label
              htmlFor={inputId}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                dragging
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                  : "hover:border-emerald-400 hover:bg-muted/40",
              )}
            >
              <input
                key={fileKey}
                id={inputId}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
              />
              {fileName ? (
                <>
                  <FileSpreadsheet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  <span className="max-w-full truncate text-sm font-medium">{fileName}</span>
                  <span className="text-xs text-muted-foreground">Click or drop to choose another file</span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
                  <span className="text-sm font-medium">Click to choose a file, or drop it here</span>
                  <span className="text-xs text-muted-foreground">.xlsx, .xls or .csv</span>
                </>
              )}
            </label>
            {readError && (
              <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {readError}
              </p>
            )}
          </FormSection>

          {parsed && (
            <FormSection step={3} title="Check before importing">
              <div aria-live="polite" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="To import" value={count} tone={count > 0 ? "ok" : "neutral"} />
                <Stat label="New" value={preview && !preview.error ? preview.newCount : "…"} />
                <Stat
                  label="Text overwritten"
                  value={preview && !preview.error ? preview.overwrites.length : "…"}
                  tone={preview && preview.overwrites.length > 0 ? "warn" : "neutral"}
                />
                <Stat label="Skipped" value={parsed.errors.length} tone={parsed.errors.length > 0 ? "bad" : "neutral"} />
              </div>
              {preview && !preview.error && preview.unchanged > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {preview.unchanged} already identical — no change.
                </p>
              )}
              {preview?.error && (
                <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
                  Could not check existing entries: {preview.error}
                </p>
              )}

              {preview && preview.overwrites.length > 0 && (
                <div className="mt-4">
                  <h4 className="mb-1.5 text-sm font-medium">
                    Existing text that will change ({preview.overwrites.length})
                  </h4>
                  <ul className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
                    {preview.overwrites.map((o) => (
                      <li key={`${o.learningArea}|${o.gradeLevel}|${o.lcCode}`} className="space-y-1 p-2.5">
                        <p className="text-xs font-medium">
                          {o.learningArea} · {catalogueGradeLabel(o.gradeLevel)} ·{" "}
                          <span className="font-mono">{o.lcCode}</span>
                        </p>
                        <p className="text-muted-foreground line-through">{o.oldText}</p>
                        <p className="flex items-start gap-1.5">
                          <ArrowRight className="mt-1 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                          <span>{o.newText}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {parsed.errors.length > 0 && (
                <div className="mt-4">
                  <h4 className="mb-1.5 text-sm font-medium">
                    Rows that will be skipped ({parsed.errors.length})
                  </h4>
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-red-200 bg-red-50/60 p-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    {parsed.errors.map((e) => (
                      <li key={`${e.row}-${e.message}`}>
                        <span className="font-medium tabular-nums">Row {e.row}:</span> {e.message}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Fix these in the sheet and choose it again, or import the valid rows now.
                  </p>
                </div>
              )}
            </FormSection>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {blocked ?? ""}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button disabled={busy || blocked !== null} onClick={onImport}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {busy ? "Importing…" : `Import ${count} row${count === 1 ? "" : "s"}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
