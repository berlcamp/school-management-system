"use client";

/**
 * Employee Specialization — this school's own cut of the division report.
 * Pinned to the active school by ReportSchoolContext (164).
 */

import { EmployeeSpecializationView } from "@/components/reports/EmployeeSpecializationView";
import { useReportSchool } from "@/components/reports/ReportSchoolContext";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { generateEmployeeSpecializationPrint } from "@/lib/pdf";
import { useAppSelector } from "@/lib/redux/hook";
import {
  SpecializationStaff,
  fetchSpecializationStaff,
} from "@/lib/utils/employeeSpecialization";
import { useEffect, useState } from "react";
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
  const [staff, setStaff] = useState<SpecializationStaff[]>([]);
  const [loading, setLoading] = useState(false);
  const [withRoster, setWithRoster] = useState(true);
  const { settings } = useSchoolSettings(Boolean(schoolId), schoolId);

  useEffect(() => {
    let isMounted = true;
    if (!canView || !schoolId) {
      setStaff([]);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const data = await fetchSpecializationStaff(schoolId);
        if (isMounted) setStaff(data);
      } catch (err) {
        console.error("Error loading employee specialization:", err);
        if (!isMounted) return;
        toast.error(err instanceof Error ? err.message : "Failed to load the report");
        setStaff([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [canView, schoolId]);

  if (!canView) return <ReportAccessDenied />;
  if (!schoolId) return <ReportNeedsSchool />;

  return (
    <ReportShell
      title="Employee Specialization"
      description="College major, graduate major and DepEd specialization of this school's employees, by sex."
      onPrint={async () => {
        try {
          await generateEmployeeSpecializationPrint({
            schoolId,
            staff,
            withRoster,
            preparedBy: user?.name ?? "",
            principalName: settings.principal_name,
            principalTitle: settings.principal_title,
          });
        } catch (err) {
          console.error("Error printing employee specialization:", err);
          toast.error("Failed to generate PDF");
        }
      }}
      printDisabled={loading || staff.length === 0}
      filters={
        <div className="flex items-center justify-end gap-2">
          <Switch id="with-roster" checked={withRoster} onCheckedChange={setWithRoster} />
          <Label htmlFor="with-roster" className="text-sm">Print names</Label>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : staff.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No active staff records for this school.</p>
      ) : (
        <EmployeeSpecializationView staff={staff} divisionWide={false} />
      )}
    </ReportShell>
  );
}
