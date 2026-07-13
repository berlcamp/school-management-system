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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export interface RecordFieldDef {
  key: string;
  label: string;
  type: "date" | "text" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

interface RecordEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: RecordFieldDef[];
  initial?: Record<string, string>;
  submitting?: boolean;
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
}

function emptyValues(fields: RecordFieldDef[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}

export function RecordEntryModal({
  open,
  onOpenChange,
  title,
  fields,
  initial,
  submitting,
  onSubmit,
}: RecordEntryModalProps) {
  const [values, setValues] = useState<Record<string, string>>(
    emptyValues(fields),
  );
  const [touched, setTouched] = useState(false);

  // Reset the form whenever the modal opens (for add) or the edited row changes.
  useEffect(() => {
    if (open) {
      setValues({ ...emptyValues(fields), ...(initial ?? {}) });
      setTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const missingRequired = fields.some(
    (f) => f.required && !values[f.key]?.trim(),
  );

  const handleSubmit = async () => {
    setTouched(true);
    if (missingRequired) return;
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map((f) => {
            const invalid = touched && f.required && !values[f.key]?.trim();
            return (
              <div key={f.key} className="space-y-1.5">
                <label className="text-sm font-medium">
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                </label>
                {f.type === "textarea" ? (
                  <Textarea
                    value={values[f.key] ?? ""}
                    placeholder={f.placeholder}
                    rows={3}
                    onChange={(e) => setValue(f.key, e.target.value)}
                    className={invalid ? "border-red-500" : undefined}
                  />
                ) : f.type === "select" ? (
                  <Select
                    value={values[f.key] || undefined}
                    onValueChange={(v) => setValue(f.key, v)}
                  >
                    <SelectTrigger className={invalid ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(f.options ?? []).map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={f.type === "date" ? "date" : "text"}
                    value={values[f.key] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => setValue(f.key, e.target.value)}
                    className={invalid ? "border-red-500" : undefined}
                  />
                )}
              </div>
            );
          })}
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
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
