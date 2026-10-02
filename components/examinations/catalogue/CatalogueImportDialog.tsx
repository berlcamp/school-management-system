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
  type CatalogueImportResult,
} from "@/lib/utils/catalogueImport";
import { useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function CatalogueImportDialog({ isOpen, onClose, onImported }: Props) {
  const [parsed, setParsed] = useState<CatalogueImportResult | null>(null);
  const [busy, setBusy] = useState(false);

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
