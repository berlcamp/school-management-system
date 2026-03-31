"use client";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getGradeLevelLabel,
  GRADE_LEVELS,
  GRADE_LEVEL_MIN,
} from "@/lib/constants";
import { getSuggestedSectionType } from "@/lib/utils/gpaThresholds";
import { GpaThresholds } from "@/lib/utils/gpaThresholds";
import { LrnLookupResult, SectionType, StudentEntryMode } from "@/types/database";
import { BookOpen, GraduationCap } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { EnrollmentFormType } from "./enrollmentWizardSchema";

const SENIOR_HIGH_GRADE_MIN = 11;
const SENIOR_HIGH_GRADE_MAX = 12;

const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  heterogeneous: "Heterogeneous",
  homogeneous_fast_learner: "Homogeneous - Fast learner",
  homogeneous_crack_section: "Homogeneous - Crack section",
  homogeneous_random: "Homogeneous - Random",
};

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
  school_year: string;
  section_type?: SectionType | null;
  enrolledMale: number;
  enrolledFemale: number;
}

interface Props {
  form: UseFormReturn<EnrollmentFormType>;
  sections: SectionOption[];
  isSubmitting: boolean;
  entryMode: StudentEntryMode;
  lookupResult: LrnLookupResult | null;
  studentName: string;
  studentLrn: string;
  studentPreviousGpa: number | null | undefined;
  thresholds: GpaThresholds;
  onGradeLevelChange: (level: number) => void;
}

export default function EnrollmentDetailsStep({
  form,
  sections,
  isSubmitting,
  entryMode,
  lookupResult,
  studentName,
  studentLrn,
  studentPreviousGpa,
  thresholds,
  onGradeLevelChange,
}: Props) {
  const gradeLevel = form.watch("grade_level");
  const studentId = form.watch("student_id");
  const disabled = isSubmitting;

  const suggestedSectionType = getSuggestedSectionType(
    studentPreviousGpa,
    thresholds
  );

  return (
    <div className="space-y-6">
      {/* Student summary header */}
      <div className="rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Enrolling:</span>
          <span className="font-semibold">{studentName}</span>
          <span className="text-muted-foreground">({studentLrn})</span>
          {entryMode === "transferee" && lookupResult?.current_school_name && (
            <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
              Transferee from {lookupResult.current_school_name}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="grade_level"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel className="text-sm font-medium flex items-center gap-2 mb-2">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                Grade Level <span className="text-destructive">*</span>
              </FormLabel>
              <Select
                onValueChange={(value) => {
                  const level = parseInt(value);
                  field.onChange(level);
                  form.setValue("section_id", "");
                  form.clearErrors("semester");
                  if (level >= SENIOR_HIGH_GRADE_MIN && level <= SENIOR_HIGH_GRADE_MAX) {
                    form.setValue("semester", 1);
                  } else {
                    form.setValue("semester", null);
                  }
                  onGradeLevelChange(level);
                }}
                value={field.value?.toString()}
                disabled={disabled}
              >
                <FormControl>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select grade level" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {GRADE_LEVELS.map((level) => (
                    <SelectItem key={level} value={level.toString()}>
                      {getGradeLevelLabel(level)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* School year is auto-detected from the selected section */}

        {gradeLevel >= SENIOR_HIGH_GRADE_MIN &&
          gradeLevel <= SENIOR_HIGH_GRADE_MAX && (
            <FormField
              control={form.control}
              name="semester"
              render={({ field }) => (
                <FormItem className="flex flex-col sm:col-span-2">
                  <FormLabel className="text-sm font-medium flex items-center gap-2 mb-2">
                    Semester <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(parseInt(value));
                      form.setValue("section_id", "");
                    }}
                    value={field.value?.toString() ?? ""}
                    disabled={disabled}
                  >
                    <FormControl>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select semester" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="1">Semester 1</SelectItem>
                      <SelectItem value="2">Semester 2</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
      </div>

      <FormField
        control={form.control}
        name="section_id"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel className="text-sm font-medium flex items-center gap-2 mb-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              Section <span className="text-destructive">*</span>
            </FormLabel>
            <Select
              onValueChange={(value) => {
                field.onChange(value);
                const selected = sections.find((s) => String(s.id) === value);
                if (selected?.school_year) {
                  form.setValue("school_year", selected.school_year);
                }
              }}
              value={field.value}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {sections.length === 0 ? (
                  <div className="py-6 text-center">
                    <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No sections available for {getGradeLevelLabel(gradeLevel)}.
                    </p>
                  </div>
                ) : (
                  sections.map((section) => (
                    <SelectItem key={section.id} value={String(section.id)}>
                      <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span>
                          {section.name}
                          {section.section_type
                            ? ` (${SECTION_TYPE_LABELS[section.section_type] ?? section.section_type})`
                            : ""}
                          {` — ${section.school_year}`}
                        </span>
                        <span className="text-muted-foreground text-xs font-normal tabular-nums">
                          M: {section.enrolledMale} · F: {section.enrolledFemale}
                        </span>
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <FormMessage />
            {!Number.isFinite(form.watch("grade_level")) && (
              <p className="text-xs text-muted-foreground mt-1">
                Please select a grade level first
              </p>
            )}
            {/* GPA recommendation */}
            {gradeLevel > GRADE_LEVEL_MIN &&
              studentId &&
              studentPreviousGpa != null &&
              suggestedSectionType && (
                <div className="mt-2 rounded-lg bg-green-100 dark:bg-green-900/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">
                    {getGradeLevelLabel(gradeLevel - 1)} GPA:{" "}
                    <span className="font-medium text-foreground">
                      {studentPreviousGpa.toFixed(2)}
                    </span>
                  </span>
                  <br />
                  <span className="font-medium text-green-800 dark:text-green-200">
                    Suggested Section: {suggestedSectionType}
                  </span>
                </div>
              )}
            {gradeLevel > GRADE_LEVEL_MIN &&
              studentId &&
              entryMode === "transferee" && (
                <div className="mt-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">
                    GPA from previous school will be available after record transfer is accepted.
                  </span>
                </div>
              )}
            {gradeLevel > GRADE_LEVEL_MIN &&
              studentId &&
              entryMode !== "transferee" &&
              studentPreviousGpa == null && (
                <div className="mt-2 rounded-lg bg-green-100 dark:bg-green-900/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">
                    {getGradeLevelLabel(gradeLevel - 1)}: no previous GPA data found
                  </span>
                </div>
              )}
          </FormItem>
        )}
      />
    </div>
  );
}
