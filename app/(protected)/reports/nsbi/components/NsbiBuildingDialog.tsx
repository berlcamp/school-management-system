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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NSBI_BUILDING_CONDITIONS,
  NSBI_BUILDING_MATERIALS,
  NSBI_BUILDING_TYPES,
  NSBI_CLASSIFICATIONS,
  NSBI_FUND_SOURCES,
  NSBI_SPECIFIC_FUND_SOURCES,
} from "@/lib/constants/nsbi";
import type {
  NsbiBuildingCondition,
  NsbiBuildingMaterial,
  NsbiClassification,
  NsbiFundSource,
} from "@/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BuildingDraft, TRISTATE_UNSET } from "./drafts";
import { FieldLabel, NumberField, TristateField } from "./NsbiFields";

/**
 * One building: NSBI Table 1 (Cols. 1–18) and that building's Table 4A water
 * and sanitation counts, together in one modal because that is how a school
 * head walks the campus — one building at a time, not one column at a time.
 *
 * The modal edits a LOCAL COPY and only hands it back on Save, so backing out
 * of a half-typed building leaves the return exactly as it was. Saving here
 * still only touches screen state; the page's Save draft is what writes.
 */

interface Props {
  open: boolean;
  /** The row being edited, or a blank draft when adding. */
  draft: BuildingDraft | null;
  /** 1-based position on the form, for the title. Null while adding. */
  index: number | null;
  /** Rooms encoded under this building on the Rooms tab. */
  roomCount: number;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: BuildingDraft) => void;
  disabled: boolean;
}

export function NsbiBuildingDialog({
  open,
  draft,
  index,
  roomCount,
  onOpenChange,
  onSubmit,
  disabled,
}: Props) {
  const [local, setLocal] = useState<BuildingDraft | null>(draft);

  // Re-seed whenever a different row is opened. Editing a row, closing without
  // saving and reopening it must show what is stored, not the abandoned edits.
  useEffect(() => {
    if (open) setLocal(draft);
  }, [open, draft]);

  if (!local) return null;

  const p = `b${local.key}__`;
  const set = (patch: Partial<BuildingDraft>) =>
    setLocal((prev) => (prev ? { ...prev, ...patch } : prev));

  // Col. 2's list is filtered by Col. 3: picking "LGU Funded" should not leave
  // the school head scrolling past 150 national types. With no fund source
  // chosen yet, every group is offered.
  const typeGroups =
    local.fund_sources.length > 0
      ? local.fund_sources.flatMap((f) => NSBI_BUILDING_TYPES[f] ?? [])
      : (Object.keys(NSBI_BUILDING_TYPES) as NsbiFundSource[]).flatMap(
          (f) => NSBI_BUILDING_TYPES[f],
        );

  const toggleFundSource = (value: NsbiFundSource, checked: boolean) =>
    set({
      fund_sources: checked
        ? [...local.fund_sources, value]
        : local.fund_sources.filter((f) => f !== value),
    });

  const toggleMaterial = (value: NsbiBuildingMaterial, checked: boolean) =>
    set({
      building_materials: checked
        ? [...local.building_materials, value]
        : local.building_materials.filter((m) => m !== value),
    });

  const declaredRooms = local.room_count.trim();
  const roomsDisagree =
    declaredRooms !== "" && Number(declaredRooms) !== roomCount;

  const handleSubmit = () => {
    if (!local.building_name.trim()) {
      toast.error("Every building needs a name or number (Col. 1).");
      return;
    }
    onSubmit({ ...local, building_name: local.building_name.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {index === null
              ? "Add building"
              : `Edit building #${index + 1}${
                  local.building_name ? ` — ${local.building_name}` : ""
                }`}
          </DialogTitle>
          <DialogDescription>
            Table 1 (Cols. 1–18) and this building&rsquo;s Table 4A water and
            sanitation counts. A blank number means &ldquo;not counted&rdquo;,
            which on a signed form is not the same as zero.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ---- Col. 1 ---- */}
          <div className="space-y-1">
            <FieldLabel
              htmlFor={`${p}building_name`}
              text="Building Name or Number (Col. 1)"
            />
            <Input
              id={`${p}building_name`}
              placeholder="Building name or number"
              className="h-9 max-w-md font-medium"
              value={local.building_name}
              onChange={(e) => set({ building_name: e.target.value })}
              disabled={disabled}
            />
          </div>

          {/* ---- Cols. 3–4: fund sources ---- */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Fund Source/s (Col. 3)</Label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {NSBI_FUND_SOURCES.map((f) => (
                  <label
                    key={f.value}
                    className="flex items-start gap-2 text-xs"
                  >
                    <Checkbox
                      checked={local.fund_sources.includes(f.value)}
                      onChange={(e) =>
                        toggleFundSource(f.value, e.target.checked)
                      }
                      disabled={disabled}
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <FieldLabel
                  htmlFor={`${p}building_type`}
                  text="Building Type (Col. 2)"
                />
                <Select
                  value={local.building_type || TRISTATE_UNSET}
                  onValueChange={(v) =>
                    set({ building_type: v === TRISTATE_UNSET ? "" : v })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger id={`${p}building_type`} className="h-9">
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={TRISTATE_UNSET}>—</SelectItem>
                    {typeGroups.map((g) => (
                      <SelectGroup key={g.group}>
                        <SelectLabel>{g.group}</SelectLabel>
                        {g.options.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                            {o.year ? ` (${o.year})` : ""}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`${p}specific_fund_source`} className="text-xs">
                  Specific Fund Source/s (Col. 4)
                </Label>
                <Select
                  value={local.specific_fund_source || TRISTATE_UNSET}
                  onValueChange={(v) =>
                    set({
                      specific_fund_source: v === TRISTATE_UNSET ? "" : v,
                    })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger
                    id={`${p}specific_fund_source`}
                    className="h-9"
                  >
                    <SelectValue placeholder="Select a source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TRISTATE_UNSET}>—</SelectItem>
                    {NSBI_SPECIFIC_FUND_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ---- Cols. 5–8 ---- */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1 sm:col-span-2">
              <FieldLabel
                htmlFor={`${p}condition`}
                text="Building Condition (Col. 5)"
              />
              <Select
                value={local.condition || TRISTATE_UNSET}
                onValueChange={(v) =>
                  set({
                    condition:
                      v === TRISTATE_UNSET ? "" : (v as NsbiBuildingCondition),
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger id={`${p}condition`} className="h-9">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TRISTATE_UNSET}>—</SelectItem>
                  {NSBI_BUILDING_CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <NumberField
              id={`${p}storeys`}
              label="No. of Storeys (Col. 6)"
              value={local.storeys}
              onChange={(v) => set({ storeys: v })}
              disabled={disabled}
            />
            <div className="space-y-1">
              <NumberField
                id={`${p}room_count`}
                label="No. of Rooms (Col. 7)"
                value={local.room_count}
                onChange={(v) => set({ room_count: v })}
                disabled={disabled}
              />
              {roomsDisagree ? (
                <p className="text-[0.7rem] text-destructive">
                  {roomCount} room{roomCount === 1 ? "" : "s"} encoded on the
                  Rooms tab.
                </p>
              ) : null}
            </div>
            <NumberField
              id={`${p}year_completed`}
              label="Year Completed (Col. 8)"
              value={local.year_completed}
              onChange={(v) => set({ year_completed: v })}
              disabled={disabled}
            />
          </div>

          {/* ---- Cols. 9–13 ---- */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <FieldLabel
                htmlFor={`${p}classification`}
                text="Classification (Col. 9)"
              />
              <Select
                value={local.classification || TRISTATE_UNSET}
                onValueChange={(v) =>
                  set({
                    classification:
                      v === TRISTATE_UNSET ? "" : (v as NsbiClassification),
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger id={`${p}classification`} className="h-9">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TRISTATE_UNSET}>—</SelectItem>
                  {NSBI_CLASSIFICATIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TristateField
              id={`${p}pwd_accessible`}
              label="PWD accessible? (Col. 10)"
              value={local.pwd_accessible}
              onChange={(v) => set({ pwd_accessible: v })}
              disabled={disabled}
            />
            <TristateField
              id={`${p}major_repair_last_5y`}
              label="Major repair, last 5 yrs? (Col. 11)"
              value={local.major_repair_last_5y}
              onChange={(v) => set({ major_repair_last_5y: v })}
              disabled={disabled}
            />
            <TristateField
              id={`${p}has_certificate_of_acceptance`}
              label="Cert. of Acceptance? (Col. 12)"
              value={local.has_certificate_of_acceptance}
              onChange={(v) => set({ has_certificate_of_acceptance: v })}
              disabled={disabled}
            />
            <TristateField
              id={`${p}in_deped_book_of_accounts`}
              label="In Book of Accounts? (Col. 13)"
              value={local.in_deped_book_of_accounts}
              onChange={(v) => set({ in_deped_book_of_accounts: v })}
              disabled={disabled}
            />
          </div>

          {/* ---- Cols. 14–17 ---- */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Building Materials (Col. 14)</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {NSBI_BUILDING_MATERIALS.map((m) => (
                  <label
                    key={m.value}
                    className="flex items-center gap-2 text-xs"
                  >
                    <Checkbox
                      checked={local.building_materials.includes(m.value)}
                      onChange={(e) => toggleMaterial(m.value, e.target.checked)}
                      disabled={disabled}
                    />
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <FieldLabel
                  htmlFor={`${p}date_of_acquisition`}
                  text="Date of Acquisition (Col. 15)"
                />
                <Input
                  id={`${p}date_of_acquisition`}
                  type="date"
                  className="h-9"
                  value={local.date_of_acquisition}
                  onChange={(e) => set({ date_of_acquisition: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <NumberField
                id={`${p}acquisition_cost`}
                label="Acquisition Cost (Col. 16)"
                value={local.acquisition_cost}
                onChange={(v) => set({ acquisition_cost: v })}
                disabled={disabled}
                step="0.01"
              />
              <NumberField
                id={`${p}book_value`}
                label="Book Value (Col. 17)"
                value={local.book_value}
                onChange={(v) => set({ book_value: v })}
                disabled={disabled}
                step="0.01"
              />
            </div>
          </div>

          <div className="space-y-1">
            <FieldLabel
              htmlFor={`${p}insurance_info`}
              text="Insurance Information (Col. 18)"
            />
            <Input
              id={`${p}insurance_info`}
              className="h-9"
              placeholder="Current insurance policy — state if none"
              value={local.insurance_info}
              onChange={(e) => set({ insurance_info: e.target.value })}
              disabled={disabled}
            />
          </div>

          {/* ---- Table 4A: this building's water and sanitation ---- */}
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Table 4A · Water and Sanitation Facilities in this building
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <NumberField
                id={`${p}bowls_male`}
                label="Bowls — Male"
                value={local.bowls_male}
                onChange={(v) => set({ bowls_male: v })}
                disabled={disabled}
              />
              <NumberField
                id={`${p}bowls_female`}
                label="Bowls — Female"
                value={local.bowls_female}
                onChange={(v) => set({ bowls_female: v })}
                disabled={disabled}
              />
              <NumberField
                id={`${p}bowls_pwd`}
                label="Bowls — PWD"
                value={local.bowls_pwd}
                onChange={(v) => set({ bowls_pwd: v })}
                disabled={disabled}
              />
              <NumberField
                id={`${p}bowls_shared`}
                label="Bowls — Shared"
                value={local.bowls_shared}
                onChange={(v) => set({ bowls_shared: v })}
                disabled={disabled}
              />
              <NumberField
                id={`${p}bowls_nonfunctional`}
                label="Non-functional bowls"
                value={local.bowls_nonfunctional}
                onChange={(v) => set({ bowls_nonfunctional: v })}
                disabled={disabled}
              />
              <NumberField
                id={`${p}washbasins`}
                label="Sink / Washbasin"
                value={local.washbasins}
                onChange={(v) => set({ washbasins: v })}
                disabled={disabled}
              />
              <NumberField
                id={`${p}urinals`}
                label="Urinals"
                value={local.urinals}
                onChange={(v) => set({ urinals: v })}
                disabled={disabled}
              />
              <NumberField
                id={`${p}urinal_troughs`}
                label="Urinal Trough"
                value={local.urinal_troughs}
                onChange={(v) => set({ urinal_troughs: v })}
                disabled={disabled}
              />
              <TristateField
                id={`${p}septic_tank`}
                label="With Septic Tank"
                value={local.septic_tank}
                onChange={(v) => set({ septic_tank: v })}
                disabled={disabled}
              />
              <NumberField
                id={`${p}faucets_with_water`}
                label="Faucets — with water"
                value={local.faucets_with_water}
                onChange={(v) => set({ faucets_with_water: v })}
                disabled={disabled}
              />
              <NumberField
                id={`${p}faucets_without_water`}
                label="Faucets — without water"
                value={local.faucets_without_water}
                onChange={(v) => set({ faucets_without_water: v })}
                disabled={disabled}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {disabled ? "Close" : "Cancel"}
          </Button>
          {!disabled ? (
            <Button type="button" onClick={handleSubmit}>
              {index === null ? "Add building" : "Apply"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
