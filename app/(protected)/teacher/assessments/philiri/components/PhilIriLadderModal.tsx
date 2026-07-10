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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getGradeLevelLabel,
  isPhilIriScreeningEnrichment,
  philIriGstConfig,
  philIriIndividualFormCode,
  philIriScreeningRemark,
  philIriSuggestedStartGrade,
  PHILIRI_COMPREHENSION_QUESTIONS,
} from "@/lib/constants";
import { generatePhilIriIndividual } from "@/lib/pdf/generatePhilIriIndividual";
import { generatePhilIriIndividualSummary } from "@/lib/pdf/generatePhilIriIndividualSummary";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import { PhilIriMaterial, PhilIriRecord, Student } from "@/types";
import { Download, Loader2, Pencil, Printer, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { deriveFinalProfile, screeningLevelBadgeClass } from "../philiriUtils";
import {
  emptyAnswers,
  emptyMiscues,
  emptyPassageValue,
  PassageFormValue,
  passageComputed,
  PhilIriPassageFields,
  totalSecondsOf,
} from "./PhilIriPassageFields";

interface LadderRead {
  recordId: string;
  material: PhilIriMaterial;
  value: PassageFormValue;
  overallLevel: string | null;
  wordReadingLevel: string | null;
  comprehensionLevel: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  student: Student;
  sectionId: number;
  sectionName: string;
  sectionGrade: number;
  schoolId: number;
  teacherId: number;
  teacherName: string;
  language: string;
  phase: string;
  schoolYear: string;
  gstTotal: number | null;
  screeningResult: string | null;
  locked: boolean;
}

function valueFromRecord(rec: PhilIriRecord): PassageFormValue {
  const total = rec.reading_time_seconds;
  return {
    minutes: total !== null && total !== undefined ? Math.floor(total / 60) : null,
    seconds: total !== null && total !== undefined ? total % 60 : null,
    comprehensionRaw:
      rec.comprehension_raw === null ? null : Number(rec.comprehension_raw),
    answers: { ...emptyAnswers(), ...(rec.comprehension_answers || {}) },
    miscues: {
      ...emptyMiscues(),
      ...Object.fromEntries(
        Object.entries(rec.miscue_counts || {}).map(([k, v]) => [k, Number(v)]),
      ),
    },
    dateAssessed: rec.date_assessed ?? "",
    remarks: rec.remarks ?? "",
  };
}

export function PhilIriLadderModal({
  isOpen,
  onClose,
  onSaved,
  student,
  sectionId,
  sectionName,
  sectionGrade,
  schoolId,
  teacherId,
  teacherName,
  language,
  phase,
  schoolYear,
  gstTotal,
  screeningResult,
  locked,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reads, setReads] = useState<LadderRead[]>([]);
  const [addOptions, setAddOptions] = useState<PhilIriMaterial[]>([]);
  const [editing, setEditing] = useState<{
    material: PhilIriMaterial;
    recordId: string | null;
    value: PassageFormValue;
  } | null>(null);

  const passed = isPhilIriScreeningEnrichment(screeningResult);
  const gstRemark = philIriScreeningRemark(gstTotal, sectionGrade);

  const load = useCallback(async () => {
    setLoading(true);
    setEditing(null);

    // Materials available for the individual test: this language, active, at or
    // below the learner's grade (they read down-grade passages).
    const { data: mats } = await supabase
      .from("sms_philiri_materials")
      .select("*")
      .eq("language", language)
      .eq("is_active", true)
      .lte("grade_level", sectionGrade)
      .order("grade_level")
      .order("set_label");
    const addList = (mats || []) as PhilIriMaterial[];

    // Existing individual records for this learner / phase / SY.
    const { data: recs } = await supabase
      .from("sms_philiri_records")
      .select("*")
      .eq("student_id", student.id)
      .eq("phase", phase)
      .eq("school_year", schoolYear)
      .eq("form_type", "individual");
    const records = (recs || []) as PhilIriRecord[];

    // Resolve the material for each record (may be a grade filtered out above).
    const byId: Record<string, PhilIriMaterial> = {};
    addList.forEach((m) => (byId[String(m.id)] = m));
    const missingIds = records
      .map((r) => String(r.material_id))
      .filter((id) => !byId[id]);
    if (missingIds.length > 0) {
      const { data: extra } = await supabase
        .from("sms_philiri_materials")
        .select("*")
        .in("id", missingIds);
      (extra || []).forEach((m) => (byId[String(m.id)] = m as PhilIriMaterial));
    }

    const built: LadderRead[] = records
      .map((r) => {
        const material = byId[String(r.material_id)];
        if (!material) return null;
        return {
          recordId: String(r.id),
          material,
          value: valueFromRecord(r),
          overallLevel: r.overall_reading_level,
          wordReadingLevel: r.word_reading_level,
          comprehensionLevel: r.comprehension_level,
        } as LadderRead;
      })
      .filter((x): x is LadderRead => x !== null)
      .sort((a, b) => a.material.grade_level - b.material.grade_level);

    setAddOptions(addList);
    setReads(built);
    setLoading(false);
  }, [language, sectionGrade, student.id, phase, schoolYear]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const finalProfile = deriveFinalProfile(
    reads.map((r) => ({
      grade: r.material.grade_level,
      overallLevel: (r.overallLevel as never) ?? null,
    })),
  );

  const minAvailableGrade =
    addOptions.length > 0
      ? Math.min(...addOptions.map((m) => m.grade_level))
      : 3;
  const suggestedStart = philIriSuggestedStartGrade(
    sectionGrade,
    gstTotal,
    minAvailableGrade,
  );

  // Materials not yet read, for the "add passage" picker.
  const readMaterialIds = new Set(reads.map((r) => String(r.material.id)));
  const unreadOptions = addOptions.filter(
    (m) => !readMaterialIds.has(String(m.id)),
  );

  const openNew = (materialId: string) => {
    const material = addOptions.find((m) => String(m.id) === materialId);
    if (!material) return;
    const existing = reads.find((r) => String(r.material.id) === materialId);
    setEditing({
      material,
      recordId: existing?.recordId ?? null,
      value: existing ? existing.value : emptyPassageValue(),
    });
  };

  const openEdit = (read: LadderRead) =>
    setEditing({
      material: read.material,
      recordId: read.recordId,
      value: read.value,
    });

  const saveEditing = async () => {
    if (!editing || saving || locked) return;
    setSaving(true);
    try {
      const { material, value } = editing;
      const computed = passageComputed(material, value);
      const numericMiscues = Object.fromEntries(
        Object.entries(value.miscues).filter(([, v]) => typeof v === "number"),
      );
      const nonEmptyAnswers = Object.fromEntries(
        Object.entries(value.answers).filter(([, v]) => v.trim() !== ""),
      );
      const payload = {
        material_id: Number(material.id),
        school_id: schoolId,
        section_id: sectionId,
        student_id: Number(student.id),
        teacher_id: teacherId,
        phase,
        school_year: schoolYear,
        form_type: "individual",
        reading_time_seconds: totalSecondsOf(value),
        reading_rate: computed.readingRate,
        comprehension_raw: value.comprehensionRaw,
        comprehension_total: PHILIRI_COMPREHENSION_QUESTIONS,
        comprehension_answers:
          Object.keys(nonEmptyAnswers).length > 0 ? nonEmptyAnswers : null,
        comprehension_score: computed.comprehensionScore,
        comprehension_level: computed.comprehensionLevel,
        miscue_counts:
          Object.keys(numericMiscues).length > 0 ? numericMiscues : null,
        miscues: computed.totalMiscues,
        word_reading_score: computed.wordReadingScore,
        word_reading_level: computed.wordReadingLevel,
        overall_reading_level: computed.overallReadingLevel,
        date_assessed: value.dateAssessed || null,
        remarks: value.remarks.trim() || null,
      };
      const { error } = await supabase
        .from("sms_philiri_records")
        .upsert(payload, {
          onConflict: "material_id,student_id,phase,school_year,form_type",
        });
      if (error) throw new Error(error.message);
      toast.success("Passage read saved!");
      await load();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const deleteRead = async (read: LadderRead) => {
    if (locked) return;
    const { error } = await supabase
      .from("sms_philiri_records")
      .delete()
      .eq("id", read.recordId);
    if (error) {
      toast.error("Failed to delete.");
      return;
    }
    toast.success("Passage read removed.");
    await load();
    onSaved();
  };

  const printRead = (read: LadderRead) =>
    generatePhilIriIndividual({
      schoolId,
      schoolName: "",
      material: read.material,
      student,
      sectionName,
      teacherName,
      phase,
      readingTimeSeconds: totalSecondsOf(read.value),
      comprehensionRaw: read.value.comprehensionRaw,
      comprehensionAnswers: read.value.answers,
      miscueCounts: read.value.miscues,
      dateAssessed: read.value.dateAssessed || null,
      remarks: read.value.remarks || null,
    }).catch(() => toast.error("Failed to generate the form."));

  const printSummary = () =>
    generatePhilIriIndividualSummary({
      schoolId,
      student,
      sectionName,
      sectionGrade,
      teacherName,
      language,
      phase,
      gstTotal,
      finalProfileLabel: finalProfile.label,
      reads: reads.map((r) => {
        const c = passageComputed(r.material, r.value);
        return {
          grade: r.material.grade_level,
          title: r.material.title,
          wordReadingScore: c.wordReadingScore,
          wordReadingLevel: c.wordReadingLevel,
          comprehensionScore: c.comprehensionScore,
          comprehensionLevel: c.comprehensionLevel,
          overallLevel: c.overallReadingLevel,
        };
      }),
    }).catch(() => toast.error("Failed to generate the summary."));

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-[760px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {philIriIndividualFormCode(language)} — {student.last_name},{" "}
            {student.first_name}
          </DialogTitle>
          <DialogDescription>
            {sectionName} · {language} ·{" "}
            <span className="font-mono">{formatLrn(student.lrn)}</span>
          </DialogDescription>
        </DialogHeader>

        {/* GST screening result — the starting point for the individual test */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <span className="font-medium">
            GST:{" "}
            {gstTotal === null
              ? "—"
              : `${gstTotal}/${philIriGstConfig(sectionGrade).totalMax}`}
          </span>
          {screeningResult && (
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${screeningLevelBadgeClass(screeningResult)}`}
            >
              {screeningResult}
            </span>
          )}
          {gstRemark && (
            <span className="text-muted-foreground">
              Recommendation:{" "}
              <span className="font-medium text-foreground">{gstRemark}</span>
            </span>
          )}
          {!passed && (
            <span className="text-muted-foreground">
              · Suggested start: {getGradeLevelLabel(suggestedStart)}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Reading history — each recorded passage read, lowest grade first */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Reading history</p>
              <span className="text-xs text-muted-foreground">
                {reads.length} {reads.length === 1 ? "passage" : "passages"}{" "}
                recorded
              </span>
            </div>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/60">
                    <th className="px-3 py-1.5 text-left">Passage</th>
                    <th className="px-2 py-1.5 text-center w-24">Word Reading</th>
                    <th className="px-2 py-1.5 text-center w-24">Comprehension</th>
                    <th className="px-2 py-1.5 text-center w-24">Overall</th>
                    <th className="px-2 py-1.5 text-center w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reads.map((r) => (
                    <tr key={r.recordId} className="border-t">
                      <td className="px-3 py-1.5">
                        <span className="font-medium">
                          {getGradeLevelLabel(r.material.grade_level)}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          · {r.material.title}
                          {r.material.set_label ? ` (${r.material.set_label})` : ""}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center text-xs">
                        {r.wordReadingLevel ?? "-"}
                      </td>
                      <td className="px-2 py-1.5 text-center text-xs">
                        {r.comprehensionLevel ?? "-"}
                      </td>
                      <td className="px-2 py-1.5 text-center text-xs font-semibold">
                        {r.overallLevel ?? "-"}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openEdit(r)}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => printRead(r)}
                            title="Print form"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteRead(r)}
                            disabled={locked}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {reads.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-4 text-center text-muted-foreground"
                      >
                        No passage reads yet. Start at the suggested grade below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Final profile + stop rule */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                Final profile: {finalProfile.label}
              </span>
              <span className="text-xs text-muted-foreground">
                Continue upward until the learner reaches Frustration; the highest
                Instructional grade is the reading level.
              </span>
            </div>

            {/* Add-read picker */}
            {!editing && !locked && (
              <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                <div className="min-w-64">
                  <Label className="mb-1 block text-xs">Add a passage read</Label>
                  <Select value="" onValueChange={openNew}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a graded passage…" />
                    </SelectTrigger>
                    <SelectContent>
                      {unreadOptions.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {getGradeLevelLabel(m.grade_level)} · {m.title}
                          {m.set_label ? ` (${m.set_label})` : ""}
                        </SelectItem>
                      ))}
                      {unreadOptions.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          All available passages have been read.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Active read editor */}
            {editing && (
              <div className="rounded-md border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">
                    {getGradeLevelLabel(editing.material.grade_level)} ·{" "}
                    {editing.material.title}
                    {editing.material.set_label
                      ? ` (${editing.material.set_label})`
                      : ""}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {editing.material.word_count} words
                    </span>
                  </p>
                  <div className="flex items-center gap-1">
                    {editing.material.file_url && (
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={editing.material.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                        >
                          <Download className="h-3.5 w-3.5 mr-1" /> Passage
                        </a>
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setEditing(null)}
                      disabled={saving}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <PhilIriPassageFields
                  material={editing.material}
                  value={editing.value}
                  disabled={saving || locked}
                  onChange={(patch) =>
                    setEditing((prev) =>
                      prev ? { ...prev, value: { ...prev.value, ...patch } } : prev,
                    )
                  }
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setEditing(null)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={saveEditing}
                    disabled={saving || locked}
                    className="min-w-[110px]"
                  >
                    {saving ? "Saving…" : "Save read"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 gap-2 border-t bg-background px-6 py-4 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={printSummary}
            disabled={reads.length === 0}
          >
            <Printer className="h-4 w-4 mr-1" /> Print summary
          </Button>
          <Button type="button" onClick={onClose} disabled={saving}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
