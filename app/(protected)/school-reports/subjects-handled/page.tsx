"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { getGradeLevelLabel } from "@/lib/constants";
import { generateSubjectsHandledPrint } from "@/lib/pdf";
import { useReportSchool } from "@/components/reports/ReportSchoolContext";
import { useCurrentPeriod } from "@/components/SchedulePeriodSelect";
import { useAppSelector } from "@/lib/redux/hook";
import {
  fetchSubjectsHandled,
  formatDays,
  formatTime,
  TeacherSubjects,
} from "@/lib/utils/subjectsHandled";
import {
  getCurrentSchoolYear,
  getGradingPeriodLabel,
} from "@/lib/utils/schoolYear";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  ALL_TEACHERS,
  ReportFilters,
} from "../components/ReportFilters";
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

  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [period, setPeriod] = useState(1);
  // Migration 222: open on the term under way, once, until the user picks one.
  const currentPeriod = useCurrentPeriod(
    schoolId != null ? Number(schoolId) : null,
    schoolYear,
  );
  const periodTouched = useRef(false);
  useEffect(() => {
    if (currentPeriod != null && !periodTouched.current) setPeriod(currentPeriod);
  }, [currentPeriod]);
  const [teacherId, setTeacherId] = useState(ALL_TEACHERS);
  const [groups, setGroups] = useState<TeacherSubjects[]>([]);
  const [loading, setLoading] = useState(false);

  const { settings } = useSchoolSettings(Boolean(schoolId), schoolId);

  useEffect(() => {
    let isMounted = true;
    if (!canView || !schoolId) {
      setGroups([]);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchSubjectsHandled(schoolId, schoolYear, period);
        if (!isMounted) return;
        setGroups(data);
      } catch (err) {
        console.error("Error loading subjects handled:", err);
        if (!isMounted) return;
        toast.error("Failed to load report");
        setGroups([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [canView, schoolId, schoolYear, period]);

  // The teacher filter only offers names that actually appear in the report.
  const teacherOptions = useMemo(
    () => groups.map((g) => ({ id: g.teacherId, name: g.teacherName })),
    [groups],
  );

  const visibleGroups = useMemo(
    () =>
      teacherId === ALL_TEACHERS
        ? groups
        : groups.filter((g) => g.teacherId === teacherId),
    [groups, teacherId],
  );

  const periodLabel = getGradingPeriodLabel(schoolYear, period);

  const teacherLabel =
    teacherId === ALL_TEACHERS
      ? "All Teachers"
      : (teacherOptions.find((t) => t.id === teacherId)?.name ??
        "All Teachers");

  const handlePrint = async () => {
    if (!schoolId) return;
    try {
      await generateSubjectsHandledPrint({
        schoolId,
        schoolYear,
        teacherLabel: `${teacherLabel} · ${periodLabel}`,
        groups: visibleGroups,
        preparedBy: user?.name ?? "",
        principalName: settings.principal_name,
        principalTitle: settings.principal_title,
      });
    } catch (err) {
      console.error("Error printing subjects handled:", err);
      toast.error("Failed to generate PDF");
    }
  };

  if (!canView) return <ReportAccessDenied />;
  if (!schoolId) return <ReportNeedsSchool />;

  return (
    <ReportShell
      title="Subjects Handled by Teacher"
      description={`SY ${schoolYear} · ${periodLabel} — scheduled subjects per teacher`}
      onPrint={handlePrint}
      printDisabled={loading || visibleGroups.length === 0}
      filters={
        <ReportFilters
          schoolYear={schoolYear}
          onSchoolYearChange={(sy) => {
            setSchoolYear(sy);
            periodTouched.current = false;
            setPeriod(1);
          }}
          period={period}
          onPeriodChange={(p) => {
            periodTouched.current = true;
            setPeriod(p);
          }}
          teacherId={teacherId}
          onTeacherChange={setTeacherId}
          teacherOptions={teacherOptions}
        />
      }
    >
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : visibleGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No subject schedules found for SY {schoolYear}.
        </p>
      ) : (
        <div className="space-y-6">
          {visibleGroups.map((group) => (
            <div key={group.teacherId}>
              <h3 className="text-sm font-semibold mb-2">
                {group.teacherName}
              </h3>
              <div className="app__table_shell">
                <div className="app__table_wrapper">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left font-medium w-8">#</th>
                        <th className="text-left font-medium">
                          Subject
                        </th>
                        <th className="text-left font-medium">Grade</th>
                        <th className="text-left font-medium">
                          Section
                        </th>
                        <th className="text-left font-medium">Days</th>
                        <th className="text-left font-medium">Time</th>
                        <th className="text-left font-medium">Room</th>
                        <th className="text-right font-medium">
                          Min/Wk
                        </th>
                        <th className="text-right font-medium">
                          Learners
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((r, i) => (
                        <tr key={r.scheduleId}>
                          <td className="text-muted-foreground">
                            {i + 1}
                          </td>
                          <td className="font-medium">
                            {r.subjectName}
                            {r.termsLabel && (
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                ({r.termsLabel})
                              </span>
                            )}
                          </td>
                          <td>
                            {getGradeLevelLabel(r.gradeLevel)}
                          </td>
                          <td>{r.sectionName}</td>
                          <td>{formatDays(r.days)}</td>
                          <td className="whitespace-nowrap">
                            {formatTime(r.startTime)} - {formatTime(r.endTime)}
                          </td>
                          <td>{r.roomName}</td>
                          <td className="text-right">
                            {r.minutesPerWeek}
                          </td>
                          <td className="text-right">{r.learners}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/40 font-semibold">
                        <td colSpan={7}>
                          Total subjects handled: {group.rows.length}
                        </td>
                        <td className="text-right">
                          {group.totalMinutesPerWeek}
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ReportShell>
  );
}
