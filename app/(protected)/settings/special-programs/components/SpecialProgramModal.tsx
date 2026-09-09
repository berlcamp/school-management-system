"use client";

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
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SPECIALIZATION_LABEL, type SpecialProgram } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editData?: SpecialProgram | null;
  /**
   * NULL creates a division-wide row, usable by every school. Only division
   * roles may pass NULL, and the RLS policy — not this prop — is what enforces
   * that (migration 179, following 125).
   */
  scopeSchoolId: string | null;
  onSaved: () => void;
}

export const SpecialProgramModal = ({
  isOpen,
  onClose,
  editData,
  scopeSchoolId,
  onSaved,
}: Props) => {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [specializationLabelValue, setSpecializationLabelValue] = useState(
    DEFAULT_SPECIALIZATION_LABEL,
  );
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCode(editData?.code ?? "");
    setName(editData?.name ?? "");
    setSpecializationLabelValue(
      editData?.specialization_label || DEFAULT_SPECIALIZATION_LABEL,
    );
    setDescription(editData?.description ?? "");
    setIsActive(editData?.is_active ?? true);
  }, [isOpen, editData]);

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("A code and a name are required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        specialization_label:
          specializationLabelValue.trim() || DEFAULT_SPECIALIZATION_LABEL,
        description: description.trim() || null,
        is_active: isActive,
      };

      const { error } = editData?.id
        ? await supabase
            .from("sms_special_programs")
            .update(payload)
            .eq("id", editData.id)
        : await supabase.from("sms_special_programs").insert({
            ...payload,
            school_id: scopeSchoolId == null ? null : Number(scopeSchoolId),
          });

      if (error) throw error;
      toast.success(editData?.id ? "Program updated." : "Program added.");
      onSaved();
      onClose();
    } catch (err) {
      console.error("Save special program:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to save the program.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {editData?.id ? "Edit Special Program" : "Add Special Program"}
          </DialogTitle>
          <DialogDescription>
            {scopeSchoolId == null
              ? "A division-wide program, available to every school in the division."
              : "A program for this school only."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="sp-code">Code</Label>
              <Input
                id="sp-code"
                placeholder="SPA"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="sp-name">Name</Label>
              <Input
                id="sp-name"
                placeholder="Special Program in the Arts"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sp-label">What this program calls its parts</Label>
            <Input
              id="sp-label"
              placeholder={DEFAULT_SPECIALIZATION_LABEL}
              value={specializationLabelValue}
              onChange={(e) => setSpecializationLabelValue(e.target.value)}
              disabled={saving}
            />
            {/* Programs do not share one hierarchy: SPA has areas of
                specialization, SPS has sports, SPFL has languages, and STE has
                nothing beneath it at all. */}
            <p className="text-xs text-muted-foreground">
              e.g. &ldquo;Area of Specialization&rdquo; for SPA,
              &ldquo;Sport&rdquo; for SPS, &ldquo;Language&rdquo; for SPFL.
              Leave the default if the program has no second level.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sp-desc">Description</Label>
            <Textarea
              id="sp-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>

          <label className="flex items-start gap-2">
            <Checkbox
              className="mt-0.5"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={saving}
            />
            <span className="text-sm">
              <span className="font-medium">Active</span>
              <span className="block text-xs text-muted-foreground">
                Retire a program by clearing this rather than deleting it —
                subjects and learners already tagged to it keep their labels.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
