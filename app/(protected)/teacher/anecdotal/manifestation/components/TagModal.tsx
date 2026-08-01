"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CLASS_TYPE_LABELS,
  LSEN_CATEGORY_LABELS,
  LSEN_CATEGORY_ORDER,
  NON_GRADED_PROGRAM_LABELS,
  lsenOptionsFor,
} from "@/lib/constants/manifestation";
import type {
  LsenCategory,
  ManifestationClassType,
  ManifestationTag,
  ManifestationTagItem,
  NonGradedProgram,
} from "@/types";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

/** One checked manifestation, with the adviser's optional observation note. */
export interface TagSelection {
  code: string;
  category: LsenCategory;
  notes: string;
}

export interface TagFormValues {
  class_type: ManifestationClassType;
  non_graded_program: NonGradedProgram | null;
  tagged_date: string;
  observation: string;
  remarks: string;
  lis_tagged: boolean;
  lis_tagged_date: string;
  selections: TagSelection[];
}

interface TagModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learnerName: string;
  existing: { tag: ManifestationTag; items: ManifestationTagItem[] } | null;
  submitting?: boolean;
  onSubmit: (values: TagFormValues) => void | Promise<void>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankValues(): TagFormValues {
  return {
    class_type: "graded",
    non_graded_program: null,
    tagged_date: today(),
    observation: "",
    remarks: "",
    lis_tagged: false,
    lis_tagged_date: "",
    selections: [],
  };
}

/**
 * Records which manifestation/s a learner carries, mirroring the LIS
 * "Special Educational Needs" panel: the class branch (graded vs non-graded,
 * the latter also naming a program) and the LSEN classification/s.
 */
export function TagModal({
  open,
  onOpenChange,
  learnerName,
  existing,
  submitting,
  onSubmit,
}: TagModalProps) {
  const [values, setValues] = useState<TagFormValues>(blankValues());
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    if (existing) {
      const { tag, items } = existing;
      setValues({
        class_type: tag.class_type,
        non_graded_program: tag.non_graded_program,
        tagged_date: tag.tagged_date ?? today(),
        observation: tag.observation ?? "",
        remarks: tag.remarks ?? "",
        lis_tagged: tag.lis_tagged,
        lis_tagged_date: tag.lis_tagged_date ?? "",
        selections: items.map((i) => ({
          code: i.code,
          category: i.category,
          notes: i.notes ?? "",
        })),
      });
    } else {
      setValues(blankValues());
    }
  }, [open, existing]);

  const selectedCodes = new Set(values.selections.map((s) => s.code));

  const toggle = (code: string, category: LsenCategory, checked: boolean) =>
    setValues((prev) => ({
      ...prev,
      selections: checked
        ? [...prev.selections, { code, category, notes: "" }]
        : prev.selections.filter((s) => s.code !== code),
    }));

  const setNote = (code: string, notes: string) =>
    setValues((prev) => ({
      ...prev,
      selections: prev.selections.map((s) =>
        s.code === code ? { ...s, notes } : s,
      ),
    }));

  const noSelection = values.selections.length === 0;
  const missingProgram =
    values.class_type === "non_graded" && !values.non_graded_program;
  const invalid = noSelection || missingProgram || !values.tagged_date;

  const handleSubmit = async () => {
    setTouched(true);
    if (invalid) return;
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit Tagging" : "Tag Learner"} — {learnerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Date Tagged<span className="text-red-500"> *</span>
              </label>
              <Input
                type="date"
                value={values.tagged_date}
                onChange={(e) =>
                  setValues((p) => ({ ...p, tagged_date: e.target.value }))
                }
                className={
                  touched && !values.tagged_date ? "border-red-500" : undefined
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Class</label>
              <Select
                value={values.class_type}
                onValueChange={(v) =>
                  setValues((p) => ({
                    ...p,
                    class_type: v as ManifestationClassType,
                    non_graded_program:
                      v === "graded" ? null : p.non_graded_program,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(CLASS_TYPE_LABELS) as ManifestationClassType[]
                  ).map((k) => (
                    <SelectItem key={k} value={k}>
                      {CLASS_TYPE_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Non-graded Program
                {values.class_type === "non_graded" && (
                  <span className="text-red-500"> *</span>
                )}
              </label>
              <Select
                value={values.non_graded_program ?? undefined}
                onValueChange={(v) =>
                  setValues((p) => ({
                    ...p,
                    non_graded_program: v as NonGradedProgram,
                  }))
                }
                disabled={values.class_type !== "non_graded"}
              >
                <SelectTrigger
                  className={
                    touched && missingProgram ? "border-red-500" : undefined
                  }
                >
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(NON_GRADED_PROGRAM_LABELS) as NonGradedProgram[]
                  ).map((k) => (
                    <SelectItem key={k} value={k}>
                      {NON_GRADED_PROGRAM_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Classification / Type of LSEN
              <span className="text-red-500"> *</span>
            </label>
            {touched && noSelection && (
              <p className="text-xs text-red-600">
                Select at least one manifestation or diagnosis.
              </p>
            )}
            <div className="space-y-3 rounded-md border p-3">
              {LSEN_CATEGORY_ORDER.map((category) => (
                <div key={category}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {LSEN_CATEGORY_LABELS[category]}
                  </p>
                  <div className="space-y-1.5">
                    {lsenOptionsFor(category).map((opt) => {
                      const checked = selectedCodes.has(opt.code);
                      const selection = values.selections.find(
                        (s) => s.code === opt.code,
                      );
                      return (
                        <div key={opt.code}>
                          <label className="flex items-start gap-2 text-sm">
                            <Checkbox
                              className="mt-0.5"
                              checked={checked}
                              onChange={(e) =>
                                toggle(opt.code, category, e.target.checked)
                              }
                            />
                            <span>{opt.label}</span>
                          </label>
                          {checked && (
                            <Input
                              className="mt-1 ml-6 h-8 text-sm"
                              placeholder="What was observed (optional)"
                              value={selection?.notes ?? ""}
                              onChange={(e) =>
                                setNote(opt.code, e.target.value)
                              }
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Observation</label>
            <Textarea
              rows={2}
              value={values.observation}
              placeholder="Printed on the parent/guardian consent form."
              onChange={(e) =>
                setValues((p) => ({ ...p, observation: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Remarks</label>
            <Textarea
              rows={2}
              value={values.remarks}
              onChange={(e) =>
                setValues((p) => ({ ...p, remarks: e.target.value }))
              }
            />
          </div>

          <div className="rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={values.lis_tagged}
                onChange={(e) =>
                  setValues((p) => ({
                    ...p,
                    lis_tagged: e.target.checked,
                    lis_tagged_date: e.target.checked
                      ? p.lis_tagged_date || today()
                      : "",
                  }))
                }
              />
              Already tagged in the DepEd LIS
            </label>
            {values.lis_tagged && (
              <div className="mt-2 ml-6 w-48">
                <Input
                  type="date"
                  value={values.lis_tagged_date}
                  onChange={(e) =>
                    setValues((p) => ({
                      ...p,
                      lis_tagged_date: e.target.value,
                    }))
                  }
                />
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              This record feeds the LIS tagging — it does not replace it. The
              LIS remains the system of record for DepEd counts.
            </p>
          </div>
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
            Save Tagging
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
