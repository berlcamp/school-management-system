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
import { getGradingPeriodType, getGradingPeriods } from "@/lib/utils/schoolYear";
import { Filter, X } from "lucide-react";

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
}

export interface GradeMonitoringFilterValue {
  schoolYear: string;
  gradeLevel: string; // "" = all
  sectionId: string; // "" = all
  teacher: string; // "" = all, else teacher name
  period: string; // "" = all, else grading period
  state: string; // "" = all, else EncodingState
}

interface GradeMonitoringFiltersProps {
  value: GradeMonitoringFilterValue;
  onChange: (value: GradeMonitoringFilterValue) => void;
  schoolYearOptions: string[];
  sectionOptions: SectionOption[];
  teacherOptions: string[];
  onExportClick?: () => void;
}

export function GradeMonitoringFilters({
  value,
  onChange,
  schoolYearOptions,
  sectionOptions,
  teacherOptions,
  onExportClick,
}: GradeMonitoringFiltersProps) {
  const update = (patch: Partial<GradeMonitoringFilterValue>) =>
    onChange({ ...value, ...patch });

  const periods = getGradingPeriods(value.schoolYear);
  const periodNoun =
    getGradingPeriodType(value.schoolYear) === "term" ? "Term" : "Quarter";
  const periodNounPlural = `${periodNoun.toLowerCase()}s`;

  const filteredSections = value.gradeLevel
    ? sectionOptions.filter((s) => s.grade_level === Number(value.gradeLevel))
    : sectionOptions;

  const activeCount = [
    value.gradeLevel,
    value.sectionId,
    value.teacher,
    value.period,
    value.state,
  ].filter(Boolean).length;

  const resetFilters = () =>
    update({
      gradeLevel: "",
      sectionId: "",
      teacher: "",
      period: "",
      state: "",
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
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">
            School Year <span className="text-red-500">*</span>
          </label>
          <Select
            value={value.schoolYear}
            onValueChange={(v) => update({ schoolYear: v, period: "" })}
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
              update({ gradeLevel: v === "all" ? "" : v, sectionId: "" })
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
            Narrows Section below.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Section</label>
          <Select
            value={value.sectionId || "all"}
            onValueChange={(v) => update({ sectionId: v === "all" ? "" : v })}
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
          <label className="text-sm font-medium mb-1.5 block">Teacher</label>
          <Select
            value={value.teacher || "all"}
            onValueChange={(v) => update({ teacher: v === "all" ? "" : v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All teachers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teachers</SelectItem>
              {teacherOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            Teachers assigned in Schedules.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">{periodNoun}</label>
          <Select
            value={value.period || "all"}
            onValueChange={(v) => update({ period: v === "all" ? "" : v })}
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

        <div>
          <label className="text-sm font-medium mb-1.5 block">Status</label>
          <Select
            value={value.state || "all"}
            onValueChange={(v) => update({ state: v === "all" ? "" : v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            Matches any {periodNoun.toLowerCase()} in the row.
          </p>
        </div>
      </div>
    </div>
  );
}
