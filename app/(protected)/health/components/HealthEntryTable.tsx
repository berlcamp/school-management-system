"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Fragment, useEffect, useMemo, useState } from "react";
import { groupLearnersBySex } from "@/lib/utils/learnerSex";
import { LearnerSexGroupRow } from "@/components/LearnerSexGroupHeader";
import toast from "react-hot-toast";
import {
  assessGrowth,
  formatBmi,
  formatZ,
  heightForAgeLabel,
  measurementProblem,
  nutritionalStatusLabel,
  HEIGHT_FOR_AGE_OPTIONS,
  MEASUREMENT_PERIOD_OPTIONS,
  NUTRITIONAL_STATUS_OPTIONS,
  type GrowthAssessment,
  type HealthMeasurementPeriod,
  type HeightForAge,
  type NutritionalStatus,
} from "@/lib/utils/nutritionalStatus";
import { ENROLLED_LIFECYCLE_STATUSES } from "@/lib/constants/enrollment";

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

/**
 * Both of the school year's readings, held at once. Switching the toggle is a
 * view change rather than a reload, so an edit made under Baseline is still
 * there after a look at Endline and is still saved.
 */
type PeriodRows = Record<HealthMeasurementPeriod, Record<string, HealthRow>>;

const emptyPeriodRows = (): PeriodRows => ({ baseline: {}, endline: {} });

/** Whether a row holds nothing at all — no measurement, no band, no note. */
function isBlankRow(row: HealthRow): boolean {
  return (
    !row.height_cm.trim() &&
    !row.weight_kg.trim() &&
    !row.nutritional_status &&
    !row.height_for_age &&
    !row.remarks.trim() &&
    !row.measured_at
  );
}

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
  const [healthData, setHealthData] = useState<PeriodRows>(emptyPeriodRows);
  // Which of the two SF8 readings is being encoded. DepEd measures at the
  // beginning of the school year and again at the end; the grid is already
  // nine columns wide, so it shows one reading at a time rather than both.
  const [period, setPeriod] = useState<HealthMeasurementPeriod>("baseline");
  // `period:studentId` for every reading already on file. A learner with
  // nothing entered and nothing stored is not written on save at all —
  // otherwise saving a baseline would create an empty endline row for every
  // learner in the section, and the screen could never tell the two apart.
  const [storedKeys, setStoredKeys] = useState<Set<string>>(() => new Set());
  // Only the readings the encoder actually touched are written back.
  const [dirtyPeriods, setDirtyPeriods] = useState<Set<HealthMeasurementPeriod>>(
    () => new Set(),
  );
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

  /** The reading currently on screen. */
  const rows = healthData[period];
  /**
   * The baseline shown beside the inputs while the endline is being encoded.
   * Comparing the two is why DepEd takes two — without it the encoder cannot
   * see that a learner who was Wasted in July is Normal in February.
   */
  const baselineRows = healthData.baseline;

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
      setHealthData(emptyPeriodRows());
      return;
    }
    fetchData();
  }, [sectionId, schoolYear]);

  /**
   * `resetPeriod` picks the tab to open on, which is right when a section is
   * first loaded and wrong after a save: someone correcting a baseline in a
   * section that also has an endline must not be thrown to the other tab by
   * pressing Save.
   */
  const fetchData = async (resetPeriod = true) => {
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
        .eq("status", "approved")
        // `status` is the approval workflow; `enrollment_status` is the
        // lifecycle. SF8 is measured on the learners in the section, so one
        // already released to another school or dropped is off the sheet —
        // matching generateSf8.ts, which prints what is entered here.
        .in("enrollment_status", ENROLLED_LIFECYCLE_STATUSES);

      if (enrollmentError) {
        console.error("Error fetching enrollments:", enrollmentError);
        toast.error("Failed to load students");
        setStudents([]);
        setHealthData(emptyPeriodRows());
        return;
      }

      if (!enrollments || enrollments.length === 0) {
        setStudents([]);
        setHealthData(emptyPeriodRows());
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
        setHealthData(emptyPeriodRows());
        return;
      }

      setStudents(studentList);

      const { data: healthRecords } = await supabase
        .from("sms_learner_health")
        .select("*")
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear)
        .in("student_id", studentIds);

      const nextRows = emptyPeriodRows();
      const nextStored = new Set<string>();
      // A reading whose period the database somehow does not name is a
      // baseline: every row predating migration 188 is one, which is what that
      // migration's backfill says in so many words.
      const periodOf = (rec: LearnerHealth): HealthMeasurementPeriod =>
        rec.measurement_period === "endline" ? "endline" : "baseline";

      MEASUREMENT_PERIOD_OPTIONS.forEach(({ value: p }) => {
        studentList.forEach((s) => {
          const rec = (healthRecords || []).find(
            (h: LearnerHealth) =>
              String(h.student_id) === String(s.id) && periodOf(h) === p
          );
          if (rec) nextStored.add(`${p}:${s.id}`);
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
          nextRows[p][s.id] = stored;
        });
      });

      setHealthData(nextRows);
      setStoredKeys(nextStored);
      setDirtyPeriods(new Set());
      // Open on the reading the section is actually working on. A nurse
      // encoding in February should not have to switch every time, and a
      // section that has only ever been measured once opens where it left off.
      // An endline row holding nothing does not count — saving a baseline must
      // not decide which tab the section opens on afterwards.
      if (resetPeriod) {
        const hasEndline = Object.values(nextRows.endline).some(
          (row) => !isBlankRow(row)
        );
        setPeriod(hasEndline ? "endline" : "baseline");
      }
    } catch (err) {
      console.error("Error fetching health data:", err);
      toast.error("Failed to load data");
      setStudents([]);
      setHealthData(emptyPeriodRows());
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
      for (const [studentId, row] of Object.entries(prev[period])) {
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
      return changed ? { ...prev, [period]: next } : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, students, studentsById, period]);

  const updateHealth = (
    studentId: string,
    field: keyof HealthRow,
    value: string
  ) => {
    setDirtyPeriods((prev) =>
      prev.has(period) ? prev : new Set(prev).add(period),
    );
    setHealthData((prev) => {
      let row: HealthRow = {
        ...(prev[period][studentId] ?? EMPTY_ROW),
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

      return { ...prev, [period]: { ...prev[period], [studentId]: row } };
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
      // Every reading the encoder touched, which is normally just the one on
      // screen. Falling back to the active period keeps the oldest flow here
      // working unchanged: open a section, let the chart fill the blank bands,
      // press Save without typing anything.
      const periodsToSave: HealthMeasurementPeriod[] =
        dirtyPeriods.size > 0 ? [...dirtyPeriods] : [period];

      const entries = periodsToSave.flatMap((p) =>
        students.flatMap((student) => {
          const row = healthData[p][student.id] ?? EMPTY_ROW;
          // A learner with nothing entered and nothing already on file is not
          // written at all. Without this, saving a baseline would file an empty
          // endline for every learner in the section, and the sheet would claim
          // a second measurement that was never taken.
          if (isBlankRow(row) && !storedKeys.has(`${p}:${student.id}`)) {
            return [];
          }
          const heightCm =
            row.height_cm && !Number.isNaN(Number(row.height_cm))
              ? Number(row.height_cm)
              : null;
          const weightKg =
            row.weight_kg && !Number.isNaN(Number(row.weight_kg))
              ? Number(row.weight_kg)
              : null;
          return [
            {
              student_id: student.id,
              section_id: sectionId,
              school_year: schoolYear,
              measurement_period: p,
              height_cm: heightCm,
              weight_kg: weightKg,
              nutritional_status: row.nutritional_status || null,
              height_for_age: row.height_for_age || null,
              remarks: row.remarks?.trim() || null,
              measured_at: row.measured_at || null,
            },
          ];
        })
      );

      if (entries.length === 0) {
        toast("Nothing to save yet — enter a height or a weight first.");
        return;
      }

      const { error } = await supabase
        .from("sms_learner_health")
        .upsert(entries, {
          // Migration 188 widened the unique key with the period. PostgREST
          // resolves this against a real unique index, so the column list has
          // to match it exactly or every save comes back a 409.
          onConflict: "student_id,section_id,school_year,measurement_period",
          ignoreDuplicates: false,
        });

      if (error) throw error;

      toast.success("Health records saved successfully!");
      fetchData(false);
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
      <Tabs
        value={period}
        onValueChange={(v) => setPeriod(v as HealthMeasurementPeriod)}
      >
        <TabsList>
          {MEASUREMENT_PERIOD_OPTIONS.map((o) => (
            <TabsTrigger key={o.value} value={o.value}>
              {o.label}
              {dirtyPeriods.has(o.value) && (
                <span
                  className="ml-1.5 text-amber-600 dark:text-amber-500"
                  title="Unsaved changes"
                  aria-label="Unsaved changes"
                >
                  •
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="text-sm text-muted-foreground">
        SF8 is measured twice: at the beginning of the school year and again at
        the end. Each reading is kept — encoding the endline no longer replaces
        the baseline.
      </p>
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
        <table className="w-full min-w-[1200px]">
          <thead className="bg-muted sticky top-0 z-10 border-b border-border">
            <tr>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[2.75rem] w-12">
                No.
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium w-[12rem] min-w-[12rem] max-w-[12rem]">
                Name of Learner
              </th>
              {period === "endline" && (
                <th className="px-3 py-3 text-left text-sm font-medium min-w-[9rem] bg-muted/60">
                  Baseline
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    read-only
                  </span>
                </th>
              )}
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[7rem]">
                Height (cm)
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[7rem]">
                Weight (kg)
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[5.5rem]">
                BMI
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
            {/* MALE block first, then FEMALE, numbered from 1 in each — the
                SF8 layout this table feeds. */}
            {groupLearnersBySex(students, (st) => st.gender)
              .filter((g) => g.rows.length > 0)
              .map((group) => (
            <Fragment key={group.key}>
            <LearnerSexGroupRow
              label={group.label}
              count={group.rows.length}
              colSpan={period === "endline" ? 10 : 9}
            />
            {group.rows.map((student, idx) => {
              const row = rows[student.id] ?? EMPTY_ROW;
              const baseline = baselineRows[student.id];
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
                  {period === "endline" && (
                    // What was measured in July, beside where February goes.
                    // Comparing the two is why DepEd takes two readings; the
                    // figures are shown as they were stored and nothing is
                    // derived from them here — the summary on the printed SF8
                    // is where the counts are worked out.
                    <td className="px-3 py-2.5 align-middle text-xs leading-tight bg-muted/40">
                      {baseline && !isBlankRow(baseline) ? (
                        <>
                          <span className="block tabular-nums">
                            {baseline.height_cm || "—"} cm ·{" "}
                            {baseline.weight_kg || "—"} kg
                          </span>
                          <span className="block text-muted-foreground">
                            {baseline.nutritional_status
                              ? nutritionalStatusLabel(
                                  baseline.nutritional_status
                                )
                              : "no band"}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          Not measured
                        </span>
                      )}
                    </td>
                  )}
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
                  <td className="px-3 py-2.5 align-middle text-sm tabular-nums">
                    {growth.bmi === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : badMeasurement ? (
                      // Computed from a height that cannot be one, so it is not
                      // a BMI. Showing the figure would dress a typo up as data.
                      <span className="text-amber-600 dark:text-amber-500">—</span>
                    ) : (
                      formatBmi(growth.bmi)
                    )}
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
                        z {formatZ(growth.bmiForAge.z)}
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
            </Fragment>
              ))}
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
