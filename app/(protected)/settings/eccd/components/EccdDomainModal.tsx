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
import { EccdDomain } from "@/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface EccdDomainModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: EccdDomain;
  nextSortOrder: number;
  onSuccess: () => void;
}

export function EccdDomainModal({
  open,
  onOpenChange,
  editData,
  nextSortOrder,
  onSuccess,
}: EccdDomainModalProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCode(editData?.code || "");
      setName(editData?.name || "");
      setDescription(editData?.description || "");
    }
  }, [open, editData]);

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    setSaving(true);
    try {
      if (editData) {
        const { error } = await supabase
          .from("sms_eccd_domains")
          .update({ code: code.trim(), name: name.trim(), description: description.trim() || null })
          .eq("id", editData.id);
        if (error) throw error;
        toast.success("Domain updated");
      } else {
        const { error } = await supabase
          .from("sms_eccd_domains")
          .insert({ code: code.trim(), name: name.trim(), description: description.trim() || null, sort_order: nextSortOrder });
        if (error) throw error;
        toast.success("Domain added");
      }
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save domain");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Domain" : "Add Domain"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="domain-code">Code</Label>
            <Input
              id="domain-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. GM"
              className="w-32"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain-name">Name</Label>
            <Input
              id="domain-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gross Motor Skills"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain-desc">Description (optional)</Label>
            <Textarea
              id="domain-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this domain"
              rows={2}
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
