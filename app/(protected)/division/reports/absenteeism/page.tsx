"use client";

/**
 * Absenteeism — absences by sex, per section, grade level, school and the
 * whole division, over the school year or one month. Scored by migration
 * 193's RPC on the SF2 rules; see its header.
 */

import {
  AbsenteeismFootnote,
  AbsenteeismTable,
} from "@/components/reports/AbsenteeismTable";
import {
  DivisionReportShell,
  EmptyReportState,
} from "@/components/division-reports/DivisionReportShell";
import {
  ALL_SCHOOLS,
  SchoolFilter,
  SchoolOption,
} from "@/components/division-reports/SchoolFilter";
import { SchoolYearFilter } from "@/components/division-reports/SchoolYearFilter";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { generateAbsenteeismPrint } from "@/lib/pdf";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  ABSENTEEISM_EXPORT_HEADERS,
  AbsenteeismReport,
  absenteeismExportRows,
  fetchAbsenteeism,
  gradeSummaryRows,
  periodOptions,
  periodRange,
  schoolDetailRows,
  schoolSummaryRows,
  WHOLE_YEAR,
} from "@/lib/utils/absenteeism";
import { exportCsv } from "@/lib/utils/exportCsv";
import { exportExcel } from "@/lib/utils/exportExcel";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

interface SchoolHead {
  name: string;
  position: string | null;
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);

  const [schoolId, setSchoolId] = useState<string>(ALL_SCHOOLS);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [period, setPeriod] = useState<string>(WHOLE_YEAR);
  const [withSections, setWithSections] = useState(false);

  const [report, setReport] = useState<AbsenteeismReport | null>(null);
  const [schoolHead, setSchoolHead] = useState<SchoolHead | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSchoolsLoaded = useCallback((options: SchoolOption[]) => {
    setSchools(options);
  }, []);

  const isDivisionWide = schoolId === ALL_SCHOOLS;
  const periods = useMemo(() => periodOptions(schoolYear), [schoolYear]);
  const periodLabel =
    periods.find((p) => p.value === period)?.label ?? "Whole school year";

  // A month of another school year is not a month of this one.
  useEffect(() => {
    setPeriod(WHOLE_YEAR);
  }, [schoolYear]);

  useEffect(() => {
    let isMounted = true;
    if (!schoolId) {
      setReport(null);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchAbsenteeism(
          isDivisionWide ? null : schoolId,
          schoolYear,
          periodRange(period),
        );
        if (isMounted) setReport(data);
      } catch (err) {
        if (!isMounted) return;
        toast.error(
          err instanceof Error ? err.message : "Failed to load the report",
        );
        setReport(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [schoolId, isDivisionWide, schoolYear, period]);

  // The school head of the school reported on notes the printout.
  useEffect(() => {
    let isMounted = true;
    if (!schoolId || isDivisionWide) {
      setSchoolHead(null);
      return;
    }

    supabase
      .from("sms_users")
      .select("name, position")
      .eq("school_id", Number(schoolId))
      .eq("type", "school_head")
      .eq("is_active", true)
      .limit(1)
      .then(({ data, error }) => {
        if (!isMounted || error) return;
        const head = data?.[0];
        setSchoolHead(
          head
            ? { name: head.name as string, position: head.position as string }
            : null,
        );
      });

    return () => {
      isMounted = false;
    };
  }, [schoolId, isDivisionWide]);

  const schoolName = isDivisionWide
    ? "All Schools"
    : (schools.find((s) => s.id === schoolId)?.name ?? "");

  const hasData = (report?.schools.length ?? 0) > 0;

  const handlePrint = async () => {
    if (!report) return;
    try {
      await generateAbsenteeismPrint({
        schoolId: isDivisionWide ? null : schoolId,
        schoolYear,
        periodLabel,
        report,
        withSections,
        preparedBy: user?.name ?? "",
        principalName: schoolHead?.name ?? null,
        principalTitle: schoolHead?.position ?? "School Head",
      });
    } catch (err) {
      console.error("Error printing absenteeism report:", err);
      toast.error("Failed to generate the printout");
    }
  };

  const activeFilters = [
    {
      label: isDivisionWide ? "All Schools" : `School: ${schoolName}`,
      onClear: () => setSchoolId(ALL_SCHOOLS),
    },
    {
      label: `SY ${schoolYear}`,
      onClear: () => setSchoolYear(getCurrentSchoolYear()),
    },
    ...(period !== WHOLE_YEAR
      ? [{ label: periodLabel, onClear: () => setPeriod(WHOLE_YEAR) }]
      : []),
  ];

  return (
    <DivisionReportShell
      title="Absenteeism"
      description="Learner absences by sex — per section, grade level, school and the whole division — from daily attendance."
      loading={loading}
      recordCount={report ? report.total.enrolled : undefined}
      exportDisabled={!hasData}
      onExportCsv={() =>
        report &&
        exportCsv(
          absenteeismExportRows(report, isDivisionWide),
          ABSENTEEISM_EXPORT_HEADERS(isDivisionWide),
          "absenteeism.csv",
        )
      }
      onExportExcel={() =>
        report &&
        exportExcel(
          absenteeismExportRows(report, isDivisionWide),
          "absenteeism.xlsx",
          "Absenteeism",
        )
      }
      onPrint={handlePrint}
      activeFilters={activeFilters}
      onClearFilters={() => {
        setSchoolId(ALL_SCHOOLS);
        setSchoolYear(getCurrentSchoolYear());
        setPeriod(WHOLE_YEAR);
      }}
      filterBar={
        <>
          <SchoolFilter
            value={schoolId}
            onChange={setSchoolId}
            allowAll
            onLoaded={handleSchoolsLoaded}
          />
          <SchoolYearFilter value={schoolYear} onChange={setSchoolYear} />
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-9 w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 self-end pb-2">
            <Switch
              id="with-sections"
              checked={withSections}
              onCheckedChange={setWithSections}
            />
            <Label htmlFor="with-sections" className="text-sm">
              Show sections
            </Label>
          </div>
        </>
      }
    >
      {!report || !hasData ? (
        <EmptyReportState
          message={
            loading
              ? "Loading…"
              : `No enrolled learners for SY ${schoolYear}${
                  isDivisionWide ? " in any school" : ""
                }.`
          }
        />
      ) : (
        <div className="space-y-6">
          {isDivisionWide ? (
            <>
              <AbsenteeismTable
                caption="Summary by School"
                labelHeader="School"
                rows={schoolSummaryRows(report)}
              />
              <AbsenteeismTable
                caption="Summary by Grade Level — all schools"
                labelHeader="Grade Level"
                rows={gradeSummaryRows(report)}
              />
              {withSections &&
                report.schools.map((s) => (
                  <AbsenteeismTable
                    key={s.schoolId}
                    caption={s.name}
                    labelHeader="Grade Level / Section"
                    rows={schoolDetailRows(s, true)}
                  />
                ))}
            </>
          ) : (
            report.schools.map((s) => (
              <AbsenteeismTable
                key={s.schoolId}
                caption={`${s.name} — ${s.classDays} class days`}
                labelHeader={withSections ? "Grade Level / Section" : "Grade Level"}
                rows={schoolDetailRows(s, withSections)}
              />
            ))
          )}

          <AbsenteeismFootnote />
        </div>
      )}
    </DivisionReportShell>
  );
}
