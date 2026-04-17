"use client";

import { Badge } from "@/components/ui/badge";
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
import { getGradeLevelLabel } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { getMasteryLevel } from "@/lib/utils/mps";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

export interface ScheduleAssignment {
  subject_id: string;
  subject_name: string;
  section_id: string;
  section_name: string;
  grade_level: number;
}

interface TeacherMpsEntryFormProps {
  schoolYear: string;
  setSchoolYear: (value: string) => void;
  assignments: ScheduleAssignment[];
  selectedSectionId: string;
  setSelectedSectionId: (value: string) => void;
  selectedSubjectId: string;
  setSelectedSubjectId: (value: string) => void;
  schoolYearOptions: string[];
  teacherId: number;
  schoolId: string | number | null;
}

const QUARTERS = [
  { value: 1, label: "1st Quarter" },
  { value: 2, label: "2nd Quarter" },
  { value: 3, label: "3rd Quarter" },
  { value: 4, label: "4th Quarter" },
] as const;

export function TeacherMpsEntryForm({
  schoolYear,
  setSchoolYear,
  assignments,
  selectedSectionId,
  setSelectedSectionId,
  selectedSubjectId,
  setSelectedSubjectId,
  schoolYearOptions,
  teacherId,
  schoolId,
}: TeacherMpsEntryFormProps) {
  const sections = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; grade_level: number }
    >();
    assignments.forEach((a) => {
      if (!map.has(a.section_id)) {
        map.set(a.section_id, {
          id: a.section_id,
          name: a.section_name,
          grade_level: a.grade_level,
        });
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => a.grade_level - b.grade_level || a.name.localeCompare(b.name)
    );
  }, [assignments]);

  const subjectsForSection = useMemo(() => {
    if (!selectedSectionId) return [];
    const map = new Map<string, { id: string; name: string }>();
    assignments
      .filter((a) => a.section_id === selectedSectionId)
      .forEach((a) => {
        if (!map.has(a.subject_id)) {
          map.set(a.subject_id, { id: a.subject_id, name: a.subject_name });
        }
      });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, selectedSectionId]);

  const selectedAssignment = useMemo(
    () =>
      assignments.find(
        (a) =>
          a.section_id === selectedSectionId &&
          a.subject_id === selectedSubjectId
      ) ?? null,
    [assignments, selectedSectionId, selectedSubjectId]
  );

  const [values, setValues] = useState<Record<number, string>>({
    1: "",
    2: "",
    3: "",
    4: "",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isValidAssignment, setIsValidAssignment] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const fullUser = useAppSelector((state) => state.user.user);
  const { settings, isLoading: settingsLoading } = useSchoolSettings(
    true,
    fullUser?.school_id
  );
  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const yearLocked = isPreviousYear && !settings.allow_edit_previous_school_year;

  const bothPicked = Boolean(selectedSectionId && selectedSubjectId);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      if (!bothPicked || !teacherId || !schoolYear) {
        setIsValidAssignment(false);
        setIsValidating(false);
        return;
      }

      setIsValidating(true);
      setIsValidAssignment(false);
      setValues({ 1: "", 2: "", 3: "", 4: "" });

      const valid = await validateAssignment();
      if (!isMounted) return;
      setIsValidAssignment(valid);
      setIsValidating(false);

      if (valid) {
        await loadExisting();
      }
    };

    run();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionId, selectedSubjectId, schoolYear, teacherId]);

  const validateAssignment = async (): Promise<boolean> => {
    const { data } = await supabase
      .from("sms_subject_schedules")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("subject_id", selectedSubjectId)
      .eq("section_id", selectedSectionId)
      .eq("school_year", schoolYear)
      .maybeSingle();

    if (data) return true;

    const { data: sectionData } = await supabase
      .from("sms_sections")
      .select("section_adviser_id")
      .eq("id", selectedSectionId)
      .eq("section_adviser_id", teacherId)
      .eq("school_year", schoolYear)
      .maybeSingle();

    return !!sectionData;
  };

  const loadExisting = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_mps")
        .select("*")
        .eq("subject_id", selectedSubjectId)
        .eq("section_id", selectedSectionId)
        .eq("school_year", schoolYear);

      if (error) {
        console.error("Error loading MPS:", error);
        toast.error("Failed to load existing MPS");
        return;
      }

      const next: Record<number, string> = { 1: "", 2: "", 3: "", 4: "" };
      (data ?? []).forEach((row) => {
        next[row.grading_period] = String(row.mps);
      });
      setValues(next);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (period: number, raw: string) => {
    if (raw === "") {
      setValues((prev) => ({ ...prev, [period]: "" }));
      return;
    }
    const num = parseFloat(raw);
    if (Number.isNaN(num) || num < 0 || num > 100) return;
    setValues((prev) => ({ ...prev, [period]: raw }));
  };

  const handleSave = async () => {
    if (!isValidAssignment) {
      toast.error("You are not assigned to this subject-section combination");
      return;
    }
    if (yearLocked) {
      toast.error("Editing previous school year records is disabled");
      return;
    }
    if (!selectedAssignment) {
      toast.error("Select a section and subject first");
      return;
    }
    if (schoolId == null) {
      toast.error("No school associated with your account");
      return;
    }

    setSaving(true);
    try {
      const rows = QUARTERS.map(({ value }) => ({
        period: value,
        raw: values[value],
      }))
        .filter(({ raw }) => raw !== "" && !Number.isNaN(parseFloat(raw)))
        .map(({ period, raw }) => ({
          school_id: Number(schoolId),
          subject_id: Number(selectedSubjectId),
          section_id: Number(selectedSectionId),
          grade_level: selectedAssignment.grade_level,
          school_year: schoolYear,
          grading_period: period,
          mps: parseFloat(raw),
          teacher_id: teacherId,
        }));

      if (rows.length === 0) {
        toast.error("Enter at least one quarter's MPS before saving");
        return;
      }

      const { error } = await supabase.from("sms_mps").upsert(rows, {
        onConflict: "subject_id,section_id,grading_period,school_year",
      });

      if (error) throw error;
      toast.success("MPS saved successfully!");
    } catch (err) {
      console.error("Error saving MPS:", err);
      toast.error("Failed to save MPS");
    } finally {
      setSaving(false);
    }
  };

  const renderHeader = () => (
    <div className="sticky top-0 z-10 bg-card border-b shadow-sm">
      <div className="flex items-end justify-between gap-4 px-4 py-4 flex-wrap">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 min-w-[320px] max-w-2xl">
          <div>
            <label className="text-sm font-medium mb-2 block">School Year</label>
            <Select value={schoolYear} onValueChange={setSchoolYear}>
              <SelectTrigger>
                <SelectValue placeholder="Select school year" />
              </SelectTrigger>
              <SelectContent>
                {schoolYearOptions.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Section</label>
            <Select
              value={selectedSectionId}
              onValueChange={(v) => {
                setSelectedSectionId(v);
                setSelectedSubjectId("");
              }}
              disabled={!schoolYear || sections.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    sections.length === 0
                      ? "No sections assigned"
                      : "Select section"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} — {getGradeLevelLabel(s.grade_level)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Subject</label>
            <Select
              value={selectedSubjectId}
              onValueChange={setSelectedSubjectId}
              disabled={!selectedSectionId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    selectedSectionId
                      ? subjectsForSection.length === 0
                        ? "No subjects in this section"
                        : "Select subject"
                      : "Select section first"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {subjectsForSection.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {yearLocked && (
          <p className="text-sm text-muted-foreground">
            Editing records from previous school years is disabled.
          </p>
        )}
        <Button
          onClick={handleSave}
          disabled={
            saving ||
            yearLocked ||
            settingsLoading ||
            !isValidAssignment ||
            loading
          }
          className="shrink-0"
        >
          {saving ? "Saving..." : "Save MPS"}
        </Button>
      </div>
    </div>
  );

  if (!bothPicked) {
    return (
      <div className="space-y-4">
        {renderHeader()}
        <div className="text-center py-8 text-muted-foreground">
          {selectedSectionId
            ? "Select a subject to enter MPS"
            : "Select a section and subject to enter MPS"}
        </div>
      </div>
    );
  }

  if (isValidating) {
    return (
      <div className="space-y-4">
        {renderHeader()}
        <div className="text-center py-8 text-muted-foreground">
          Validating assignment...
        </div>
      </div>
    );
  }

  if (!isValidAssignment) {
    return (
      <div className="space-y-4">
        {renderHeader()}
        <div className="text-center py-8 text-muted-foreground">
          You are not assigned to this subject-section combination for the
          selected school year.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {renderHeader()}
        <div className="text-center py-8">Loading MPS...</div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {renderHeader()}
      <div className="px-4 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUARTERS.map(({ value, label }) => {
            const raw = values[value];
            const num = raw === "" ? null : parseFloat(raw);
            const mastery =
              num !== null && !Number.isNaN(num) ? getMasteryLevel(num) : null;
            return (
              <div
                key={value}
                className="rounded-lg border bg-background p-4 space-y-3"
              >
                <div className="text-sm font-medium">{label}</div>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="0 – 100"
                  value={raw}
                  onChange={(e) => handleChange(value, e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  disabled={yearLocked || settingsLoading}
                />
                {mastery ? (
                  <Badge
                    variant="outline"
                    className={`${mastery.colorClass} border`}
                  >
                    {mastery.label}
                  </Badge>
                ) : (
                  <div className="h-[22px]" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
