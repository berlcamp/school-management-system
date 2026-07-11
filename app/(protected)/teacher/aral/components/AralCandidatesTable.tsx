"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  aralSourceLabel,
  aralTierColor,
  ARAL_TIERS,
  getGradeLevelLabel,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hook";
import type { Student } from "@/types";
import type { AralProgram } from "@/types";
import { Loader2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import type { AdviserSection } from "../[program]/page";
import {
  AralCandidate,
  fetchCandidates,
  fetchEnrolledStudentIds,
} from "../aralUtils";

interface Props {
  program: AralProgram;
  section: AdviserSection;
  schoolYear: string;
  phase: string;
  teacherId: number | null;
  onEnrolled: () => void;
}

interface Row extends AralCandidate {
  student: Student;
}

export function AralCandidatesTable({
  program,
  section,
  schoolYear,
  phase,
  teacherId,
  onEnrolled,
}: Props) {
  const user = useAppSelector((state) => state.user.user);
  const [rows, setRows] = useState<Row[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [candidates, enrolled] = await Promise.all([
        fetchCandidates(
          program,
          section.id,
          schoolYear,
          phase,
          section.grade_level,
        ),
        fetchEnrolledStudentIds(program, schoolYear),
      ]);
      const fresh = candidates.filter((c) => !enrolled.has(c.student_id));
      if (fresh.length === 0) {
        setRows([]);
        setChecked({});
        return;
      }
      const { data: students } = await supabase
        .from("sms_students")
        .select("*")
        .in(
          "id",
          fresh.map((c) => c.student_id),
        );
      const byId = new Map(
        ((students || []) as Student[]).map((s) => [String(s.id), s]),
      );
      const built: Row[] = fresh
        .flatMap((c) => {
          const student = byId.get(c.student_id);
          return student ? [{ ...c, student }] : [];
        })
        .sort((a, b) =>
          `${a.student.last_name}, ${a.student.first_name}`.localeCompare(
            `${b.student.last_name}, ${b.student.first_name}`,
          ),
        );
      setRows(built);
      // Priority learners are pre-checked; Secondary are opt-in.
      const nextChecked: Record<string, boolean> = {};
      built.forEach((r) => {
        nextChecked[r.student_id] = r.tier === "priority";
      });
      setChecked(nextChecked);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load candidates.",
      );
    } finally {
      setLoading(false);
    }
  }, [program, section.id, section.grade_level, schoolYear, phase]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedCount = rows.filter((r) => checked[r.student_id]).length;

  const enrollSelected = async () => {
    const picks = rows.filter((r) => checked[r.student_id]);
    if (picks.length === 0) return;
    const recordSchoolId = Number(section.school_id);
    if (!recordSchoolId) {
      toast.error("This section has no school assigned.");
      return;
    }
    const enrolledBy = user?.system_user_id
      ? Number(user.system_user_id)
      : null;
    setSaving(true);
    try {
      const payload = picks.map((r) => ({
        school_id: recordSchoolId,
        student_id: Number(r.student_id),
        section_id: Number(section.id),
        grade_level: section.grade_level,
        school_year: schoolYear,
        program,
        tier: r.tier,
        source_assessment: r.source_assessment,
        source_level: r.source_level,
        suggested_start_grade: r.suggested_start_grade,
        basis_phase: phase,
        status: "enrolled",
        teacher_id: teacherId,
        enrolled_by: enrolledBy,
      }));
      const { error } = await supabase
        .from("sms_aral_enrollments")
        .insert(payload);
      if (error) throw new Error(error.message);
      toast.success(
        `Enrolled ${picks.length} learner${picks.length > 1 ? "s" : ""}.`,
      );
      onEnrolled();
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to enroll learners.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading candidates…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No eligible learners for this section, phase and school year — or all
        eligible learners are already enrolled.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Priority learners are pre-selected. Secondary learners are optional
          (enroll only if resources permit).
        </p>
        <Button
          size="sm"
          onClick={enrollSelected}
          disabled={saving || selectedCount === 0}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4 mr-1" />
          )}
          Enroll selected ({selectedCount})
        </Button>
      </div>

      <div className="overflow-x-auto border rounded-md">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr className="bg-muted/60">
              <th className="border px-3 py-2 w-10 text-center">
                <Checkbox
                  checked={selectedCount > 0 && selectedCount === rows.length}
                  onChange={(e) => {
                    const next: Record<string, boolean> = {};
                    rows.forEach((r) => {
                      next[r.student_id] = e.target.checked;
                    });
                    setChecked(next);
                  }}
                  aria-label="Select all"
                />
              </th>
              <th className="border px-3 py-2 text-left">Name of Learner</th>
              <th className="border px-2 py-2 text-center w-12">Sex</th>
              <th className="border px-3 py-2 text-left">Source</th>
              <th className="border px-3 py-2 text-left">Level</th>
              <th className="border px-3 py-2 text-center">Suggested Start</th>
              <th className="border px-3 py-2 text-center">Tier</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tierLabel =
                ARAL_TIERS.find((t) => t.value === r.tier)?.label ?? r.tier;
              return (
                <tr key={r.student_id} className="hover:bg-muted/30">
                  <td className="border px-3 py-1.5 text-center">
                    <Checkbox
                      checked={Boolean(checked[r.student_id])}
                      onChange={(e) =>
                        setChecked((prev) => ({
                          ...prev,
                          [r.student_id]: e.target.checked,
                        }))
                      }
                      aria-label={`Select ${r.student.last_name}`}
                    />
                  </td>
                  <td className="border px-3 py-1.5 whitespace-nowrap">
                    {r.student.last_name}, {r.student.first_name}
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {formatLrn(r.student.lrn)}
                    </span>
                  </td>
                  <td className="border px-2 py-1.5 text-center text-xs">
                    {r.student.gender === "female" ? "F" : "M"}
                  </td>
                  <td className="border px-3 py-1.5">
                    {aralSourceLabel(r.source_assessment)}
                  </td>
                  <td className="border px-3 py-1.5">{r.source_level}</td>
                  <td className="border px-3 py-1.5 text-center">
                    {r.suggested_start_grade != null
                      ? getGradeLevelLabel(r.suggested_start_grade)
                      : "—"}
                  </td>
                  <td
                    className={`border px-3 py-1.5 text-center font-semibold ${aralTierColor(
                      r.tier,
                    )}`}
                  >
                    {tierLabel}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
