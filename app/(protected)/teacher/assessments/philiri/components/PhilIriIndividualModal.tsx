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
import { Label } from "@/components/ui/label";
import {
  philIriIndividualFormCode,
  PHILIRI_COMPREHENSION_QUESTIONS,
  PHILIRI_MISCUE_TYPES,
} from "@/lib/constants";
import { generatePhilIriIndividual } from "@/lib/pdf/generatePhilIriIndividual";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import { PhilIriMaterial, Student } from "@/types";
import { Loader2, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { computeIndividual } from "../philiriUtils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  student: Student | null;
  material: PhilIriMaterial;
  sectionId: number;
  sectionName: string;
  schoolId: number;
  teacherId: number;
  teacherName: string;
  phase: string;
  schoolYear: string;
  locked: boolean;
}

const emptyMiscues = (): Record<string, number | null> =>
  Object.fromEntries(PHILIRI_MISCUE_TYPES.map((m) => [m.key, null]));

const emptyAnswers = (): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: PHILIRI_COMPREHENSION_QUESTIONS }, (_, i) => [
      `q${i + 1}`,
      "",
    ]),
  );

export function PhilIriIndividualModal({
  isOpen,
  onClose,
  onSaved,
  student,
  material,
  sectionId,
  sectionName,
  schoolId,
  teacherId,
  teacherName,
  phase,
  schoolYear,
  locked,
}: Props) {
  const isFilipino = material.language === "Filipino";
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [minutes, setMinutes] = useState<number | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [comprehensionRaw, setComprehensionRaw] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>(emptyAnswers());
  const [miscues, setMiscues] = useState<Record<string, number | null>>(
    emptyMiscues(),
  );
  const [dateAssessed, setDateAssessed] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !student) return;
    const run = async () => {
      setLoading(true);
      // reset
      setMinutes(null);
      setSeconds(null);
      setComprehensionRaw(null);
      setAnswers(emptyAnswers());
      setMiscues(emptyMiscues());
      setDateAssessed("");
      setRemarks("");

      const { data } = await supabase
        .from("sms_philiri_records")
        .select("*")
        .eq("material_id", material.id)
        .eq("student_id", student.id)
        .eq("phase", phase)
        .eq("school_year", schoolYear)
        .eq("form_type", "individual")
        .maybeSingle();

      if (data) {
        const total = data.reading_time_seconds as number | null;
        if (total !== null && total !== undefined) {
          setMinutes(Math.floor(total / 60));
          setSeconds(total % 60);
        }
        setComprehensionRaw(
          data.comprehension_raw === null ? null : Number(data.comprehension_raw),
        );
        setAnswers({
          ...emptyAnswers(),
          ...((data.comprehension_answers as Record<string, string>) || {}),
        });
        const savedMiscues = (data.miscue_counts as Record<string, number>) || {};
        setMiscues({
          ...emptyMiscues(),
          ...Object.fromEntries(
            Object.entries(savedMiscues).map(([k, v]) => [k, Number(v)]),
          ),
        });
        setDateAssessed((data.date_assessed as string | null) ?? "");
        setRemarks((data.remarks as string | null) ?? "");
      }
      setLoading(false);
    };
    run();
  }, [isOpen, student, material.id, phase, schoolYear]);

  const totalSeconds =
    minutes === null && seconds === null
      ? null
      : (minutes ?? 0) * 60 + (seconds ?? 0);

  const computed = computeIndividual(
    Number(material.word_count),
    miscues,
    comprehensionRaw,
    PHILIRI_COMPREHENSION_QUESTIONS,
    totalSeconds,
  );

  const setMiscue = (key: string, value: string) =>
    setMiscues((prev) => ({
      ...prev,
      [key]: value === "" ? null : Math.max(0, Math.trunc(Number(value) || 0)),
    }));

  const onSubmit = async () => {
    if (!student || saving || locked) return;
    setSaving(true);
    try {
      const numericMiscues = Object.fromEntries(
        Object.entries(miscues).filter(([, v]) => typeof v === "number"),
      );
      const nonEmptyAnswers = Object.fromEntries(
        Object.entries(answers).filter(([, v]) => v.trim() !== ""),
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
        reading_time_seconds: totalSeconds,
        reading_rate: computed.readingRate,
        comprehension_raw: comprehensionRaw,
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
        date_assessed: dateAssessed || null,
        remarks: remarks.trim() || null,
      };
      const { error } = await supabase
        .from("sms_philiri_records")
        .upsert(payload, {
          onConflict: "material_id,student_id,phase,school_year,form_type",
        });
      if (error) throw new Error(error.message);
      toast.success("Individual record saved!");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const printForm = () => {
    if (!student) return;
    generatePhilIriIndividual({
      schoolId,
      schoolName: "",
      material,
      student,
      sectionName,
      teacherName,
      phase,
      readingTimeSeconds: totalSeconds,
      comprehensionRaw,
      comprehensionAnswers: answers,
      miscueCounts: miscues,
      dateAssessed: dateAssessed || null,
      remarks: remarks || null,
    }).catch(() => toast.error("Failed to generate the form."));
  };

  if (!student) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {philIriIndividualFormCode(material.language)} —{" "}
            {student.last_name}, {student.first_name}
          </DialogTitle>
          <DialogDescription>
            {material.title} · {material.language} · {material.word_count} words ·{" "}
            <span className="font-mono">{formatLrn(student.lrn)}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-6">
            {/* PART A — Comprehension */}
            <section className="space-y-3">
              <p className="text-sm font-semibold border-b pb-1">
                Part A — Comprehension
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <Label className="mb-1 block text-xs">Time — minutes</Label>
                  <Input
                    type="number"
                    min={0}
                    value={minutes === null ? "" : minutes}
                    disabled={locked}
                    onChange={(e) =>
                      setMinutes(
                        e.target.value === ""
                          ? null
                          : Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Time — seconds</Label>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={seconds === null ? "" : seconds}
                    disabled={locked}
                    onChange={(e) =>
                      setSeconds(
                        e.target.value === ""
                          ? null
                          : Math.min(
                              59,
                              Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                            ),
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Reading rate (wpm)</Label>
                  <Input value={computed.readingRate ?? "-"} disabled readOnly />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">
                    Score (of {PHILIRI_COMPREHENSION_QUESTIONS})
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={PHILIRI_COMPREHENSION_QUESTIONS}
                    value={comprehensionRaw === null ? "" : comprehensionRaw}
                    disabled={locked}
                    onChange={(e) =>
                      setComprehensionRaw(
                        e.target.value === ""
                          ? null
                          : Math.min(
                              PHILIRI_COMPREHENSION_QUESTIONS,
                              Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                            ),
                      )
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-muted px-3 py-1">
                  Comprehension: {computed.comprehensionScore ?? "-"}
                  {computed.comprehensionScore !== null ? "%" : ""}
                </span>
                <span className="rounded-full bg-muted px-3 py-1">
                  Level: {computed.comprehensionLevel ?? "-"}
                </span>
              </div>
              <div>
                <Label className="mb-1 block text-xs">
                  Responses to Questions
                </Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
                  {Array.from(
                    { length: PHILIRI_COMPREHENSION_QUESTIONS },
                    (_, i) => `q${i + 1}`,
                  ).map((q, i) => (
                    <div key={q}>
                      <span className="text-[10px] text-muted-foreground">
                        {i + 1}.
                      </span>
                      <Input
                        className="h-8"
                        value={answers[q] ?? ""}
                        disabled={locked}
                        onChange={(e) =>
                          setAnswers((prev) => ({ ...prev, [q]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* PART B — Word Reading */}
            <section className="space-y-3">
              <p className="text-sm font-semibold border-b pb-1">
                Part B — Word Reading (Pagbasa)
              </p>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="px-3 py-1.5 text-left">
                        Types of Miscues (Uri ng Mali)
                      </th>
                      <th className="px-3 py-1.5 text-center w-32">
                        Number of Miscues
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {PHILIRI_MISCUE_TYPES.map((mt, i) => (
                      <tr key={mt.key} className="border-t">
                        <td className="px-3 py-1">
                          {i + 1}. {isFilipino ? mt.fil : mt.en}{" "}
                          <span className="text-muted-foreground">
                            ({isFilipino ? mt.en : mt.fil})
                          </span>
                        </td>
                        <td className="p-0 text-center">
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-full rounded-none border-0 text-center"
                            value={miscues[mt.key] === null ? "" : miscues[mt.key]!}
                            disabled={locked}
                            onChange={(e) => setMiscue(mt.key, e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                          />
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/30 font-medium">
                      <td className="px-3 py-1">Total Miscues (Kabuuan)</td>
                      <td className="px-3 py-1 text-center">
                        {computed.totalMiscues ?? "-"}
                      </td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-3 py-1">Number of Words in the Passage</td>
                      <td className="px-3 py-1 text-center">
                        {material.word_count}
                      </td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-3 py-1">Word Reading Score</td>
                      <td className="px-3 py-1 text-center">
                        {computed.wordReadingScore === null
                          ? "-"
                          : `${computed.wordReadingScore}%`}
                      </td>
                    </tr>
                    <tr className="border-t font-medium">
                      <td className="px-3 py-1">
                        Word Reading Level (Antas ng Pagbasa)
                      </td>
                      <td className="px-3 py-1 text-center">
                        {computed.wordReadingLevel ?? "-"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">
                  Overall Reading Level: {computed.overallReadingLevel ?? "-"}
                </span>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-1 block text-xs">Date assessed</Label>
                <Input
                  type="date"
                  value={dateAssessed}
                  disabled={locked}
                  onChange={(e) => setDateAssessed(e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Remarks</Label>
                <Input
                  value={remarks}
                  disabled={locked}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={printForm}>
            <Printer className="h-4 w-4 mr-1" /> Print form
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={saving || locked}
            className="min-w-[100px]"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
