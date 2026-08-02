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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RPMS_KRAS } from "@/lib/constants/supervision";
import type { SupervisionPlanEntry } from "@/types";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export interface PlanEntryFormValues {
  teachers: string;
  kra: string;
  priority_strand: string;
  objectives: string;
  activities: string;
  success_indicators: string;
  means_of_verification: string;
  time_frame: string;
  accomplishment: string;
  remarks: string;
}

interface PlanEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: SupervisionPlanEntry | null;
  submitting?: boolean;
  onSubmit: (values: PlanEntryFormValues) => void | Promise<void>;
}

const BLANK: PlanEntryFormValues = {
  teachers: "",
  kra: "",
  priority_strand: "",
  objectives: "",
  activities: "",
  success_indicators: "",
  means_of_verification: "",
  time_frame: "",
  accomplishment: "",
  remarks: "",
};

export function PlanEntryModal({
  open,
  onOpenChange,
  existing,
  submitting,
  onSubmit,
}: PlanEntryModalProps) {
  const [values, setValues] = useState<PlanEntryFormValues>(BLANK);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setValues(
      existing
        ? {
            teachers: existing.teachers,
            kra: existing.kra ?? "",
            priority_strand: existing.priority_strand ?? "",
            objectives: existing.objectives ?? "",
            activities: existing.activities ?? "",
            success_indicators: existing.success_indicators ?? "",
            means_of_verification: existing.means_of_verification ?? "",
            time_frame: existing.time_frame ?? "",
            accomplishment: existing.accomplishment ?? "",
            remarks: existing.remarks ?? "",
          }
        : BLANK,
    );
  }, [open, existing]);

  const set = <K extends keyof PlanEntryFormValues>(
    key: K,
    value: PlanEntryFormValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!values.teachers.trim()) {
      setError("Name the teacher/s or group this row covers.");
      return;
    }
    setError(null);
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit plan row" : "Add plan row"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name of teachers / learning area / level</Label>
            <Textarea
              rows={3}
              value={values.teachers}
              onChange={(e) => set("teachers", e.target.value)}
              placeholder={"One per line, or a group —\ne.g. All Primary Grade Teachers"}
            />
            <p className="text-xs text-muted-foreground">
              A row may name individuals or cover a whole group.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Key Result Area</Label>
              <Select
                value={values.kra || "none"}
                onValueChange={(v) => set("kra", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select KRA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {RPMS_KRAS.map((k) => (
                    <SelectItem key={k.key} value={k.label}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority strand</Label>
              <Input
                value={values.priority_strand}
                onChange={(e) => set("priority_strand", e.target.value)}
                placeholder="e.g. 1.1 Apply knowledge of content within and across…"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Objectives</Label>
            <Textarea
              rows={3}
              value={values.objectives}
              onChange={(e) => set("objectives", e.target.value)}
              placeholder="Anchored on your role as School Head — the support, guidance and interventions you will provide."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Enabling projects and/or activities</Label>
              <Textarea
                rows={2}
                value={values.activities}
                onChange={(e) => set("activities", e.target.value)}
                placeholder="e.g. Classroom Observation, Demo Teaching"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Success indicators</Label>
              <Textarea
                rows={2}
                value={values.success_indicators}
                onChange={(e) => set("success_indicators", e.target.value)}
                placeholder="The expected number of teachers who demonstrate the competency."
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Means of verification</Label>
              <Textarea
                rows={2}
                value={values.means_of_verification}
                onChange={(e) => set("means_of_verification", e.target.value)}
                placeholder="e.g. COT-RPMS rating sheet, lesson plans"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Time frame</Label>
              <Textarea
                rows={2}
                value={values.time_frame}
                onChange={(e) => set("time_frame", e.target.value)}
                placeholder={"e.g. July 13, 2026\n8:20 to 9:20 a.m."}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Accomplishment / status</Label>
            <Textarea
              rows={2}
              value={values.accomplishment}
              onChange={(e) => set("accomplishment", e.target.value)}
              placeholder="Determined by how many of the success indicators were attained."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Remarks (STAR approach)</Label>
            <Textarea
              rows={3}
              value={values.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              placeholder="Situation, Task, Action, Result"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {existing ? "Save changes" : "Add row"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
