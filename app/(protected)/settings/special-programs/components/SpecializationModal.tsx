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
import {
  specializationLabel,
  type SpecialProgram,
  type SpecialProgramSpecialization,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  program: SpecialProgram | null;
  editData?: SpecialProgramSpecialization | null;
  onSaved: () => void;
}

export const SpecializationModal = ({
  isOpen,
  onClose,
  program,
  editData,
  onSaved,
}: Props) => {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const label = specializationLabel(program);

  useEffect(() => {
    if (!isOpen) return;
    setCode(editData?.code ?? "");
    setName(editData?.name ?? "");
    setIsActive(editData?.is_active ?? true);
  }, [isOpen, editData]);

  const handleSave = async () => {
    if (!program) return;
    if (!code.trim() || !name.trim()) {
      toast.error("A code and a name are required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        is_active: isActive,
      };

      const { error } = editData?.id
        ? await supabase
            .from("sms_special_program_specializations")
            .update(payload)
            .eq("id", editData.id)
        : await supabase
            .from("sms_special_program_specializations")
            .insert({ ...payload, special_program_id: Number(program.id) });

      if (error) throw error;
      toast.success(editData?.id ? `${label} updated.` : `${label} added.`);
      onSaved();
      onClose();
    } catch (err) {
      console.error("Save specialization:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to save.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>
            {editData?.id ? `Edit ${label}` : `Add ${label}`}
          </DialogTitle>
          <DialogDescription>
            Under <span className="font-medium">{program?.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="spec-code">Code</Label>
              <Input
                id="spec-code"
                placeholder="MUS"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="spec-name">Name</Label>
              <Input
                id="spec-name"
                placeholder="Music"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
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
                Clearing this retires it from the pickers without disturbing the
                subjects and learners already tagged to it.
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
