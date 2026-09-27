"use client";

/**
 * Staff by Position / Designation — active personnel per position, by sex,
 * across the division or at one school. Division-wide, each position can be
 * broken down by school; at one school, by name. See
 * lib/utils/positionSummary.ts for how positions are grouped.
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
import {
  PositionDetail,
  PositionSummaryFootnote,
  PositionSummaryTable,
} from "@/components/reports/PositionSummaryTable";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { generatePositionSummaryPrint } from "@/lib/pdf";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { exportCsv } from "@/lib/utils/exportCsv";
import { exportExcel } from "@/lib/utils/exportExcel";
import {
  buildPositionSummary,
  fetchPositionStaff,
  POSITION_EXPORT_HEADERS,
  positionExportRows,
  PositionStaff,
} from "@/lib/utils/positionSummary";
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
  const [withDetail, setWithDetail] = useState(false);

  const [staff, setStaff] = useState<PositionStaff[]>([]);
  const [schoolHead, setSchoolHead] = useState<SchoolHead | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSchoolsLoaded = useCallback((options: SchoolOption[]) => {
    setSchools(options);
  }, []);

  const isDivisionWide = schoolId === ALL_SCHOOLS;

  useEffect(() => {
    let isMounted = true;
    if (!schoolId) {
      setStaff([]);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchPositionStaff(isDivisionWide ? null : schoolId);
        if (isMounted) setStaff(data);
      } catch (err) {
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
  }, [schoolId, isDivisionWide]);

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

  const summary = useMemo(() => buildPositionSummary(staff), [staff]);
  const detail: PositionDetail = !withDetail
    ? "none"
    : isDivisionWide
      ? "schools"
      : "names";

  const schoolName = isDivisionWide
    ? "All Schools"
    : (schools.find((s) => s.id === schoolId)?.name ?? "");

  const handlePrint = async () => {
    try {
      await generatePositionSummaryPrint({
        schoolId: isDivisionWide ? null : schoolId,
        summary,
        detail,
        preparedBy: user?.name ?? "",
        principalName: schoolHead?.name ?? null,
        principalTitle: schoolHead?.position ?? "School Head",
      });
    } catch (err) {
      console.error("Error printing staff by position:", err);
      toast.error("Failed to generate the printout");
    }
  };

  const activeFilters = isDivisionWide
    ? []
    : [
        {
          label: `School: ${schoolName}`,
          onClear: () => setSchoolId(ALL_SCHOOLS),
        },
      ];

  return (
    <DivisionReportShell
      title="Staff by Position / Designation"
      description="Active personnel counted per position, by sex — division-wide or for one school."
      loading={loading}
      recordCount={summary.total}
      exportDisabled={summary.total === 0}
      onExportCsv={() =>
        exportCsv(
          positionExportRows(summary),
          POSITION_EXPORT_HEADERS,
          "staff_by_position.csv",
        )
      }
      onExportExcel={() =>
        exportExcel(
          positionExportRows(summary),
          "staff_by_position.xlsx",
          "By Position",
        )
      }
      onPrint={handlePrint}
      activeFilters={activeFilters}
      onClearFilters={
        activeFilters.length > 0 ? () => setSchoolId(ALL_SCHOOLS) : undefined
      }
      filterBar={
        <>
          <SchoolFilter
            value={schoolId}
            onChange={setSchoolId}
            allowAll
            onLoaded={handleSchoolsLoaded}
          />
          <div className="flex items-center gap-2 self-end pb-2">
            <Switch
              id="with-detail"
              checked={withDetail}
              onCheckedChange={setWithDetail}
            />
            <Label htmlFor="with-detail" className="text-sm">
              {isDivisionWide ? "Break down by school" : "Show names"}
            </Label>
          </div>
        </>
      }
    >
      {summary.total === 0 ? (
        <EmptyReportState
          message={
            loading
              ? "Loading…"
              : `No active staff records${
                  isDivisionWide ? " in any school" : " for this school"
                }.`
          }
        />
      ) : (
        <div className="space-y-4">
          {isDivisionWide && (
            <p className="text-sm text-muted-foreground">
              {summary.total} staff across {summary.schoolCount} school
              {summary.schoolCount === 1 ? "" : "s"}.
            </p>
          )}
          <PositionSummaryTable summary={summary} detail={detail} />
          <PositionSummaryFootnote />
        </div>
      )}
    </DivisionReportShell>
  );
}
