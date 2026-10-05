"use client";

/**
 * Employee Specialization — every employee's college major, graduate major and
 * DepEd specialization (migration 198), by sex, division-wide or at one school,
 * with who has not answered yet. See lib/utils/employeeSpecialization.ts.
 */

import {
  DivisionReportShell,
  EmptyReportState,
} from "@/components/division-reports/DivisionReportShell";
import {
  ALL_SCHOOLS,
  SchoolFilter,
  SchoolOption,
} from "@/components/division-reports/SchoolFilter";
import { EmployeeSpecializationView } from "@/components/reports/EmployeeSpecializationView";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { generateEmployeeSpecializationPrint } from "@/lib/pdf";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { exportCsv } from "@/lib/utils/exportCsv";
import { exportExcel } from "@/lib/utils/exportExcel";
import {
  SpecializationStaff,
  fetchSpecializationStaff,
  specializationExportRows,
} from "@/lib/utils/employeeSpecialization";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [schoolId, setSchoolId] = useState<string>(ALL_SCHOOLS);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [staff, setStaff] = useState<SpecializationStaff[]>([]);
  const [loading, setLoading] = useState(false);
  const [withRoster, setWithRoster] = useState(false);
  const [schoolHead, setSchoolHead] = useState<{ name: string; position: string | null } | null>(null);

  const handleSchoolsLoaded = useCallback((options: SchoolOption[]) => setSchools(options), []);
  const isDivisionWide = schoolId === ALL_SCHOOLS;

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchSpecializationStaff(isDivisionWide ? null : schoolId);
        if (isMounted) setStaff(data);
      } catch (err) {
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
  }, [schoolId, isDivisionWide]);

  useEffect(() => {
    let isMounted = true;
    if (isDivisionWide) {
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
        setSchoolHead(head ? { name: head.name as string, position: head.position as string | null } : null);
      });
    return () => {
      isMounted = false;
    };
  }, [schoolId, isDivisionWide]);

  const schoolName = isDivisionWide ? "All Schools" : (schools.find((s) => s.id === schoolId)?.name ?? "");
  const rows = () => specializationExportRows(staff, isDivisionWide);
  const activeFilters = isDivisionWide
    ? []
    : [{ label: `School: ${schoolName}`, onClear: () => setSchoolId(ALL_SCHOOLS) }];

  return (
    <DivisionReportShell
      title="Employee Specialization"
      description="College major, graduate major and DepEd specialization of every employee, by sex — and who has not answered yet."
      loading={loading}
      recordCount={staff.length}
      exportDisabled={staff.length === 0}
      onExportCsv={() => {
        const data = rows();
        exportCsv(data, Object.keys(data[0] ?? {}), "employee_specialization.csv");
      }}
      onExportExcel={() => exportExcel(rows(), "employee_specialization.xlsx", "Employees")}
      onPrint={async () => {
        try {
          await generateEmployeeSpecializationPrint({
            schoolId: isDivisionWide ? null : schoolId,
            staff,
            withRoster,
            preparedBy: user?.name ?? "",
            principalName: schoolHead?.name ?? null,
            principalTitle: schoolHead?.position ?? "School Head",
          });
        } catch (err) {
          console.error("Error printing employee specialization:", err);
          toast.error("Failed to generate the printout");
        }
      }}
      activeFilters={activeFilters}
      onClearFilters={activeFilters.length > 0 ? () => setSchoolId(ALL_SCHOOLS) : undefined}
      filterBar={
        <>
          <SchoolFilter value={schoolId} onChange={setSchoolId} allowAll onLoaded={handleSchoolsLoaded} />
          <div className="flex items-center gap-2 self-end pb-2">
            <Switch id="with-roster" checked={withRoster} onCheckedChange={setWithRoster} />
            <Label htmlFor="with-roster" className="text-sm">Print names</Label>
          </div>
        </>
      }
    >
      {staff.length === 0 ? (
        <EmptyReportState message={loading ? "Loading…" : "No active staff records."} />
      ) : (
        <EmployeeSpecializationView staff={staff} divisionWide={isDivisionWide} />
      )}
    </DivisionReportShell>
  );
}
