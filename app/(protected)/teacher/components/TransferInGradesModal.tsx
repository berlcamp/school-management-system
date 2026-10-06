// app/(protected)/teacher/components/TransferInGradesModal.tsx
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
import { supabase } from "@/lib/supabase/client";
import { getGradingPeriodsForSection } from "@/lib/utils/schoolYear";
import { parseCarriedGrade } from "@/lib/utils/transferIn";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

/**
 * Grades a transferee earned at their previous school, copied from that
 * school's SF9 (migration 200). Saved as ordinary `sms_grades` rows marked
 * `carried_from_school`, which the Class Record never overwrites or unposts.
 */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  sectionId: string;
  schoolYear: string;
  shsCurriculum?: string | null;
  /** In-system transfer: the origin school's name; the name field is then read-only. */
  originSchoolName: string | null;
  transferInSchoolName: string | null;
}

interface SubjectRow {
  id: string;
  name: string;
  code: string | null;
}

type CellKey = `${string}:${number}`; // subjectId:period
const key = (subjectId: string, period: number): CellKey => `${subjectId}:${period}`;

export function TransferInGradesModal({
  isOpen,
  onClose,
  onSaved,
  enrollmentId,
  studentId,
  studentName,
  sectionId,
  schoolYear,
  shsCurriculum,
  originSchoolName,
  transferInSchoolName,
}: Props) {
  const periods = getGradingPeriodsForSection(schoolYear, shsCurriculum);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [schoolName, setSchoolName] = useState("");
  // Carried values as loaded, and as edited.
  const [initial, setInitial] = useState<Record<CellKey, string>>({});
  const [values, setValues] = useState<Record<CellKey, string>>({});
  // Grades computed here (not carried) — shown greyed as a placeholder.
  const [computed, setComputed] = useState<Record<CellKey, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setSchoolName(originSchoolName ?? transferInSchoolName ?? "");
      const [{ data: sched }, { data: grades }] = await Promise.all([
        supabase
          .from("sms_subject_schedules")
          .select("subject:sms_subjects(id, name, code)")
          .eq("section_id", Number(sectionId))
          .eq("school_year", schoolYear),
        supabase
          .from("sms_grades")
          .select("subject_id, grading_period, grade, carried_from_school")
          .eq("student_id", Number(studentId))
          .eq("section_id", Number(sectionId))
          .eq("school_year", schoolYear),
      ]);
      if (!mounted) return;

      const byId = new Map<string, SubjectRow>();
      (sched || []).forEach((row) => {
        const s = Array.isArray(row.subject) ? row.subject[0] : row.subject;
        if (s) byId.set(String(s.id), { id: String(s.id), name: s.name, code: s.code });
      });
      setSubjects(
        Array.from(byId.values()).sort((a, b) =>
          (a.code || a.name).localeCompare(b.code || b.name),
        ),
      );

      const carried: Record<CellKey, string> = {};
      const own: Record<CellKey, number> = {};
      (grades || []).forEach((g) => {
        const k = key(String(g.subject_id), g.grading_period);
        if (g.carried_from_school) carried[k] = String(Math.round(Number(g.grade)));
        else own[k] = Number(g.grade);
      });
      setInitial(carried);
      setValues(carried);
      setComputed(own);
      setLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [isOpen, sectionId, studentId, schoolYear, originSchoolName, transferInSchoolName]);

  const errors: Record<CellKey, string> = {};
  (Object.keys(values) as CellKey[]).forEach((k) => {
    const r = parseCarriedGrade(values[k] ?? "");
    if (!r.ok) errors[k] = r.error;
  });
  const hasErrors = Object.keys(errors).length > 0;

  const handleSave = async () => {
    if (hasErrors) {
      toast.error("Fix the highlighted grades first");
      return;
    }
    const changed = new Set<CellKey>([
      ...(Object.keys(values) as CellKey[]),
      ...(Object.keys(initial) as CellKey[]),
    ]);
    const payload: { subject_id: number; grading_period: number; grade: number | null }[] = [];
    changed.forEach((k) => {
      const before = (initial[k] ?? "").trim();
      const after = (values[k] ?? "").trim();
      if (before === after) return;
      const parsed = parseCarriedGrade(after);
      if (!parsed.ok) return;
      const [subjectId, period] = k.split(":");
      payload.push({
        subject_id: Number(subjectId),
        grading_period: Number(period),
        grade: parsed.grade,
      });
    });
    if (payload.some((p) => p.grade !== null) && !schoolName.trim()) {
      toast.error("Name the school the learner transferred from");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("save_transfer_in_grades", {
      p_enrollment_id: Number(enrollmentId),
      p_school_name: schoolName.trim() || null,
      p_grades: payload,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Carried-over grades saved");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Transferee Grades — {studentName}</DialogTitle>
          <DialogDescription>
            Copy the grades from the learner&apos;s previous SF9 for the terms
            before they transferred. They print on the report card and SF9 like
            any other grade, and the Class Record will not overwrite them. Leave
            a cell blank for a term graded at this school.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <label className="text-sm font-medium">Previous school</label>
          <Input
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            disabled={!!originSchoolName || saving}
            placeholder="e.g. St. Jude Academy"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : subjects.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No subjects are scheduled in this section yet.
          </p>
        ) : (
          <div className="max-h-[50vh] overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Subject</th>
                  {periods.map((p) => (
                    <th key={p.value} className="px-2 py-2 text-center w-24">
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-1.5">{s.name}</td>
                    {periods.map((p) => {
                      const k = key(s.id, p.value);
                      return (
                        <td key={p.value} className="px-2 py-1 text-center">
                          <Input
                            inputMode="numeric"
                            className={`h-8 text-center ${errors[k] ? "border-destructive" : ""}`}
                            value={values[k] ?? ""}
                            placeholder={computed[k] != null ? String(computed[k]) : ""}
                            title={
                              errors[k] ??
                              (computed[k] != null
                                ? `Graded here: ${computed[k]}. Typing a value replaces it.`
                                : undefined)
                            }
                            onChange={(e) =>
                              setValues((prev) => ({ ...prev, [k]: e.target.value }))
                            }
                            disabled={saving}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || hasErrors}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
