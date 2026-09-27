"use client";

/**
 * Staff by Position / Designation — this school's own cut of the SDO report:
 * active staff per position, by sex, optionally with the names under each.
 * See lib/utils/positionSummary.ts for how positions are grouped.
 */

import {
  PositionDetail,
  PositionSummaryFootnote,
  PositionSummaryTable,
} from "@/components/reports/PositionSummaryTable";
import { useReportSchool } from "@/components/reports/ReportSchoolContext";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { generatePositionSummaryPrint } from "@/lib/pdf";
import { useAppSelector } from "@/lib/redux/hook";
import {
  buildPositionSummary,
  fetchPositionStaff,
  PositionStaff,
} from "@/lib/utils/positionSummary";
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

  const [staff, setStaff] = useState<PositionStaff[]>([]);
  const [loading, setLoading] = useState(false);
  const [withNames, setWithNames] = useState(false);

  const { settings } = useSchoolSettings(Boolean(schoolId), schoolId);

  useEffect(() => {
    let isMounted = true;
    if (!canView || !schoolId) {
      setStaff([]);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchPositionStaff(schoolId);
        if (isMounted) setStaff(data);
      } catch (err) {
        console.error("Error loading staff by position:", err);
        if (!isMounted) return;
        toast.error(
          err instanceof Error ? err.message : "Failed to load the report",
        );
        setStaff([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [canView, schoolId]);

  const summary = useMemo(() => buildPositionSummary(staff), [staff]);
  const detail: PositionDetail = withNames ? "names" : "none";

  const handlePrint = async () => {
    if (!schoolId) return;
    try {
      await generatePositionSummaryPrint({
        schoolId,
        summary,
        detail,
        preparedBy: user?.name ?? "",
        principalName: settings.principal_name,
        principalTitle: settings.principal_title,
      });
    } catch (err) {
      console.error("Error printing staff by position:", err);
      toast.error("Failed to generate PDF");
    }
  };

  if (!canView) return <ReportAccessDenied />;
  if (!schoolId) return <ReportNeedsSchool />;

  return (
    <ReportShell
      title="Staff by Position / Designation"
      description="Active staff of this school counted per position, by sex."
      onPrint={handlePrint}
      printDisabled={loading || summary.total === 0}
      filters={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : `${summary.total} staff across ${summary.groups.length} position${
                  summary.groups.length === 1 ? "" : "s"
                }.`}
          </p>
          <div className="flex items-center gap-2">
            <Switch
              id="with-names"
              checked={withNames}
              onCheckedChange={setWithNames}
            />
            <Label htmlFor="with-names" className="text-sm">
              Show names
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
      ) : summary.total === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No active staff records for this school.
        </p>
      ) : (
        <div className="space-y-4">
          <PositionSummaryTable summary={summary} detail={detail} />
          <PositionSummaryFootnote />
        </div>
      )}
    </ReportShell>
  );
}
