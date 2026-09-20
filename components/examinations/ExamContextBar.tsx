"use client";

/**
 * Which paper, which class, which year — asked once for the whole workspace.
 *
 * The section used to be picked separately on the Answer Sheets tab, the Scan
 * tab and the Results tab. All three wrote the same piece of state, so they
 * were three controls for one value: three chances to think they disagreed,
 * three roster queries for one roster, and no answer at all to "which class am
 * I working on" while the Answer Key tab was open.
 *
 * Pinning it here also gives the learner count a home. Printing sheets for a
 * section the system thinks is empty is a wasted trip to the printer, and the
 * count is the cheapest possible warning.
 */

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RosterSection } from "@/hooks/useExamRoster";
import { Loader2, Users } from "lucide-react";

interface ExamContextBarProps {
  /** Version, subject, grade level, grading period — the paper's identity. */
  meta: string[];
  sections: RosterSection[];
  sectionId: string;
  onSectionChange: (id: string) => void;
  sectionsLoading: boolean;
  schoolYear: string;
  schoolYearOptions: string[];
  onSchoolYearChange: (sy: string) => void;
  learnerCount: number;
  rosterLoading: boolean;
}

export function ExamContextBar({
  meta,
  sections,
  sectionId,
  onSectionChange,
  sectionsLoading,
  schoolYear,
  schoolYearOptions,
  onSchoolYearChange,
  learnerCount,
  rosterLoading,
}: ExamContextBarProps) {
  return (
    <div className="rounded-lg border bg-card">
      {meta.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3.5 py-2 text-xs text-muted-foreground">
          {meta.map((item, index) => (
            <span key={item} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden>·</span>}
              {item}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 px-3.5 py-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="exam-section" className="text-xs font-medium">
            Section
          </Label>
          <Select
            value={sectionId}
            onValueChange={onSectionChange}
            disabled={sectionsLoading}
          >
            <SelectTrigger
              id="exam-section"
              className="h-9 w-full min-w-[14rem] sm:w-64"
            >
              <SelectValue
                placeholder={
                  sectionsLoading ? "Loading sections…" : "Choose a section"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {sections.length === 0 ? (
                // An empty popover is the worst answer here: it looks broken
                // and says nothing about why there is nothing to pick.
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {sectionsLoading
                    ? "Loading sections…"
                    : `No sections for this exam's grade level in ${schoolYear}.`}
                </p>
              ) : (
                sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="exam-school-year" className="text-xs font-medium">
            School year
          </Label>
          <Select value={schoolYear} onValueChange={onSchoolYearChange}>
            <SelectTrigger id="exam-school-year" className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {schoolYearOptions.map((sy) => (
                <SelectItem key={sy} value={sy}>
                  {sy}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="flex min-h-9 items-center gap-1.5 text-xs text-muted-foreground">
          {!sectionId ? (
            sectionsLoading ? (
              "Loading your sections…"
            ) : sections.length === 0 ? (
              <span className="text-amber-700">
                No section at this school sits this exam&apos;s grade level in{" "}
                {schoolYear}. Try another school year.
              </span>
            ) : (
              "Pick the class whose sheets you are working on."
            )
          ) : rosterLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading the class list…
            </>
          ) : learnerCount === 0 ? (
            <span className="text-amber-700">
              No learners enrolled in this section for {schoolYear}.
            </span>
          ) : (
            <>
              <Users className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground tabular-nums">
                {learnerCount}
              </span>
              {learnerCount === 1 ? "learner" : "learners"} enrolled
            </>
          )}
        </p>
      </div>
    </div>
  );
}
