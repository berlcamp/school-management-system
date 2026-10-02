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
import {
  importCatalogue,
  parseCatalogueRows,
  previewCatalogueImport,
  type CatalogueImportPreview,
  type CatalogueImportResult,
} from "@/lib/utils/catalogueImport";
import { catalogueGradeLabel } from "@/lib/constants/questionBank";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function CatalogueImportDialog({ isOpen, onClose, onImported }: Props) {
  const [parsed, setParsed] = useState<CatalogueImportResult | null>(null);
  const [preview, setPreview] = useState<CatalogueImportPreview | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);

  // A closed dialog forgets its file: reopening must not offer the last one.
  useEffect(() => {
    if (!isOpen) {
      setParsed(null);
      setPreview(null);
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
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
      setParsed(parseCatalogueRows(rows));
    } catch {
      setParsed(null);
      toast.error("That file could not be read as a spreadsheet.");
    }
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

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import competencies</DialogTitle>
          <DialogDescription>
            An Excel sheet whose first row is <b>Learning Area | Grade | LC Code | Competency</b>. New entries are
            added and existing ones (same learning area, grade and LC code) get the sheet&apos;s text. Nothing is deleted.
          </DialogDescription>
        </DialogHeader>
        <input
          key={fileKey}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
        />
        {parsed && (
          <div className="space-y-2 text-sm">
            <p>
              {parsed.entries.length} valid row{parsed.entries.length === 1 ? "" : "s"}
              {parsed.errors.length > 0 && `, ${parsed.errors.length} skipped`}.
            </p>
            {preview && !preview.error && (
              <p>
                {preview.newCount} new, {preview.overwrites.length} existing entr
                {preview.overwrites.length === 1 ? "y" : "ies"} will have their text overwritten
                {preview.unchanged > 0 && `, ${preview.unchanged} already identical`}.
              </p>
            )}
            {preview?.error && <p className="text-red-700">Could not check existing entries: {preview.error}</p>}
            {preview && preview.overwrites.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded border p-2 text-xs">
                {preview.overwrites.map((o) => (
                  <li key={`${o.learningArea}|${o.gradeLevel}|${o.lcCode}`}>
                    <b>{o.learningArea} · {catalogueGradeLabel(o.gradeLevel)} · {o.lcCode}</b>
                    <br />
                    <span className="text-muted-foreground line-through">{o.oldText}</span>
                    <br />
                    {o.newText}
                  </li>
                ))}
              </ul>
            )}
            {parsed.errors.length > 0 && (
              <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-red-700">
                {parsed.errors.map((e) => (
                  <li key={`${e.row}-${e.message}`}>Row {e.row}: {e.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !parsed || parsed.entries.length === 0} onClick={onImport}>
            {busy ? "Importing…" : `Import ${parsed?.entries.length ?? 0} row(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
