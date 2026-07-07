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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CRLA_ANSWER_STATUS_LABELS } from "@/lib/constants";
import { generateCrlaRecordForm } from "@/lib/pdf/generateCrlaRecordForm";
import { supabase } from "@/lib/supabase/client";
import {
  CrlaRecordForm,
  CrlaRecordFormLine,
  CrlaRecordFormObservation,
  Student,
} from "@/types";
import { Loader2, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface LineScore {
  miscues: number | null;
  answer_status: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  recordForm: CrlaRecordForm;
  lines: CrlaRecordFormLine[];
  observations: CrlaRecordFormObservation[];
  student: Student;
  section: { id: string; name: string; school_id: string };
  teacherId: number;
  teacherName: string;
  fallbackSchoolId: number | null;
  phase: string;
  schoolYear: string;
  locked: boolean;
  onSaved: () => void;
}

export function CrlaRecordFormModal({
  isOpen,
  onClose,
  recordForm,
  lines,
  observations,
  student,
  section,
  teacherId,
  teacherName,
  fallbackSchoolId,
  phase,
  schoolYear,
  locked,
  onSaved,
}: Props) {
  const [recordId, setRecordId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, LineScore>>({});
  const [observationLevel, setObservationLevel] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [dateAssessed, setDateAssessed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setLoading(true);
      setScores({});
      setObservationLevel(null);
      setNotes("");
      setDateAssessed(null);
      setRecordId(null);

      const { data: rec } = await supabase
        .from("sms_crla_record_form_records")
        .select("id, date_assessed, observation_level, observations_notes")
        .eq("record_form_id", recordForm.id)
        .eq("student_id", student.id)
        .eq("phase", phase)
        .eq("school_year", schoolYear)
        .maybeSingle();

      if (rec) {
        setRecordId(String(rec.id));
        setObservationLevel(rec.observation_level ?? null);
        setNotes(rec.observations_notes ?? "");
        setDateAssessed(rec.date_assessed ?? null);
        const { data: ls } = await supabase
          .from("sms_crla_record_form_line_scores")
          .select("line_id, miscues, answer_status")
          .eq("record_id", rec.id);
        const map: Record<string, LineScore> = {};
        (ls || []).forEach((row) => {
          map[String(row.line_id)] = {
            miscues: row.miscues === null ? null : Number(row.miscues),
            answer_status: row.answer_status ?? null,
          };
        });
        setScores(map);
      }
      setLoading(false);
    };
    load();
  }, [isOpen, recordForm.id, student.id, phase, schoolYear]);

  const setScore = (lineId: string, patch: Partial<LineScore>) =>
    setScores((prev) => ({
      ...prev,
      [lineId]: {
        miscues: prev[lineId]?.miscues ?? null,
        answer_status: prev[lineId]?.answer_status ?? null,
        ...patch,
      },
    }));

  const totalWords = lines.reduce((s, l) => s + (Number(l.word_count) || 0), 0);
  const totalMiscues = lines.reduce(
    (s, l) => s + (Number(scores[l.id]?.miscues ?? 0) || 0),
    0,
  );
  const questionLines = lines.filter((l) => l.question);
  const comprehensionTotal = questionLines.length;
  const comprehensionCorrect = questionLines.filter(
    (l) => scores[l.id]?.answer_status === "correct",
  ).length;
  const anyEntered =
    Object.keys(scores).length > 0 || observationLevel !== null || !!notes;

  const save = async () => {
    if (locked || saving) return;
    const schoolId = Number(section.school_id) || fallbackSchoolId;
    if (!schoolId) {
      toast.error("This section has no school assigned.");
      return;
    }
    setSaving(true);
    try {
      let id = recordId;
      if (!id) {
        const { data, error } = await supabase
          .from("sms_crla_record_form_records")
          .insert({
            record_form_id: Number(recordForm.id),
            school_id: schoolId,
            section_id: Number(section.id),
            student_id: Number(student.id),
            teacher_id: teacherId,
            phase,
            school_year: schoolYear,
          })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message || "Insert failed");
        id = String(data.id);
        setRecordId(id);
      }

      // Upsert per-line scores (only lines that have any data entered).
      const scoreRows = lines
        .filter(
          (l) =>
            scores[l.id]?.miscues != null ||
            scores[l.id]?.answer_status != null,
        )
        .map((l) => ({
          record_id: Number(id),
          line_id: Number(l.id),
          miscues: scores[l.id]?.miscues ?? null,
          answer_status: scores[l.id]?.answer_status ?? null,
        }));
      if (scoreRows.length > 0) {
        const { error: seErr } = await supabase
          .from("sms_crla_record_form_line_scores")
          .upsert(scoreRows, { onConflict: "record_id,line_id" });
        if (seErr) throw new Error(seErr.message);
      }

      const { error: hErr } = await supabase
        .from("sms_crla_record_form_records")
        .update({
          date_assessed: dateAssessed,
          total_miscues: anyEntered ? totalMiscues : null,
          comprehension_correct: comprehensionTotal ? comprehensionCorrect : null,
          comprehension_total: comprehensionTotal || null,
          observation_level: observationLevel,
          observations_notes: notes.trim() || null,
        })
        .eq("id", id);
      if (hErr) throw new Error(hErr.message);

      toast.success("Record form saved.");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const print = () => {
    generateCrlaRecordForm({
      schoolId: Number(section.school_id) || fallbackSchoolId,
      recordForm,
      lines,
      observations,
      studentName: `${student.last_name}, ${student.first_name}`,
      teacherName,
      scores,
      observationLevel,
      notes,
    }).catch(() => toast.error("Failed to generate record form."));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-[900px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Record Form — {student.last_name}, {student.first_name}
          </DialogTitle>
          <DialogDescription>
            {recordForm.title}
            {recordForm.story_title ? ` · ${recordForm.story_title}` : ""} · {phase}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-48">
              <Label className="mb-1 block text-xs">Date of Assessment</Label>
              <Input
                type="date"
                value={dateAssessed ?? ""}
                disabled={locked}
                onChange={(e) => setDateAssessed(e.target.value || null)}
              />
            </div>

            <div className="overflow-x-auto border rounded-md">
              <table className="text-sm border-collapse min-w-full">
                <thead>
                  <tr className="bg-muted/60">
                    <th className="border px-2 py-1.5 text-left">Passage</th>
                    <th className="border px-2 py-1.5 w-16"># words</th>
                    <th className="border px-2 py-1.5 w-20"># miscues</th>
                    <th className="border px-2 py-1.5 text-left">Questions</th>
                    <th className="border px-2 py-1.5 text-left">Answers</th>
                    <th className="border px-2 py-1.5 w-24">✓ / ✗ / N/A</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="align-top">
                      <td className="border px-2 py-1">{l.line_text}</td>
                      <td className="border px-2 py-1 text-center">
                        {Number(l.word_count)}
                      </td>
                      <td className="border p-0">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-20 rounded-none border-0 text-center px-0"
                          value={scores[l.id]?.miscues ?? ""}
                          disabled={locked}
                          onChange={(e) =>
                            setScore(l.id, {
                              miscues:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                          onWheel={(e) => e.currentTarget.blur()}
                        />
                      </td>
                      <td className="border px-2 py-1 text-xs">
                        {l.question ?? ""}
                      </td>
                      <td className="border px-2 py-1 text-xs">
                        {l.answer_key ?? ""}
                      </td>
                      <td className="border px-1 py-1">
                        {l.question ? (
                          <Select
                            value={scores[l.id]?.answer_status ?? ""}
                            onValueChange={(v) =>
                              setScore(l.id, { answer_status: v })
                            }
                            disabled={locked}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="correct">
                                {CRLA_ANSWER_STATUS_LABELS.correct} Correct
                              </SelectItem>
                              <SelectItem value="wrong">
                                {CRLA_ANSWER_STATUS_LABELS.wrong} Wrong
                              </SelectItem>
                              <SelectItem value="na">
                                {CRLA_ANSWER_STATUS_LABELS.na}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-semibold">
                    <td className="border px-2 py-1 text-right">TOTAL</td>
                    <td className="border px-2 py-1 text-center">{totalWords}</td>
                    <td className="border px-2 py-1 text-center">
                      {totalMiscues}
                    </td>
                    <td className="border px-2 py-1" colSpan={2}>
                      Comprehension: {comprehensionCorrect}/{comprehensionTotal}
                    </td>
                    <td className="border px-2 py-1" />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Observations */}
            <div>
              <p className="text-sm font-semibold mb-2">Observations (Fluency)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[...observations]
                  .sort((a, b) => a.level_no - b.level_no)
                  .map((o) => {
                    const selected = observationLevel === o.level_no;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        disabled={locked}
                        onClick={() =>
                          setObservationLevel(selected ? null : o.level_no)
                        }
                        className={`rounded-md border p-2 text-left text-xs transition ${
                          selected
                            ? "border-primary bg-primary/10 ring-1 ring-primary"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="font-semibold">Level {o.level_no}</div>
                        <div className="text-muted-foreground">
                          {o.description}
                        </div>
                      </button>
                    );
                  })}
              </div>
              <Textarea
                className="mt-2"
                rows={2}
                placeholder="Notes / observations…"
                value={notes}
                disabled={locked}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={print}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={saving || locked || loading}
            className="min-w-[100px]"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
