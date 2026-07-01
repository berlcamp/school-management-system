"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface ClassRecordItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  componentTitle: string;
  initialLabel?: string | null;
  initialMaxScore?: number;
  onSave: (values: { label: string; max_score: number }) => Promise<boolean> | boolean;
}

export function ClassRecordItemModal({
  open,
  onOpenChange,
  mode,
  componentTitle,
  initialLabel,
  initialMaxScore,
  onSave,
}: ClassRecordItemModalProps) {
  const [label, setLabel] = useState("");
  const [maxScore, setMaxScore] = useState("10");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(initialLabel ?? "");
      setMaxScore(String(initialMaxScore ?? 10));
    }
  }, [open, initialLabel, initialMaxScore]);

  const handleSave = async () => {
    const score = Number(maxScore);
    if (!score || score <= 0) {
      toast.error("Highest possible score must be greater than 0.");
      return;
    }
    setSaving(true);
    const ok = await onSave({ label: label.trim(), max_score: score });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add Item" : "Edit Item"} — {componentTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cr-item-label">Item Title</Label>
            <Input
              id="cr-item-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Quiz 1"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cr-item-max">Highest Possible Score</Label>
            <Input
              id="cr-item-max"
              type="number"
              min={1}
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
