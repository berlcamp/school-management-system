"use client";

/**
 * Load, save and delete a saved report definition (migration 167).
 *
 * A definition is the question, not the answer: loading one restores the
 * dataset, columns, filters, sort and scope, but never the school year — a
 * report saved last year must open on this year.
 */

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ReportDefinition } from "@/lib/utils/reportBuilder";
import { Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

export interface SaveDetails {
  name: string;
  description: string | null;
  isDivisionShared: boolean;
  /** Set when the user chose to overwrite the definition they had loaded. */
  overwriteId: number | null;
}

interface SavedReportBarProps {
  definitions: ReportDefinition[];
  loadedId: number | null;
  currentUserId: number | undefined;
  /** Null when the user clears the picker. */
  onLoad: (definition: ReportDefinition | null) => void;
  onSave: (details: SaveDetails) => void;
  onDelete: (definition: ReportDefinition) => void;
  /** False while there is nothing worth saving (no dataset chosen yet). */
  canSave: boolean;
  canManageLoaded: boolean;
  busy?: boolean;
}

const NONE = "none";

export function SavedReportBar({
  definitions,
  loadedId,
  currentUserId,
  onLoad,
  onSave,
  onDelete,
  canSave,
  canManageLoaded,
  busy,
}: SavedReportBarProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shared, setShared] = useState(false);
  const [overwrite, setOverwrite] = useState(false);

  const loaded = definitions.find((d) => d.id === loadedId) ?? null;
  const mine = definitions.filter((d) => d.owner_id === currentUserId);
  const shares = definitions.filter((d) => d.owner_id !== currentUserId);

  // Opening the dialog with a definition loaded offers to overwrite it; with
  // nothing loaded it is always a new one.
  useEffect(() => {
    if (!open) return;
    setName(loaded?.name ?? "");
    setDescription(loaded?.description ?? "");
    setShared(loaded?.is_division_shared ?? false);
    setOverwrite(loaded !== null && canManageLoaded);
  }, [open, loaded, canManageLoaded]);

  const submit = () => {
    if (name.trim() === "") return;
    onSave({
      name,
      description: description.trim() === "" ? null : description.trim(),
      isDivisionShared: shared,
      overwriteId: overwrite && loaded ? loaded.id : null,
    });
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Saved report</Label>
        <Select
          value={loadedId === null ? NONE : String(loadedId)}
          onValueChange={(value) =>
            onLoad(
              value === NONE
                ? null
                : (definitions.find((d) => String(d.id) === value) ?? null),
            )
          }
        >
          <SelectTrigger className="h-9 w-[260px]">
            <SelectValue placeholder="Start from scratch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Start from scratch</SelectItem>
            {mine.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.name}
                {d.is_division_shared ? " · shared" : ""}
              </SelectItem>
            ))}
            {shares.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.name} · division
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => setOpen(true)}
        disabled={!canSave || busy}
      >
        <Save className="mr-1.5 h-3.5 w-3.5" />
        Save
      </Button>

      {loaded && canManageLoaded && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-destructive hover:text-destructive"
          onClick={() => onDelete(loaded)}
          disabled={busy}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this report</DialogTitle>
            <DialogDescription>
              The dataset, columns, filters and scope are saved. The school year
              is not — a saved report always opens on the current one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="report-name">Name</Label>
              <Input
                id="report-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="SDO monthly enrolment extract"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="report-description">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="report-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this report is for"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
              />
              Share with the whole division office
            </label>

            {loaded && canManageLoaded && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                />
                Overwrite &ldquo;{loaded.name}&rdquo; instead of saving a new one
              </label>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={name.trim() === ""}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
