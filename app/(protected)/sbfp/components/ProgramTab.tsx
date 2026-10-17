"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SBFP_CONTACT_KIND_LABELS,
  SBFP_WEIGHING_PERIODS,
  type SbfpContactKind,
} from "@/lib/constants/sbfp";
import {
  deleteContact,
  fetchContacts,
  fetchSchoolHeader,
  fetchSchoolStaff,
  saveContact,
  saveProgram,
  WEIGHING_DATE_FIELD,
  type SbfpContact,
  type SbfpProgram,
  type SbfpProgramInput,
} from "@/lib/sbfp/queries";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import type { SbfpTabProps } from "./types";

const NONE = "__none__";

const LAST_MILE_OPTIONS = [
  { value: NONE, label: "Not stated" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

type ContactDraft = Omit<SbfpContact, "id" | "program_id"> & { id?: string };

const emptyContact = (kind: SbfpContactKind, order: number): ContactDraft => ({
  kind,
  sort_order: order,
  name: "",
  designation: "",
  tel_no: "",
  mobile_no: "",
  email: "",
});

export function ProgramTab({
  schoolId,
  schoolYear,
  program,
  canManage,
  actorId,
  canAssignFocal,
  onSaved,
}: SbfpTabProps & {
  /** The focal person manages the programme but may not hand the role on (209). */
  canAssignFocal: boolean;
  onSaved: (p: SbfpProgram) => void;
}) {
  const [form, setForm] = useState<SbfpProgramInput | null>(null);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [contacts, setContacts] = useState<ContactDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [header, people] = await Promise.all([
          fetchSchoolHeader(schoolId),
          fetchSchoolStaff(schoolId),
        ]);
        if (!isMounted) return;
        setStaff(people);
        // A new programme opens prefilled from the school record; a saved one
        // shows exactly what it prints.
        setForm(
          program ?? {
            school_id: schoolId,
            school_year: schoolYear,
            region: header.region,
            division_name: null,
            district: header.district,
            municipality_barangay:
              [header.municipality_city, header.barangay].filter(Boolean).join(" / ") || null,
            focal_person_id: null,
            focal_person_name: null,
            feeding_start_date: null,
            feeding_end_date: null,
            baseline_weighing_date: null,
            midline_weighing_date: null,
            endline_weighing_date: null,
            is_last_mile_school: null,
          },
        );
        setContacts(program ? await fetchContacts(program.id) : []);
      } catch (err) {
        console.error("Error loading SBFP programme header:", err);
        toast.error("Failed to load programme details");
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [schoolId, schoolYear, program]);

  if (!form) return null;
  const readOnly = !canManage;
  const set = <K extends keyof SbfpProgramInput>(key: K, value: SbfpProgramInput[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const handleSave = async () => {
    if (
      form.feeding_start_date &&
      form.feeding_end_date &&
      form.feeding_end_date < form.feeding_start_date
    ) {
      toast.error("The end of feeding cannot be before its start");
      return;
    }
    const [b, m, e] = [
      form.baseline_weighing_date,
      form.midline_weighing_date,
      form.endline_weighing_date,
    ];
    if ((b && m && m < b) || (m && e && e < m) || (b && e && e < b)) {
      toast.error("Weighing dates must run baseline, then midline, then endline");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveProgram(form, program?.id ?? null, actorId);
      // Form 4: write each named contact, drop the ones removed on screen.
      const kept = contacts.filter((c) => c.name.trim());
      const before = program ? await fetchContacts(program.id) : [];
      for (const c of before) {
        if (!kept.some((k) => k.id === c.id)) await deleteContact(c.id);
      }
      for (const c of kept) {
        await saveContact({ ...c, program_id: saved.id });
      }
      setContacts(await fetchContacts(saved.id));
      onSaved(saved);
      toast.success(program ? "Programme saved" : "Programme opened");
    } catch (err) {
      console.error("Error saving SBFP programme:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const contactRows = (kind: SbfpContactKind) =>
    contacts
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => c.kind === kind);

  const updateContact = (index: number, patch: Partial<ContactDraft>) =>
    setContacts((cs) => cs.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-4">
      {!program && (
        <p className="text-sm text-muted-foreground">
          {canManage
            ? `No feeding programme is open for SY ${schoolYear}. Check the details below and open it.`
            : `No feeding programme has been opened for SY ${schoolYear} yet. The school head, admin or school nurse opens it.`}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Form header</CardTitle>
          <CardDescription>
            Printed at the top of every SBFP form. The focal person may manage the
            programme alongside the school head, admin and school nurse.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Region</Label>
            <Input
              value={form.region ?? ""}
              disabled={readOnly}
              onChange={(e) => set("region", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Schools Division Office</Label>
            <Input
              value={form.division_name ?? ""}
              placeholder="e.g. Schools Division of Bayugan City"
              disabled={readOnly}
              onChange={(e) => set("division_name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>District</Label>
            <Input
              value={form.district ?? ""}
              disabled={readOnly}
              onChange={(e) => set("district", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>City / Municipality / Barangay</Label>
            <Input
              value={form.municipality_barangay ?? ""}
              disabled={readOnly}
              onChange={(e) => set("municipality_barangay", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Feeding focal person</Label>
            <Select
              value={form.focal_person_id ?? NONE}
              disabled={readOnly || !canAssignFocal}
              onValueChange={(v) => {
                const person = staff.find((s) => s.id === v);
                set("focal_person_id", v === NONE ? null : v);
                set("focal_person_name", person?.name ?? null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None designated</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Last Mile School</Label>
            <Select
              value={
                form.is_last_mile_school == null
                  ? NONE
                  : form.is_last_mile_school
                    ? "yes"
                    : "no"
              }
              disabled={readOnly}
              onValueChange={(v) =>
                set("is_last_mile_school", v === NONE ? null : v === "yes")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAST_MILE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Start of feeding</Label>
            <Input
              type="date"
              value={form.feeding_start_date ?? ""}
              disabled={readOnly}
              onChange={(e) => set("feeding_start_date", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>End of feeding</Label>
            <Input
              type="date"
              value={form.feeding_end_date ?? ""}
              disabled={readOnly}
              onChange={(e) => set("feeding_end_date", e.target.value || null)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weighing dates</CardTitle>
          <CardDescription>
            The programme weighs its beneficiaries three times. Each date is the
            default on the Weighing tab; every learner&apos;s row keeps its own
            date, so a learner weighed on another day is recorded as such.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {SBFP_WEIGHING_PERIODS.map((p) => (
            <div key={p.value} className="space-y-1.5">
              <Label>{p.label} weighing</Label>
              <Input
                type="date"
                value={form[WEIGHING_DATE_FIELD[p.value]] ?? ""}
                disabled={readOnly}
                onChange={(e) => set(WEIGHING_DATE_FIELD[p.value], e.target.value || null)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {(["consignee", "inspection"] as const).map((kind) => (
        <Card key={kind}>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">
                {SBFP_CONTACT_KIND_LABELS[kind]} (Form 4)
              </CardTitle>
              <CardDescription>
                {kind === "consignee"
                  ? "Only authorized consignees are allowed to receive the goods."
                  : "The team that inspects deliveries on receipt."}
              </CardDescription>
            </div>
            {!readOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setContacts((cs) => [
                    ...cs,
                    emptyContact(kind, contactRows(kind).length + 1),
                  ])
                }
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {contactRows(kind).length === 0 && (
              <p className="text-sm text-muted-foreground">None listed.</p>
            )}
            {contactRows(kind).map(({ c, index }) => (
              <div key={index} className="grid gap-2 md:grid-cols-[2fr_2fr_1fr_1fr_2fr_auto]">
                <Input
                  placeholder="Name"
                  value={c.name}
                  disabled={readOnly}
                  onChange={(e) => updateContact(index, { name: e.target.value })}
                />
                <Input
                  placeholder="Designation"
                  value={c.designation ?? ""}
                  disabled={readOnly}
                  onChange={(e) => updateContact(index, { designation: e.target.value })}
                />
                <Input
                  placeholder="Tel. no."
                  value={c.tel_no ?? ""}
                  disabled={readOnly}
                  onChange={(e) => updateContact(index, { tel_no: e.target.value })}
                />
                <Input
                  placeholder="Mobile no."
                  value={c.mobile_no ?? ""}
                  disabled={readOnly}
                  onChange={(e) => updateContact(index, { mobile_no: e.target.value })}
                />
                <Input
                  placeholder="Email"
                  type="email"
                  value={c.email ?? ""}
                  disabled={readOnly}
                  onChange={(e) => updateContact(index, { email: e.target.value })}
                />
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove"
                    onClick={() => setContacts((cs) => cs.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {program ? "Save" : "Open programme"}
          </Button>
        </div>
      )}
    </div>
  );
}
