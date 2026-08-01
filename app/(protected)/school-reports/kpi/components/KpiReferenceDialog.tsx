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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KPI_POPULATION_LABELS, KpiPopulationKey } from "@/lib/constants/kpi";
import { supabase } from "@/lib/supabase/client";
import { seatTotal } from "@/lib/utils/kpi";
import type { KpiReference } from "@/types";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

/** Every editable column, kept in one list so the form and the save agree. */
const POPULATION_KEYS: KpiPopulationKey[] = [
  "population_age_5",
  "population_age_6",
  "population_ages_6_11",
  "population_ages_5_11",
  "population_ages_12_15",
  "population_ages_16_17",
  "population_ages_12_17",
  "population_ages_5_17",
];

const SEAT_FIELDS: { key: keyof KpiReference; label: string; hint: string }[] = [
  {
    key: "seats_kindergarten",
    label: "Kindergarten seats",
    hint: "Counted once each",
  },
  { key: "seats_arm_chairs", label: "Arm chairs", hint: "Counted once each" },
  {
    key: "seats_school_desks",
    label: "School desks",
    hint: "Counted as 2 seats each",
  },
  {
    key: "seats_two_seater_desks",
    label: "New-design 2-seater desks",
    hint: "Counted as 2 seats each",
  },
];

type FormState = Record<string, string>;

const NUMERIC_FIELDS: (keyof KpiReference)[] = [
  ...POPULATION_KEYS,
  "seats_kindergarten",
  "seats_arm_chairs",
  "seats_school_desks",
  "seats_two_seater_desks",
  "toilet_bowls_functional",
  "teacher_count_override",
  "classroom_count_override",
];

function toFormState(reference: KpiReference | null): FormState {
  const state: FormState = { notes: reference?.notes ?? "" };
  NUMERIC_FIELDS.forEach((key) => {
    const value = reference?.[key];
    state[key as string] = typeof value === "number" ? String(value) : "";
  });
  return state;
}

/** Empty stays NULL — "not yet entered" must not collapse into zero. */
function toNumberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

interface KpiReferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null = the division-wide row. */
  schoolId: string | null;
  schoolYear: string;
  reference: KpiReference | null;
  userId: string | undefined;
  onSaved: () => void;
}

export function KpiReferenceDialog({
  open,
  onOpenChange,
  schoolId,
  schoolYear,
  reference,
  userId,
  onSaved,
}: KpiReferenceDialogProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(reference));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(toFormState(reference));
  }, [open, reference]);

  const update = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Live seat total, so the ×2 multipliers on desks are visible while typing.
  const previewSeats = seatTotal({
    seats_kindergarten: toNumberOrNull(form.seats_kindergarten ?? ""),
    seats_arm_chairs: toNumberOrNull(form.seats_arm_chairs ?? ""),
    seats_school_desks: toNumberOrNull(form.seats_school_desks ?? ""),
    seats_two_seater_desks: toNumberOrNull(form.seats_two_seater_desks ?? ""),
  } as KpiReference);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, number | string | null> = {
        notes: form.notes?.trim() ? form.notes.trim() : null,
        updated_by_user_id: userId ? Number(userId) : null,
      };
      NUMERIC_FIELDS.forEach((key) => {
        payload[key as string] = toNumberOrNull(form[key as string] ?? "");
      });

      if (reference) {
        const { error } = await supabase
          .from("sms_kpi_reference")
          .update(payload)
          .eq("id", Number(reference.id));
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sms_kpi_reference").insert({
          ...payload,
          school_id: schoolId === null ? null : Number(schoolId),
          school_year: schoolYear,
        });
        if (error) throw error;
      }

      toast.success("Reference data saved");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("Error saving KPI reference data:", err);
      toast.error("Failed to save reference data");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Reference Data — {schoolId === null ? "Division-wide" : "School"}, SY{" "}
            {schoolYear}
          </DialogTitle>
          <DialogDescription>
            Figures the system cannot derive. Population comes from the PSA
            projections; seats and toilet bowls come from the physical
            inventory. Leave a field blank if it is unknown — the indicators
            that need it will read “—” rather than zero.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">
                PSA projected population by official school age
              </h3>
              <p className="text-xs text-muted-foreground">
                Denominators for GER, NER, GIR and NIR.
                {schoolId !== null && (
                  <>
                    {" "}
                    PSA publishes these per division; a school-level figure is
                    the catchment estimate and is indicative only.
                  </>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {POPULATION_KEYS.map((key) => (
                <div key={key}>
                  <label className="text-xs font-medium mb-1 block">
                    {KPI_POPULATION_LABELS[key]}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form[key] ?? ""}
                    onChange={(e) => update(key, e.target.value)}
                    className="h-9"
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Seat inventory</h3>
              <p className="text-xs text-muted-foreground">
                Total seats = kindergarten seats + arm chairs + (school desks ×
                2) + (2-seater desks × 2).
                {previewSeats !== null && (
                  <>
                    {" "}
                    Current total:{" "}
                    <span className="font-medium text-foreground">
                      {previewSeats.toLocaleString()} seats
                    </span>
                    .
                  </>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {SEAT_FIELDS.map((field) => (
                <div key={String(field.key)}>
                  <label className="text-xs font-medium mb-1 block">
                    {field.label}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form[field.key as string] ?? ""}
                    onChange={(e) =>
                      update(field.key as string, e.target.value)
                    }
                    className="h-9"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {field.hint}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Facilities and overrides</h3>
              <p className="text-xs text-muted-foreground">
                Teachers and classrooms are counted from Staff and Rooms. Fill
                an override only to reconcile against an official release.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">
                  Functional toilet bowls
                </label>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.toilet_bowls_functional ?? ""}
                  onChange={(e) =>
                    update("toilet_bowls_functional", e.target.value)
                  }
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">
                  Teacher count override
                </label>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.teacher_count_override ?? ""}
                  onChange={(e) =>
                    update("teacher_count_override", e.target.value)
                  }
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">
                  Classroom count override
                </label>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.classroom_count_override ?? ""}
                  onChange={(e) =>
                    update("classroom_count_override", e.target.value)
                  }
                  className="h-9"
                />
              </div>
            </div>
          </section>

          <section>
            <label className="text-xs font-medium mb-1 block">Notes</label>
            <Textarea
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Source of the population figures, date of the inventory, etc."
            />
          </section>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
