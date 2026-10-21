"use client";

import {
  BreakdownRow,
  DashboardHeader,
  EmptyState,
  LegendItem,
  Panel,
  RowsSkeleton,
  SEX_BAR,
  StatTile,
  type Tone,
} from "@/components/dashboards/DashboardKit";
import { Skeleton } from "@/components/ui/skeleton";
import { useRegionAccess } from "@/hooks/useRegionAccess";
import { supabase } from "@/lib/supabase/client";
import {
  ENROLLMENT_STATUS_COLORS,
  ENROLLMENT_STATUS_LABELS,
  getCurrentSchoolYear,
} from "@/lib/dashboard-utils";
import { NON_STAFF_USER_TYPES } from "@/lib/constants";
import { TEST_SCHOOL_ID_FILTER } from "@/lib/constants/landing";
import {
  PUBLIC_GRADE_LEVELS,
  fetchPublicEnrollmentCounts,
} from "@/lib/utils/publicEnrollment";
import { useAppSelector } from "@/lib/redux/hook";
import {
  BarChart3,
  Building2,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutGrid,
  School,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface SchoolStudentCount {
  school_id: string;
  school_name: string;
  count: number;
}

interface StaffByType {
  type: string;
  count: number;
  label: string;
}

interface Form137Status {
  status: string;
  count: number;
}

const STAFF_TYPE_LABELS: Record<string, string> = {
  teacher: "Teachers",
  school_head: "School Heads",
  assistant_school_head: "Assistant School Principals",
  registrar: "Registrars",
  admin: "Admins",
  librarian: "Librarians",
  guidance_counselor: "Guidance Counselors",
  school_nurse: "School Nurses",
  accounting: "Accounting",
  security_guard: "Security Guards",
  utility_worker: "Utility Workers",
};

const STAFF_PIE_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
];

function getGradeLabel(grade: number): string {
  if (grade === -1) return "SNED";
  if (grade === 0) return "K";
  return `G${grade}`;
}

/**
 * Lifecycle statuses charted in the status breakdown. Counted one exact query
 * each rather than by tallying rows in the browser — see fetchDashboardData.
 */
const LIFECYCLE_STATUSES = Object.keys(ENROLLMENT_STATUS_COLORS);

/** School-level staff types the pie breaks down; division roles are excluded. */
const STAFF_TYPES = Object.keys(STAFF_TYPE_LABELS);

/**
 * Head-count query for school-level staff, shared by the total and each slice.
 * Inactive staff (set Inactive on /staff) are not counted.
 */
function buildStaffQuery() {
  return supabase
    .from("sms_users")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true)
    .neq("type", "division_admin")
    .neq("type", "division_type")
    .neq("type", "super admin")
    .neq("type", "region_account")
    .not("type", "in", `(${NON_STAFF_USER_TYPES.join(",")})`);
}

export function DivisionDashboard() {
  const user = useAppSelector((state) => state.user.user);
  const [schoolsCount, setSchoolsCount] = useState(0);
  const [usersCount, setUsersCount] = useState(0);
  const [studentsCount, setStudentsCount] = useState(0);
  const [sectionsCount, setSectionsCount] = useState(0);
  const [studentsBySchool, setStudentsBySchool] = useState<SchoolStudentCount[]>(
    [],
  );
  const [staffByType, setStaffByType] = useState<StaffByType[]>([]);
  const [enrollmentByStatus, setEnrollmentByStatus] = useState<
    { status: string; count: number }[]
  >([]);
  const [enrollmentByGrade, setEnrollmentByGrade] = useState<
    { grade: number; label: string; Male: number; Female: number }[]
  >([]);
  const [form137Status, setForm137Status] = useState<Form137Status[]>([]);
  const [schoolYear] = useState(getCurrentSchoolYear());
  const [loading, setLoading] = useState(true);
  // A Region Account (214) sees only the sections a super admin switched on;
  // every other role sees them all.
  const { isRegion, loading: accessLoading, canView } = useRegionAccess();
  const showSummary = canView("dashboard:summary");
  const showByGrade = canView("dashboard:enrollment-by-grade");
  const showBySchool = canView("dashboard:learners-by-school");
  const showByRole = canView("dashboard:personnel-by-role");
  const showStatus = canView("dashboard:enrollment-status");
  const showRequests = canView("dashboard:document-requests");
  const showsNothing =
    !showSummary &&
    !showByGrade &&
    !showBySchool &&
    !showByRole &&
    !showStatus &&
    !showRequests;

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // Test schools are dropped here as well. TEST_SCHOOL_IDS' own comment
      // says they belong in no dashboard statistic, and the learner counts
      // below come from an RPC that already excludes them (141) — leaving them
      // in the school count would make this card describe a different set of
      // schools from every other figure on the page.
      const { count: schoolsCnt } = await supabase
        .from("sms_schools")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .not("id", "in", TEST_SCHOOL_ID_FILTER);
      setSchoolsCount(schoolsCnt ?? 0);

      const { data: schools } = await supabase
        .from("sms_schools")
        .select("id, name")
        .eq("is_active", true)
        .not("id", "in", TEST_SCHOOL_ID_FILTER);
      const schoolMap = new Map<string, string>();
      schools?.forEach((s) => schoolMap.set(String(s.id), s.name));

      // Exact counts, one query per staff type. The previous version pulled the
      // rows and tallied them, so the pie was built from the first 1000 staff
      // and undercounted every type once the division passed that — the same
      // row-cap trap as the learner figures. `usersCnt` was always exact, which
      // is why the headline total and the pie disagreed with each other.
      const staffCount = async (
        apply: (
          q: ReturnType<typeof buildStaffQuery>,
        ) => ReturnType<typeof buildStaffQuery>,
      ) => (await apply(buildStaffQuery())).count ?? 0;

      const [usersCnt, ...typeCounts] = await Promise.all([
        staffCount((q) => q),
        ...STAFF_TYPES.map((type) =>
          staffCount((q) => q.eq("type", type)),
        ),
      ]);
      setUsersCount(usersCnt);

      const known: StaffByType[] = STAFF_TYPES.map((type, i) => ({
        type,
        count: typeCounts[i] ?? 0,
        label: STAFF_TYPE_LABELS[type] || type,
      })).filter((t) => t.count > 0);

      // Anything not in the label map still exists and still belongs in the
      // total, so it is shown rather than silently dropped.
      const other = usersCnt - known.reduce((sum, t) => sum + t.count, 0);
      setStaffByType(
        [
          ...known,
          ...(other > 0 ? [{ type: "other", count: other, label: "Other" }] : []),
        ].sort((a, b) => b.count - a.count),
      );

      // Learner figures come from the SAME source as the public landing page —
      // `public_enrollment_counts` (migration 141) via fetchPublicEnrollmentCounts
      // — so the two cannot disagree. Reading sms_students here was wrong four
      // ways at once: the response is subject to PostgREST's row cap so
      // `students.length` silently stopped at 1000 while the division has
      // ~12,000 learners; it counted every learner ever recorded rather than
      // those enrolled this school year; it keyed on sms_students.school_id
      // rather than where the learner actually is (migration 109); and it
      // included the test schools the landing page drops.
      const counts = await fetchPublicEnrollmentCounts(schoolYear);

      const countsBySchool = new Map<string, number>();
      const gradeTotals = new Map<number, { Male: number; Female: number }>();
      let learnerTotal = 0;

      for (const c of counts) {
        const learners = c.male + c.female;
        learnerTotal += learners;

        const sid = String(c.school_id);
        countsBySchool.set(sid, (countsBySchool.get(sid) || 0) + learners);

        const bucket = gradeTotals.get(c.grade_level) ?? { Male: 0, Female: 0 };
        bucket.Male += c.male;
        bucket.Female += c.female;
        gradeTotals.set(c.grade_level, bucket);
      }

      setStudentsCount(learnerTotal);
      setStudentsBySchool(
        Array.from(countsBySchool.entries())
          .map(([schoolId, count]) => ({
            school_id: schoolId,
            school_name: schoolMap.get(schoolId) || schoolId,
            count,
          }))
          .sort((a, b) => b.count - a.count),
      );
      // PUBLIC_GRADE_LEVELS, not 0..12: SNED (-1) carries real learners and the
      // landing page charts it, so omitting it here was a second way the two
      // disagreed.
      setEnrollmentByGrade(
        PUBLIC_GRADE_LEVELS.map((grade) => ({
          grade,
          label: getGradeLabel(grade),
          Male: gradeTotals.get(grade)?.Male ?? 0,
          Female: gradeTotals.get(grade)?.Female ?? 0,
        })),
      );

      const { count: sectionsCnt } = await supabase
        .from("sms_sections")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .not("school_id", "in", TEST_SCHOOL_ID_FILTER);
      setSectionsCount(sectionsCnt ?? 0);

      // One exact count per lifecycle status. Tallying the rows in the browser
      // capped this at 1000 like everything else above, so the pie showed the
      // shape of the first page of enrolments rather than of the division.
      //
      // `semester is null or semester = 1` collapses an SHS learner's two
      // semester rows (migration 028) to one head. The residual trade is a
      // learner who enrolled only in the second semester, who is not counted
      // — unavoidable from a row count, and the reason the learner totals
      // above go through the RPC instead.
      const statusResults = await Promise.all(
        LIFECYCLE_STATUSES.map(async (status) => {
          const { count } = await supabase
            .from("sms_enrollments")
            .select("*", { count: "exact", head: true })
            .eq("status", "approved")
            .eq("school_year", schoolYear)
            .eq("enrollment_status", status)
            .or("semester.is.null,semester.eq.1")
            .not("school_id", "in", TEST_SCHOOL_ID_FILTER);
          return { status, count: count ?? 0 };
        }),
      );
      setEnrollmentByStatus(
        statusResults
          .filter((s) => s.count > 0)
          .sort((a, b) => b.count - a.count),
      );

      const { data: form137 } = await supabase
        .from("sms_requests")
        .select("status");
      const requestStatusCounts = new Map<string, number>();
      form137?.forEach((f) => {
        const s = f.status || "unknown";
        requestStatusCounts.set(s, (requestStatusCounts.get(s) || 0) + 1);
      });
      setForm137Status(
        Array.from(requestStatusCounts.entries())
          .map(([status, count]) => ({ status, count }))
          .sort((a, b) => b.count - a.count),
      );
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [schoolYear]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const totalStaffForPie = staffByType.reduce((s, t) => s + t.count, 0);
  const totalForm137 = form137Status.reduce((s, f) => s + f.count, 0);
  const enrollmentTotal = enrollmentByStatus.reduce(
    (s, x) => s + x.count,
    0,
  );

  const topStudentsBySchool = studentsBySchool.slice(0, 8).map((s) => ({
    ...s,
    displayName:
      s.school_name.length > 22
        ? s.school_name.slice(0, 20) + "…"
        : s.school_name,
  }));


  const kpiTiles: {
    title: string;
    value: number;
    icon: typeof Building2;
    desc: string;
    tone: Tone;
  }[] = [
    {
      title: "Schools",
      value: schoolsCount,
      icon: Building2,
      desc: "Active schools in division",
      tone: "emerald",
    },
    {
      title: "Personnel",
      value: usersCount,
      icon: Users,
      desc: "Teaching & non-teaching",
      tone: "sky",
    },
    {
      title: "Learners",
      value: studentsCount,
      icon: GraduationCap,
      desc: "Enrolled across schools",
      tone: "violet",
    },
    {
      title: "Sections",
      value: sectionsCount,
      icon: LayoutGrid,
      desc: "Active class sections",
      tone: "amber",
    },
  ];

  // Drawing scale only: the tallest single bar in each chart.
  const maxGradeBar = Math.max(
    1,
    ...enrollmentByGrade.map((g) => Math.max(g.Male, g.Female)),
  );
  const maxSchoolBar = Math.max(1, ...topStudentsBySchool.map((s) => s.count));
  const gradeColumns = `repeat(${Math.max(enrollmentByGrade.length, 1)}, minmax(0, 1fr))`;

  return (
    <div className="space-y-6">
      <DashboardHeader
        title={user?.name ? `Welcome, ${user.name}` : "Division dashboard"}
        context={`Schools Division of Bayugan City · Division-wide overview for SY ${schoolYear}`}
      />

      {isRegion && !accessLoading && showsNothing && (
        <div className="rounded-xl border bg-card">
          <EmptyState className="py-16">
            No dashboard data has been made available to your account yet.
          </EmptyState>
        </div>
      )}

      {/* Headline figures */}
      {showSummary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpiTiles.map((item) => (
            <StatTile
              key={item.title}
              label={item.title}
              value={item.value}
              hint={item.desc}
              icon={item.icon}
              tone={item.tone}
              loading={loading}
            />
          ))}
        </div>
      )}

      {/* Enrollment by grade — full width */}
      {showByGrade && (
        <Panel
          title="Enrollment by grade level"
          description={`SY ${schoolYear} · approved enrollments, by sex`}
          icon={BarChart3}
          action={
            <div className="hidden items-center gap-3 sm:flex">
              <LegendItem className={SEX_BAR.male}>Male</LegendItem>
              <LegendItem className={SEX_BAR.female}>Female</LegendItem>
            </div>
          }
        >
          {loading ? (
            <div className="overflow-x-auto">
              <div
                className="grid h-56 min-w-[560px] items-end gap-1.5"
                style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}
              >
                {Array.from({ length: 14 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="w-full rounded-t"
                    style={{ height: `${50 + (i % 4) * 12}%` }}
                  />
                ))}
              </div>
            </div>
          ) : enrollmentByGrade.some((g) => g.Male > 0 || g.Female > 0) ? (
            <figure>
              <div className="overflow-x-auto pb-1">
                <div
                  className="grid h-56 min-w-[560px] gap-1 sm:gap-2"
                  style={{
                    gridTemplateColumns: gradeColumns,
                    gridTemplateRows: "1fr",
                  }}
                  role="img"
                  aria-label={`Enrollment by grade level: ${enrollmentByGrade
                    .filter((g) => g.Male + g.Female > 0)
                    .map(
                      (g) =>
                        `${g.label} ${g.Male.toLocaleString()} male, ${g.Female.toLocaleString()} female`,
                    )
                    .join("; ")}`}
                >
                  {enrollmentByGrade.map((g) => (
                    <div
                      key={g.grade}
                      className="flex h-full flex-col items-center"
                    >
                      <div className="flex w-full flex-1 items-end gap-[2px]">
                        <div
                          className={`min-h-[3px] flex-1 rounded-t-sm ${SEX_BAR.male}`}
                          style={{
                            height: `${Math.max((g.Male / maxGradeBar) * 100, 2)}%`,
                          }}
                          title={`${g.label} · Male: ${g.Male.toLocaleString()}`}
                        />
                        <div
                          className={`min-h-[3px] flex-1 rounded-t-sm ${SEX_BAR.female}`}
                          style={{
                            height: `${Math.max((g.Female / maxGradeBar) * 100, 2)}%`,
                          }}
                          title={`${g.label} · Female: ${g.Female.toLocaleString()}`}
                        />
                      </div>
                      <span className="mt-1.5 text-xs font-medium text-muted-foreground">
                        {g.label}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {(g.Male + g.Female).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <figcaption className="mt-3 flex items-center gap-3 sm:hidden">
                <LegendItem className={SEX_BAR.male}>Male</LegendItem>
                <LegendItem className={SEX_BAR.female}>Female</LegendItem>
              </figcaption>
            </figure>
          ) : (
            <EmptyState icon={BarChart3}>
              No approved enrollments recorded for SY {schoolYear} yet.
            </EmptyState>
          )}
        </Panel>
      )}

      {/* Learners by school + personnel by role */}
      {(showBySchool || showByRole) && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          {showBySchool && (
            <Panel
              title="Learners by school"
              description="Top 8 schools by enrolled learners"
              icon={School}
              className={showByRole ? "xl:col-span-3" : "xl:col-span-5"}
              bodyClassName="p-0"
            >
              {loading ? (
                <RowsSkeleton rows={6} className="p-5" />
              ) : topStudentsBySchool.length > 0 ? (
                <div className="max-h-[28rem] overflow-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      Top 8 schools by enrolled learners, SY {schoolYear}
                    </caption>
                    <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[inset_0_-1px_0] shadow-border">
                      <tr>
                        <th scope="col" className="w-10 py-2.5 pl-5 pr-2 text-right font-medium">
                          #
                        </th>
                        <th scope="col" className="px-3 py-2.5 text-left font-medium">
                          School
                        </th>
                        <th scope="col" className="hidden w-1/3 px-3 py-2.5 text-left font-medium md:table-cell">
                          <span className="sr-only">Share of the largest school</span>
                        </th>
                        <th scope="col" className="w-24 px-5 py-2.5 text-right font-medium">
                          Learners
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topStudentsBySchool.map((s, i) => (
                        <tr
                          key={s.school_id}
                          className="border-b last:border-0 hover:bg-muted/40"
                        >
                          <td className="py-2.5 pl-5 pr-2 text-right text-xs tabular-nums text-muted-foreground">
                            {i + 1}
                          </td>
                          <th
                            scope="row"
                            className="max-w-[14rem] truncate px-3 py-2.5 text-left font-normal text-foreground sm:max-w-none sm:whitespace-normal"
                            title={s.school_name}
                          >
                            {s.school_name}
                          </th>
                          <td className="hidden px-3 py-2.5 md:table-cell">
                            <div
                              className="h-1.5 overflow-hidden rounded-full bg-muted"
                              aria-hidden="true"
                            >
                              <div
                                className="h-full rounded-full bg-violet-500"
                                style={{
                                  width: `${(s.count / maxSchoolBar) * 100}%`,
                                }}
                              />
                            </div>
                          </td>
                          <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                            {s.count.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={School}>
                  No school has enrolled learners for SY {schoolYear} yet.
                </EmptyState>
              )}
            </Panel>
          )}

          {showByRole && (
            <Panel
              title="Personnel by role"
              description={
                loading
                  ? "Active staff across the division"
                  : `${totalStaffForPie.toLocaleString()} active staff across the division`
              }
              icon={Users}
              className={showBySchool ? "xl:col-span-2" : "xl:col-span-5"}
            >
              {loading ? (
                <RowsSkeleton rows={6} />
              ) : staffByType.length > 0 ? (
                <ul
                  className="space-y-3.5"
                  aria-label="Active personnel by role"
                >
                  {staffByType.map((t, idx) => (
                    <BreakdownRow
                      key={t.type}
                      label={t.label}
                      count={t.count}
                      total={totalStaffForPie}
                      color={STAFF_PIE_COLORS[idx % STAFF_PIE_COLORS.length]}
                    />
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Users}>
                  No active school personnel are recorded yet.
                </EmptyState>
              )}
            </Panel>
          )}
        </div>
      )}

      {/* Enrollment status + document requests */}
      {(showStatus || showRequests) && (
        <div
          className={`grid grid-cols-1 gap-6 ${showStatus && showRequests ? "md:grid-cols-2" : ""}`}
        >
          {showStatus && (
            <Panel
              title="Enrollment status"
              // Not a learner count: this card shows every lifecycle status,
              // so its total includes transferred-out and dropped learners
              // that the Learners tile (on the roll only) leaves out. Labelled
              // so the two are not read as contradicting each other.
              description={`SY ${schoolYear} · ${enrollmentTotal.toLocaleString()} enrollment records, including learners who have since left`}
              icon={ClipboardList}
            >
              {loading ? (
                <RowsSkeleton />
              ) : enrollmentByStatus.length > 0 ? (
                <ul className="space-y-3.5">
                  {enrollmentByStatus.map((s) => (
                    <BreakdownRow
                      key={s.status}
                      label={ENROLLMENT_STATUS_LABELS[s.status] ?? s.status}
                      count={s.count}
                      total={enrollmentTotal}
                      color={
                        ENROLLMENT_STATUS_COLORS[s.status] ?? "rgb(148 163 184)"
                      }
                    />
                  ))}
                </ul>
              ) : (
                <EmptyState icon={ClipboardList}>
                  No approved enrollment records for SY {schoolYear} yet.
                </EmptyState>
              )}
            </Panel>
          )}

          {showRequests && (
            <Panel
              title="Document requests"
              description={`${totalForm137.toLocaleString()} total Form 137 / record requests`}
              icon={FileText}
            >
              {loading ? (
                <RowsSkeleton rows={3} />
              ) : form137Status.length > 0 ? (
                <ul className="space-y-3.5">
                  {form137Status.map((f) => (
                    <BreakdownRow
                      key={f.status}
                      label={<span className="capitalize">{f.status}</span>}
                      count={f.count}
                      total={totalForm137}
                      tone={
                        f.status === "pending"
                          ? "amber"
                          : f.status === "completed"
                            ? "emerald"
                            : f.status === "approved"
                              ? "sky"
                              : "slate"
                      }
                    />
                  ))}
                </ul>
              ) : (
                <EmptyState icon={FileText}>
                  No Form 137 or document requests have been recorded.
                </EmptyState>
              )}
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
