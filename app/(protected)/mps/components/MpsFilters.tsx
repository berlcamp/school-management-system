"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GRADE_LEVELS, getGradeLevelLabel } from "@/lib/constants";
import {
  getGradingPeriodType,
  getGradingPeriods,
} from "@/lib/utils/schoolYear";
import { Filter, X } from "lucide-react";

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
}

interface SubjectOption {
  id: string;
  name: string;
  grade_level: number;
}

export interface MpsFilterValue {
  schoolYear: string;
  gradeLevel: string; // "" = all
  sectionId: string; // "" = all
  subjectId: string; // "" = all
  quarter: string; // "" = all, else grading period "1".."4" (terms: "1".."3")
}

interface MpsFiltersProps {
  value: MpsFilterValue;
  onChange: (value: MpsFilterValue) => void;
  schoolYearOptions: string[];
  sectionOptions: SectionOption[];
  subjectOptions: SubjectOption[];
  /** section_id → list of subject_ids scheduled for that section in the current school year */
  sectionSubjectMap?: Record<string, string[]>;
  onAddClick?: () => void;
  canAdd?: boolean;
  onExportClick?: () => void;
}

export function MpsFilters({
  value,
  onChange,
  schoolYearOptions,
  sectionOptions,
  subjectOptions,
  sectionSubjectMap,
  onAddClick,
  canAdd,
  onExportClick,
}: MpsFiltersProps) {
  const update = (patch: Partial<MpsFilterValue>) =>
    onChange({ ...value, ...patch });

  // Grading period is term-based (3 terms) for MATATAG school years, else 4 quarters.
  const periods = getGradingPeriods(value.schoolYear);
  const periodNoun =
    getGradingPeriodType(value.schoolYear) === "term" ? "Term" : "Quarter";
  const periodNounPlural = `${periodNoun.toLowerCase()}s`;

  const filteredSections = value.gradeLevel
    ? sectionOptions.filter((s) => s.grade_level === Number(value.gradeLevel))
    : sectionOptions;

  const subjectIdsForSection =
    value.sectionId && sectionSubjectMap
      ? new Set(sectionSubjectMap[value.sectionId] ?? [])
      : null;

  const filteredSubjects = subjectOptions.filter((s) => {
    if (value.gradeLevel && s.grade_level !== Number(value.gradeLevel)) {
      return false;
    }
    if (subjectIdsForSection && !subjectIdsForSection.has(s.id)) {
      return false;
    }
    return true;
  });

  const activeCount = [
    value.gradeLevel,
    value.sectionId,
    value.subjectId,
    value.quarter,
  ].filter(Boolean).length;

  const resetFilters = () =>
    update({
      gradeLevel: "",
      sectionId: "",
      subjectId: "",
      quarter: "",
    });

  return (
    <div className="rounded-lg border bg-muted/30">
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {activeCount} active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-7 px-2 text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
          {onExportClick && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExportClick}
              className="h-8"
            >
              Export
            </Button>
          )}
          {canAdd && onAddClick && (
            <Button size="sm" onClick={onAddClick} className="h-8">
              Add MPS
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 p-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">
            School Year <span className="text-red-500">*</span>
          </label>
          <Select
            value={value.schoolYear}
            onValueChange={(v) => update({ schoolYear: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select school year" />
            </SelectTrigger>
            <SelectContent>
              {schoolYearOptions.map((sy) => (
                <SelectItem key={sy} value={sy}>
                  {sy}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            Required — all records are scoped by year.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Grade Level</label>
          <Select
            value={value.gradeLevel || "all"}
            onValueChange={(v) =>
              update({
                gradeLevel: v === "all" ? "" : v,
                sectionId: "",
                subjectId: "",
              })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All grades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All grades</SelectItem>
              {GRADE_LEVELS.map((lvl) => (
                <SelectItem key={lvl} value={String(lvl)}>
                  {getGradeLevelLabel(lvl)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            Narrows Section &amp; Subject below.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Section</label>
          <Select
            value={value.sectionId || "all"}
            onValueChange={(v) =>
              update({
                sectionId: v === "all" ? "" : v,
                subjectId: "",
              })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {filteredSections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} — {getGradeLevelLabel(s.grade_level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            {value.gradeLevel
              ? `${filteredSections.length} section${filteredSections.length === 1 ? "" : "s"} in ${getGradeLevelLabel(Number(value.gradeLevel))}`
              : `${sectionOptions.length} total in SY ${value.schoolYear || "—"}`}
          </p>
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Subject</label>
          <Select
            value={value.subjectId || "all"}
            onValueChange={(v) => update({ subjectId: v === "all" ? "" : v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {filteredSubjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            {subjectIdsForSection
              ? `${filteredSubjects.length} subject${filteredSubjects.length === 1 ? "" : "s"} scheduled for selected section`
              : value.gradeLevel
                ? `${filteredSubjects.length} subject${filteredSubjects.length === 1 ? "" : "s"} in ${getGradeLevelLabel(Number(value.gradeLevel))}`
                : `${subjectOptions.length} total`}
          </p>
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">
            {periodNoun}
          </label>
          <Select
            value={value.quarter || "all"}
            onValueChange={(v) => update({ quarter: v === "all" ? "" : v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={`All ${periodNounPlural}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {periodNounPlural}</SelectItem>
              {periods.map((p) => (
                <SelectItem key={p.value} value={String(p.value)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            {periods[0].short} – {periods[periods.length - 1].short}.
          </p>
        </div>
      </div>
    </div>
  );
}
