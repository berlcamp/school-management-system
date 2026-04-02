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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";
import { EccdCompetency } from "@/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface EccdCompetencyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: EccdCompetency;
  domainId: string;
  nextSortOrder: number;
  onSuccess: () => void;
}

export function EccdCompetencyModal({
  open,
  onOpenChange,
  editData,
  domainId,
  nextSortOrder,
  onSuccess,
}: EccdCompetencyModalProps) {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCode(editData?.code || "");
      setDescription(editData?.description || "");
    }
  }, [open, editData]);

  const handleSave = async () => {
    if (!code.trim() || !description.trim()) {
      toast.error("Code and description are required");
      return;
    }
    setSaving(true);
    try {
      if (editData) {
        const { error } = await supabase
          .from("sms_eccd_competencies")
          .update({ code: code.trim(), description: description.trim() })
          .eq("id", editData.id);
        if (error) throw error;
        toast.success("Item updated");
      } else {
        const { error } = await supabase
          .from("sms_eccd_competencies")
          .insert({
            domain_id: domainId,
            code: code.trim(),
            description: description.trim(),
            sort_order: nextSortOrder,
          });
        if (error) throw error;
        toast.success("Item added");
      }
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Checklist Item" : "Add Checklist Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="comp-code">Code</Label>
            <Input
              id="comp-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. GM-01"
              className="w-32"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comp-desc">Description</Label>
            <Textarea
              id="comp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the competency item"
              rows={3}
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
