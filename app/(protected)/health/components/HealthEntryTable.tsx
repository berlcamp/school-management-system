"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { LearnerHealth } from "@/types";
import { Student } from "@/types";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  assessGrowth,
  formatBmi,
  formatZ,
  heightForAgeLabel,
  measurementProblem,
  nutritionalStatusLabel,
  HEIGHT_FOR_AGE_OPTIONS,
  NUTRITIONAL_STATUS_OPTIONS,
  type GrowthAssessment,
  type HeightForAge,
  type NutritionalStatus,
} from "@/lib/utils/nutritionalStatus";

interface HealthRow {
  height_cm: string;
  weight_kg: string;
  nutritional_status: NutritionalStatus | "";
  height_for_age: HeightForAge | "";
  remarks: string;
  measured_at: string;
  /**
   * Whether each band is still the chart's answer rather than the school's.
   * Client-side only — it is never saved. A band the encoder picked by hand is
   * left alone from then on, and a band already stored is the school's by
   * definition: SF8 is signed on paper, so a filed status is never quietly
   * recomputed underneath them.
   */
  auto_nutritional_status: boolean;
  auto_height_for_age: boolean;
}

const EMPTY_ROW: HealthRow = {
  height_cm: "",
  weight_kg: "",
  nutritional_status: "",
  height_for_age: "",
  remarks: "",
  measured_at: "",
  auto_nutritional_status: true,
  auto_height_for_age: true,
};

/** An Input's text as a number, or null when it is blank or unusable. */
function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

interface HealthEntryTableProps {
  sectionId: string;
  schoolYear: string;
}

export function HealthEntryTable({
  sectionId,
  schoolYear,
}: HealthEntryTableProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [healthData, setHealthData] = useState<Record<string, HealthRow>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Non-advisers (school head, registrar, division admin) may read a section's
  // SF8 but only the section adviser encodes it.
  const [isAdviser, setIsAdviser] = useState(false);
  const user = useAppSelector((state) => state.user.user);

  // The school nurse is the other person who takes these measurements, for
  // every section rather than one — SF8 is their assignment, so they encode
  // alongside the adviser. RLS on sms_learner_health is plain `authenticated`
  // (migration 023), which is why this rule lives here.
  const canEncode = isAdviser || user?.type === "school_nurse";

  const studentsById = useMemo(
    () => new Map(students.map((s) => [String(s.id), s])),
    [students],
  );

  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const { settings, isLoading: settingsLoading } = useSchoolSettings(true, user?.school_id);
  const yearLocked = isPreviousYear && !settings.allow_edit_previous_school_year;
  const isLocked = yearLocked || settingsLoading || !canEncode;

  /** What the WHO chart makes of one row's measurements. */
  const assessFor = (student: Student, row: HealthRow): GrowthAssessment =>
    assessGrowth({
      dateOfBirth: student.date_of_birth,
      gender: student.gender,
      heightCm: toNumber(row.height_cm),
      weightKg: toNumber(row.weight_kg),
      measuredOn: row.measured_at || null,
    });

  /**
   * Writes the chart's answer into whichever of the two bands the school has
   * not taken over. Clearing a measurement clears the band it produced, so a
   * suggestion never outlives the figure it came from.
   */
  const applySuggestion = (student: Student, row: HealthRow): HealthRow => {
    const growth = assessFor(student, row);
    const next = { ...row };
    if (row.auto_nutritional_status) {
      next.nutritional_status = growth.bmiForAge?.status ?? "";
    }
    if (row.auto_height_for_age) {
      next.height_for_age = growth.heightForAge?.status ?? "";
    }
    return next;
  };

  useEffect(() => {
    if (!sectionId || !schoolYear) {
      setStudents([]);
      setHealthData({});
      return;
    }
    fetchData();
  }, [sectionId, schoolYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: sectionData } = await supabase
        .from("sms_sections")
        .select("section_adviser_id")
        .eq("id", sectionId)
        .single();
      setIsAdviser(
        sectionData?.section_adviser_id != null &&
          String(sectionData.section_adviser_id) === String(user?.system_user_id)
      );

      const { data: enrollments, error: enrollmentError } = await supabase
        .from("sms_enrollments")
        .select("student_id")
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear)
        .eq("status", "approved");

      if (enrollmentError) {
        console.error("Error fetching enrollments:", enrollmentError);
        toast.error("Failed to load students");
        setStudents([]);
        setHealthData({});
        return;
      }

      if (!enrollments || enrollments.length === 0) {
        setStudents([]);
        setHealthData({});
        return;
      }

      const studentIds = enrollments.map((e) => e.student_id);
      const { data: studentList, error: studentsError } = await supabase
        .from("sms_students")
        .select("*")
        .in("id", studentIds)
        .order("last_name")
        .order("first_name");

      if (studentsError || !studentList) {
        toast.error("Failed to load students");
        setStudents([]);
        setHealthData({});
        return;
      }

      setStudents(studentList);

      const { data: healthRecords } = await supabase
        .from("sms_learner_health")
        .select("*")
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear)
        .in("student_id", studentIds);

      const healthMap: Record<string, HealthRow> = {};
      studentList.forEach((s) => {
        const rec = (healthRecords || []).find(
          (h: LearnerHealth) => String(h.student_id) === String(s.id)
        );
        const stored: HealthRow = {
          height_cm: rec?.height_cm != null ? String(rec.height_cm) : "",
          weight_kg: rec?.weight_kg != null ? String(rec.weight_kg) : "",
          nutritional_status: (rec?.nutritional_status as NutritionalStatus) ?? "",
          height_for_age: (rec?.height_for_age as HeightForAge) ?? "",
          remarks: rec?.remarks ?? "",
          measured_at: rec?.measured_at
            ? String(rec.measured_at).slice(0, 10)
            : "",
          auto_nutritional_status: true,
          auto_height_for_age: true,
        };
        // A band is treated as the school's own only where it differs from what
        // the chart makes of the stored measurements. A band that agrees was
        // almost certainly filled in from the chart, so correcting a mistyped
        // height re-bands the learner instead of leaving a status behind that
        // belongs to the wrong figure.
        const growth = assessGrowth({
          dateOfBirth: s.date_of_birth,
          gender: s.gender,
          heightCm: toNumber(stored.height_cm),
          weightKg: toNumber(stored.weight_kg),
          measuredOn: stored.measured_at || null,
        });
        stored.auto_nutritional_status =
          !stored.nutritional_status ||
          stored.nutritional_status === growth.bmiForAge?.status;
        stored.auto_height_for_age =
          !stored.height_for_age ||
          stored.height_for_age === growth.heightForAge?.status;
        healthMap[s.id] = stored;
      });
      setHealthData(healthMap);
    } catch (err) {
      console.error("Error fetching health data:", err);
      toast.error("Failed to load data");
      setStudents([]);
      setHealthData({});
    } finally {
      setLoading(false);
    }
  };

  /**
   * Bands the rows the school has left blank — the case the end user asked for:
   * a height and a weight are already on file, so the status should not have to
   * be looked up on the wall chart by hand. Runs when a section loads and again
   * once school settings resolve; it bails out without a state change when
   * there is nothing to fill, so it settles after one pass.
   */
  useEffect(() => {
    if (isLocked || students.length === 0) return;
    setHealthData((prev) => {
      let changed = false;
      const next: Record<string, HealthRow> = {};
      for (const [studentId, row] of Object.entries(prev)) {
        const student = studentsById.get(studentId);
        if (!student || (!row.auto_nutritional_status && !row.auto_height_for_age)) {
          next[studentId] = row;
          continue;
        }
        const filled = applySuggestion(student, row);
        if (
          filled.nutritional_status !== row.nutritional_status ||
          filled.height_for_age !== row.height_for_age
        ) {
          changed = true;
          next[studentId] = filled;
        } else {
          next[studentId] = row;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, students, studentsById]);

  const updateHealth = (
    studentId: string,
    field: keyof HealthRow,
    value: string
  ) => {
    setHealthData((prev) => {
      let row: HealthRow = {
        ...(prev[studentId] ?? EMPTY_ROW),
        [field]: value,
      };

      // Picking a band by hand hands that column to the school for good; the
      // chart stops writing to it, here and on every later measurement.
      if (field === "nutritional_status") row.auto_nutritional_status = false;
      if (field === "height_for_age") row.auto_height_for_age = false;

      if (
        field === "height_cm" ||
        field === "weight_kg" ||
        field === "measured_at"
      ) {
        const student = studentsById.get(String(studentId));
        if (student) row = applySuggestion(student, row);
      }

      return { ...prev, [studentId]: row };
    });
  };

  const handleSave = async () => {
    if (!canEncode) {
      toast.error(
        "Only the section adviser or the school nurse can encode this section's health records",
      );
      return;
    }
    if (yearLocked) {
      toast.error("Editing previous school year records is disabled");
      return;
    }
    setSaving(true);
    try {
      const entries = students.map((student) => {
        const row = healthData[student.id] ?? {};
        const heightCm =
          row.height_cm && !Number.isNaN(Number(row.height_cm))
            ? Number(row.height_cm)
            : null;
        const weightKg =
          row.weight_kg && !Number.isNaN(Number(row.weight_kg))
            ? Number(row.weight_kg)
            : null;
        return {
          student_id: student.id,
          section_id: sectionId,
          school_year: schoolYear,
          height_cm: heightCm,
          weight_kg: weightKg,
          nutritional_status: row.nutritional_status || null,
          height_for_age: row.height_for_age || null,
          remarks: row.remarks?.trim() || null,
          measured_at: row.measured_at || null,
        };
      });

      const { error } = await supabase
        .from("sms_learner_health")
        .upsert(entries, {
          onConflict: "student_id,section_id,school_year",
          ignoreDuplicates: false,
        });

      if (error) throw error;

      toast.success("Health records saved successfully!");
      fetchData();
    } catch (err) {
      console.error("Error saving health:", err);
      toast.error("Failed to save health records");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading learners...
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No enrolled learners in this section for the selected school year.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {!canEncode && (
        <p className="text-sm text-muted-foreground">
          Read-only — only the section adviser or the school nurse can encode
          this section&apos;s health records.
        </p>
      )}
      {yearLocked && (
        <p className="text-sm text-muted-foreground">
          Editing records from previous school years is disabled. Enable it in School Settings to make changes.
        </p>
      )}
      {canEncode && !yearLocked && (
        <p className="text-sm text-muted-foreground">
          Nutritional Status and Height for Age fill themselves in from the WHO
          growth chart as soon as a height and weight are entered, read against
          the learner&apos;s sex and age on the date of measurement. Change
          either one if the school reads it differently — what you pick is what
          is saved.
        </p>
      )}
      {canEncode && (
        <div className="flex shrink-0 justify-end">
          <Button onClick={handleSave} disabled={saving || isLocked}>
            {saving ? "Saving..." : "Save All"}
          </Button>
        </div>
      )}
      <div className="border rounded-md overflow-x-auto overflow-y-auto max-h-[min(65vh,calc(100dvh-14rem))] min-h-0">
        <table className="w-full min-w-[1110px]">
          <thead className="bg-muted sticky top-0 z-10 border-b border-border">
            <tr>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[2.75rem] w-12">
                No.
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium w-[12rem] min-w-[12rem] max-w-[12rem]">
                Name of Learner
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[7rem]">
                Height (cm)
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[7rem]">
                Weight (kg)
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[10rem]">
                Nutritional Status
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[11rem]">
                Height for Age
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[11rem]">
                Measured At
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[14rem]">
                Remarks
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((student, idx) => {
              const row = healthData[student.id] ?? EMPTY_ROW;
              const growth = assessFor(student, row);
              // A bad height or weight is the encoder's to fix now; a missing
              // birth date is not, so only the first is flagged as a problem.
              const badMeasurement =
                measurementProblem(
                  toNumber(row.height_cm),
                  toNumber(row.weight_kg),
                ) !== null;
              return (
                <tr key={student.id} className="hover:bg-muted/50">
                  <td className="px-3 py-2.5 align-middle text-sm tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2.5 align-middle text-sm leading-snug w-[12rem] max-w-[12rem] break-words">
                    {student.last_name}, {student.first_name}{" "}
                    {student.middle_name || ""} {student.suffix || ""}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      placeholder="—"
                      value={row.height_cm}
                      onChange={(e) =>
                        updateHealth(student.id, "height_cm", e.target.value)
                      }
                      disabled={isLocked}
                      className="h-9 w-full min-w-0 text-sm tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      placeholder="—"
                      value={row.weight_kg}
                      onChange={(e) =>
                        updateHealth(student.id, "weight_kg", e.target.value)
                      }
                      disabled={isLocked}
                      className="h-9 w-full min-w-0 text-sm tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <Select
                      value={row.nutritional_status || "none"}
                      onValueChange={(v) =>
                        updateHealth(
                          student.id,
                          "nutritional_status",
                          v === "none" ? "" : v
                        )
                      }
                      disabled={isLocked}
                    >
                      <SelectTrigger className="h-9 w-full min-w-0 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {NUTRITIONAL_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {growth.bmiForAge ? (
                      <p className="mt-1 text-[11px] leading-tight text-muted-foreground tabular-nums">
                        BMI {formatBmi(growth.bmi)} · z {formatZ(growth.bmiForAge.z)}
                        {!row.auto_nutritional_status &&
                          row.nutritional_status !== growth.bmiForAge.status && (
                            <span className="block text-amber-600 dark:text-amber-500">
                              chart says{" "}
                              {nutritionalStatusLabel(growth.bmiForAge.status)}
                            </span>
                          )}
                      </p>
                    ) : growth.unavailable ? (
                      <p
                        className={`mt-1 text-[11px] leading-tight ${
                          badMeasurement
                            ? "text-amber-600 dark:text-amber-500"
                            : "text-muted-foreground"
                        }`}
                      >
                        {badMeasurement ? "Check the entry" : "Enter by hand"} —{" "}
                        {growth.unavailable}.
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <Select
                      value={row.height_for_age || "none"}
                      onValueChange={(v) =>
                        updateHealth(
                          student.id,
                          "height_for_age",
                          v === "none" ? "" : v
                        )
                      }
                      disabled={isLocked}
                    >
                      <SelectTrigger className="h-9 w-full min-w-0 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {HEIGHT_FOR_AGE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {growth.heightForAge && (
                      <p className="mt-1 text-[11px] leading-tight text-muted-foreground tabular-nums">
                        z {formatZ(growth.heightForAge.z)}
                        {!row.auto_height_for_age &&
                          row.height_for_age !== growth.heightForAge.status && (
                            <span className="block text-amber-600 dark:text-amber-500">
                              chart says {heightForAgeLabel(growth.heightForAge.status)}
                            </span>
                          )}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <Input
                      type="date"
                      value={row.measured_at}
                      onChange={(e) =>
                        updateHealth(student.id, "measured_at", e.target.value)
                      }
                      disabled={isLocked}
                      className="h-9 w-full min-w-0 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <Input
                      placeholder="—"
                      value={row.remarks}
                      onChange={(e) =>
                        updateHealth(student.id, "remarks", e.target.value)
                      }
                      disabled={isLocked}
                      className="h-9 w-full min-w-0 text-sm"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEncode && (
        <div className="flex shrink-0 justify-end">
          <Button onClick={handleSave} disabled={saving || isLocked}>
            {saving ? "Saving..." : "Save All"}
          </Button>
        </div>
      )}
    </div>
  );
}
