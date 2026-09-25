"use client";

/**
 * Absenteeism — one school's absences by sex, per grade level and section.
 * The school-level cut of /division/reports/absenteeism; same RPC (193), same
 * tables, same printable.
 */

import {
  AbsenteeismFootnote,
  AbsenteeismTable,
} from "@/components/reports/AbsenteeismTable";
import { useReportSchool } from "@/components/reports/ReportSchoolContext";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { generateAbsenteeismPrint } from "@/lib/pdf";
import { useAppSelector } from "@/lib/redux/hook";
import {
  AbsenteeismReport,
  fetchAbsenteeism,
  periodOptions,
  periodRange,
  schoolDetailRows,
  WHOLE_YEAR,
} from "@/lib/utils/absenteeism";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  ReportAccessDenied,
  ReportNeedsSchool,
  ReportShell,
  useCanViewReports,
} from "../components/ReportShell";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const canView = useCanViewReports();
  const { schoolId } = useReportSchool();

  // Always the current school year, matching the other school-level reports.
  const schoolYear = getCurrentSchoolYear();
  const periods = useMemo(() => periodOptions(schoolYear), [schoolYear]);

  const [period, setPeriod] = useState<string>(WHOLE_YEAR);
  const [withSections, setWithSections] = useState(true);
  const [report, setReport] = useState<AbsenteeismReport | null>(null);
  const [loading, setLoading] = useState(false);

  const { settings } = useSchoolSettings(Boolean(schoolId), schoolId);

  const periodLabel =
    periods.find((p) => p.value === period)?.label ?? "Whole school year";

  useEffect(() => {
    let isMounted = true;
    if (!canView || !schoolId) {
      setReport(null);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchAbsenteeism(
          schoolId,
          schoolYear,
          periodRange(period),
        );
        if (isMounted) setReport(data);
      } catch (err) {
        console.error("Error loading absenteeism report:", err);
        if (!isMounted) return;
        toast.error("Failed to load report");
        setReport(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [canView, schoolId, schoolYear, period]);

  const school = report?.schools[0];

  const handlePrint = async () => {
    if (!schoolId || !report) return;
    try {
      await generateAbsenteeismPrint({
        schoolId,
        schoolYear,
        periodLabel,
        report,
        withSections,
        preparedBy: user?.name ?? "",
        principalName: settings.principal_name,
        principalTitle: settings.principal_title,
      });
    } catch (err) {
      console.error("Error printing absenteeism report:", err);
      toast.error("Failed to generate PDF");
    }
  };

  if (!canView) return <ReportAccessDenied />;
  if (!schoolId) return <ReportNeedsSchool />;

  return (
    <ReportShell
      title="Absenteeism"
      description={`SY ${schoolYear} — learner absences by sex, per grade level and section`}
      onPrint={handlePrint}
      printDisabled={loading || !school}
      filters={
        <div className="flex flex-wrap items-end gap-4">
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
          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="with-sections"
              checked={withSections}
              onCheckedChange={setWithSections}
            />
            <Label htmlFor="with-sections" className="text-sm">
              Show sections
            </Label>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : !school ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No enrolled learners in SY {schoolYear}.
        </p>
      ) : (
        <div className="space-y-4">
          <AbsenteeismTable
            caption={`${periodLabel} — ${school.classDays} class days held`}
            labelHeader={withSections ? "Grade Level / Section" : "Grade Level"}
            rows={schoolDetailRows(school, withSections)}
          />
          <AbsenteeismFootnote />
        </div>
      )}
    </ReportShell>
  );
}
