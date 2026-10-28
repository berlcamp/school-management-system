"use client";

import {
  BreakdownRow,
  DashboardHeader,
  EmptyState,
  LegendItem,
  MiniStat,
  Panel,
  PanelLink,
  QuickLink,
  RowsSkeleton,
  SEX_BAR,
  StatTile,
  type Tone,
} from "@/components/dashboards/DashboardKit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  NON_STAFF_USER_TYPES,
  getGradeLevelLabel,
  isNonStaffUserType,
  isTeacherRole,
} from "@/lib/constants";
import {
  ENROLLMENT_STATUS_COLORS,
  ENROLLMENT_STATUS_LABELS,
  getCurrentSchoolYear,
} from "@/lib/dashboard-utils";
import { getSchoolYearOptions } from "@/lib/utils/schoolYear";
import {
  advisorshipWeeklyMinutes,
  aralWeeklyMinutes,
  fetchTeacherLoads,
  TeacherLoad,
  teacherWeeklyTotal,
  WEEKDAYS,
} from "@/lib/utils/teachingLoad";
import { useCurrentPeriod } from "@/components/SchedulePeriodSelect";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  AlertTriangle,
  BookOpen,
  Building2,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  LayoutGrid,
  UserCheck,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { isEnrolledLifecycleStatus } from "@/lib/constants/enrollment";

interface Form137Status {
  status: string;
  count: number;
}

interface QuickAction {
  title: string;
  desc: string;
  href: string;
  icon: typeof Building2;
  tone: Tone;
}

interface SectionEnrollment {
  sectionId: string;
  sectionName: string;
  grade: number;
  count: number;
  male: number;
  female: number;
}

interface StaffBreakdown {
  teaching: number;
  nonTeaching: number;
  schoolHead: number;
  assistantSchoolHead: number;
}

export function SchoolDashboard() {
  const user = useAppSelector((state) => state.user.user);
  const [studentsCount, setStudentsCount] = useState(0);
  const [sectionsCount, setSectionsCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [enrollmentByStatus, setEnrollmentByStatus] = useState<
    { status: string; count: number }[]
  >([]);
  const [enrollmentByGrade, setEnrollmentByGrade] = useState<
    { grade: number; male: number; female: number }[]
  >([]);
  const [form137Status, setForm137Status] = useState<Form137Status[]>([]);
  const [sectionEnrollment, setSectionEnrollment] = useState<
    SectionEnrollment[]
  >([]);
  const [teacherLoads, setTeacherLoads] = useState<TeacherLoad[]>([]);
  const [loadsOutsideStaff, setLoadsOutsideStaff] = useState(0);
  const [advisory, setAdvisory] = useState<{
    withAdvisory: number;
    withoutAdvisory: number;
  }>({ withAdvisory: 0, withoutAdvisory: 0 });
  const [staffBreakdown, setStaffBreakdown] = useState<StaffBreakdown>({
    teaching: 0,
    nonTeaching: 0,
    schoolHead: 0,
    assistantSchoolHead: 0,
  });
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const schoolYearOptions = getSchoolYearOptions();
  const [loading, setLoading] = useState(true);
  const [schoolName, setSchoolName] = useState("");

  const schoolId = user?.school_id != null ? String(user.school_id) : null;
  const currentPeriod = useCurrentPeriod(
    schoolId != null ? Number(schoolId) : null,
    schoolYear,
  );

  const fetchDashboardData = useCallback(async () => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: school } = await supabase
        .from("sms_schools")
        .select("name")
        .eq("id", schoolId)
        .single();
      setSchoolName(school?.name ?? "Our School");

      const { count: sectionsCnt } = await supabase
        .from("sms_sections")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("school_year", schoolYear)
        .eq("is_active", true);
      setSectionsCount(sectionsCnt ?? 0);

      const { count: staffCnt } = await supabase
        .from("sms_users")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("is_active", true)
        .neq("type", "division_admin")
        .neq("type", "division_type")
        .not("type", "in", `(${NON_STAFF_USER_TYPES.join(",")})`);
      setStaffCount(staffCnt ?? 0);

      const { data: enrollments } = await supabase
        .from("sms_enrollments")
        .select(
          "grade_level, status, enrollment_status, section_id, student_id, student:sms_students!sms_enrollments_student_id_fkey(gender)",
        )
        .eq("school_id", schoolId)
        .eq("school_year", schoolYear);

      const statusCounts = new Map<string, number>();
      const sectionEnrollCounts = new Map<string, number>();
      // Per-section sex split. A learner whose sex is unrecorded counts in
      // `sectionEnrollCounts` but in neither column, so male + female may fall
      // short of the total — that gap is the un-encoded sex, not a lost learner.
      const sectionSexCounts = new Map<string, { male: number; female: number }>();
      const enrolledStudentIds = new Set<string>();
      const gradeCounts = Array.from({ length: 13 }, (_, i) => ({
        grade: i,
        male: 0,
        female: 0,
      }));
      enrollments?.forEach((e) => {
        if (e.status === "approved") {
          const ls = e.enrollment_status || "active";
          // The status breakdown is the one figure that WANTS every lifecycle
          // value — showing how many left is the point of it.
          statusCounts.set(ls, (statusCounts.get(ls) || 0) + 1);

          // Everything below is a headcount, and a headcount is of the roll:
          // a learner who transferred out or dropped is no longer at this
          // school. `status` is the approval workflow and was the only filter
          // here, so those learners were counted in the headline total, in the
          // grade-level bars and against the section they left — migration
          // 141's bug #2, still open on the school's own dashboard while the
          // division dashboard (which reads `public_enrollment_counts`) had it
          // right, so the two disagreed about the same school.
          if (!isEnrolledLifecycleStatus(ls)) return;

          if (e.student_id) enrolledStudentIds.add(String(e.student_id));

          const gender = (e.student as { gender?: string } | null)?.gender;

          if (e.section_id) {
            const sid = String(e.section_id);
            sectionEnrollCounts.set(sid, (sectionEnrollCounts.get(sid) || 0) + 1);
            const sex = sectionSexCounts.get(sid) ?? { male: 0, female: 0 };
            if (gender === "male") sex.male++;
            else if (gender === "female") sex.female++;
            sectionSexCounts.set(sid, sex);
          }

          const idx = e.grade_level;
          if (idx >= 0 && idx < 13) {
            if (gender === "male") gradeCounts[idx]!.male++;
            else if (gender === "female") gradeCounts[idx]!.female++;
          }
        }
      });
      setStudentsCount(enrolledStudentIds.size);
      setEnrollmentByStatus(
        Array.from(statusCounts.entries())
          .map(([status, count]) => ({ status, count }))
          .sort((a, b) => b.count - a.count),
      );
      setEnrollmentByGrade(gradeCounts);

      const { data: form137 } = await supabase
        .from("sms_requests")
        .select("status")
        .eq("school_id", schoolId);
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

      // Sections (current SY) → enrollment-per-section, advisers
      const { data: sectionsData } = await supabase
        .from("sms_sections")
        .select("id, name, grade_level, section_adviser_id")
        .eq("school_id", schoolId)
        .eq("school_year", schoolYear)
        .eq("is_active", true)
        .order("grade_level", { ascending: true })
        .order("name", { ascending: true });

      const adviserIds = new Set<string>();
      // Sections advised per teacher → advisorship load (60 min each).
      const advisoryCountByTeacher = new Map<string, number>();
      const secEnroll: SectionEnrollment[] = [];
      sectionsData?.forEach((s) => {
        if (s.section_adviser_id) {
          const aid = String(s.section_adviser_id);
          adviserIds.add(aid);
          advisoryCountByTeacher.set(
            aid,
            (advisoryCountByTeacher.get(aid) || 0) + 1,
          );
        }
        const sex = sectionSexCounts.get(String(s.id)) ?? { male: 0, female: 0 };
        secEnroll.push({
          sectionId: String(s.id),
          sectionName: s.name,
          grade: s.grade_level,
          count: sectionEnrollCounts.get(String(s.id)) || 0,
          male: sex.male,
          female: sex.female,
        });
      });
      setSectionEnrollment(secEnroll);

      // Staff → composition (teaching / non-teaching / school head / asst. head)
      const { data: staffData } = await supabase
        .from("sms_users")
        .select("id, name, type, position, is_active")
        .eq("school_id", schoolId)
        .neq("type", "division_admin")
        .neq("type", "division_type");

      const breakdown: StaffBreakdown = {
        teaching: 0,
        nonTeaching: 0,
        schoolHead: 0,
        assistantSchoolHead: 0,
      };
      // Names keyed by user id for the load table. Includes every staff type
      // (not just teachers) so ARAL tutors — who may be type "tutor" — resolve
      // to a name instead of "Unknown".
      const teacherNames = new Map<string, string>();
      const activeTeacherIds = new Set<string>();
      staffData?.forEach((u) => {
        teacherNames.set(String(u.id), u.name);
        // Volunteer teachers advise sections and carry a load, so they belong in
        // this school-facing tile. The DepEd personnel counts (071/112/118) stay
        // keyed to the plantilla `teacher` and deliberately exclude them.
        if (isTeacherRole(u.type)) {
          if (u.is_active) activeTeacherIds.add(String(u.id));
        }
        // Tutors stay in the names map above but are not school personnel.
        if (!u.is_active || isNonStaffUserType(u.type)) return;
        const pos = (u.position || "").toLowerCase();
        const isAsstHead =
          u.type === "assistant_school_head" ||
          (pos.includes("assistant") &&
            (pos.includes("head") || pos.includes("principal")));
        if (isAsstHead) breakdown.assistantSchoolHead++;
        else if (u.type === "school_head") breakdown.schoolHead++;
        else if (isTeacherRole(u.type)) breakdown.teaching++;
        else breakdown.nonTeaching++;
      });
      setStaffBreakdown(breakdown);

      // Advisory: teachers with vs. without an advisory class
      const teacherAdvisers = Array.from(adviserIds).filter((id) =>
        activeTeacherIds.has(id),
      );
      const withAdvisory = teacherAdvisers.length;
      setAdvisory({
        withAdvisory,
        withoutAdvisory: Math.max(activeTeacherIds.size - withAdvisory, 0),
      });

      // Teaching load: minutes per teacher per weekday (current SY).
      // Shared with the Reports module — see lib/utils/teachingLoad.ts.
      // The term under way, so a subject handed over between terms is not
      // counted for both teachers (222). Waits for the period to resolve.
      if (currentPeriod == null) return;
      const loadResult = await fetchTeacherLoads(schoolId, schoolYear, currentPeriod);
      setTeacherLoads(loadResult.loads);
      setLoadsOutsideStaff(loadResult.outsideStaffCount);
    } catch (error) {
      console.error("Error fetching school dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [schoolId, schoolYear, currentPeriod]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const enrollmentTotal = enrollmentByStatus.reduce(
    (s, x) => s + x.count,
    0,
  );
  const maxEnrollmentGrade = Math.max(
    ...enrollmentByGrade.map((x) => Math.max(x.male, x.female)),
    1,
  );
  const totalForm137 = form137Status.reduce((s, f) => s + f.count, 0);
  const totalStaff =
    staffBreakdown.teaching +
    staffBreakdown.nonTeaching +
    staffBreakdown.schoolHead +
    staffBreakdown.assistantSchoolHead;
  const sectionGroups = sectionEnrollment.reduce<
    Record<number, SectionEnrollment[]>
  >((acc, s) => {
    (acc[s.grade] ??= []).push(s);
    return acc;
  }, {});
  // Sex split across every section — the school-wide footer of the by-sex card.
  const sectionSexTotals = sectionEnrollment.reduce(
    (acc, s) => ({
      male: acc.male + s.male,
      female: acc.female + s.female,
      total: acc.total + s.count,
    }),
    { male: 0, female: 0, total: 0 },
  );
  // School head, admin, registrar have similar dashboard access
  const hasSchoolManagementAccess =
    user?.type === "school_head" ||
    user?.type === "assistant_school_head" ||
    user?.type === "super admin" ||
    user?.type === "admin" ||
    user?.type === "registrar";

  const quickActions: QuickAction[] = [
    {
      title: "Enrollment",
      desc: "Manage student enrollments",
      href: "/enrollment",
      icon: ClipboardList,
      tone: "sky",
    },
    {
      title: "Sections",
      desc: "Manage class sections",
      href: "/sections",
      icon: LayoutGrid,
      tone: "amber",
    },
    {
      title: "Students",
      desc: "View student records",
      href: "/students",
      icon: GraduationCap,
      tone: "emerald",
    },
    {
      title: "Schedules",
      desc: "Class schedules",
      href: "/schedules",
      icon: BookOpen,
      tone: "violet",
    },
  ];

  if (hasSchoolManagementAccess) {
    quickActions.push({
      title: "Requests",
      desc: "Manage record requests",
      href: "/manage-requests",
      icon: FileText,
      tone: "rose",
    });
  }

  if (!schoolId) {
    return (
      <EmptyState icon={Building2}>
        No school assigned. Please contact your administrator.
      </EmptyState>
    );
  }

  // Staff is managed only by the school head, assistant and admin (sidebar rule).
  const canOpenStaff =
    user?.type === "school_head" ||
    user?.type === "assistant_school_head" ||
    user?.type === "super admin" ||
    user?.type === "admin";

  return (
    <div className="space-y-6">
      <DashboardHeader
        title={schoolName || "School overview"}
        context={`School overview · SY ${schoolYear}`}
        loading={loading && !schoolName}
        actions={
          <>
            <label
              htmlFor="school-dashboard-sy"
              className="text-sm text-muted-foreground"
            >
              School year
            </label>
            <Select value={schoolYear} onValueChange={setSchoolYear}>
              <SelectTrigger id="school-dashboard-sy" className="h-10 w-[150px]">
                <SelectValue placeholder="School Year" />
              </SelectTrigger>
              <SelectContent>
                {schoolYearOptions.map((sy) => (
                  <SelectItem key={sy} value={sy}>
                    {sy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      {/* Headline figures */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Learners"
          value={studentsCount}
          hint={`Currently enrolled · SY ${schoolYear}`}
          icon={GraduationCap}
          tone="emerald"
          loading={loading}
          href="/students"
        />
        <StatTile
          label="Staff"
          value={staffCount}
          hint="Active personnel"
          icon={Users}
          tone="sky"
          loading={loading}
          href={canOpenStaff ? "/staff" : undefined}
        />
        <StatTile
          label="Sections"
          value={sectionsCount}
          hint={`Active · SY ${schoolYear}`}
          icon={LayoutGrid}
          tone="amber"
          loading={loading}
          href="/sections"
        />
        <StatTile
          label="Enrollment records"
          value={enrollmentTotal}
          hint="Approved, including learners who left"
          icon={ClipboardList}
          tone="violet"
          loading={loading}
          href="/enrollment"
        />
      </div>

      {/* Shortcuts */}
      <nav aria-label="Quick actions">
        <h2 className="sr-only">Quick actions</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {quickActions.map((item) => (
            <QuickLink
              key={item.title}
              href={item.href}
              title={item.title}
              description={item.desc}
              icon={item.icon}
              tone={item.tone}
            />
          ))}
        </div>
      </nav>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Enrollment by grade */}
        <Panel
          title="Enrollment by grade"
          description={`Currently enrolled learners by sex · SY ${schoolYear}`}
          icon={BookOpen}
          className="xl:col-span-2"
          action={
            <div className="hidden items-center gap-3 sm:flex">
              <LegendItem className={SEX_BAR.male}>Male</LegendItem>
              <LegendItem className={SEX_BAR.female}>Female</LegendItem>
            </div>
          }
        >
          {loading ? (
            <div
              className="grid h-48 items-end gap-1.5"
              style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
            >
              {Array.from({ length: 13 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="w-full rounded-t"
                  style={{ height: `${50 + (i % 4) * 12}%` }}
                />
              ))}
            </div>
          ) : enrollmentByGrade.some((g) => g.male > 0 || g.female > 0) ? (
            <figure>
              <div
                className="grid h-48 gap-1 sm:gap-2"
                style={{
                  gridTemplateColumns: "repeat(13, minmax(0, 1fr))",
                  gridTemplateRows: "1fr",
                }}
                role="img"
                aria-label={`Enrollment by grade: ${enrollmentByGrade
                  .filter((g) => g.male + g.female > 0)
                  .map(
                    (g) =>
                      `${getGradeLevelLabel(g.grade)} ${g.male} male, ${g.female} female`,
                  )
                  .join("; ")}`}
              >
                {enrollmentByGrade.map((g) => {
                  const malePct = (g.male / maxEnrollmentGrade) * 100;
                  const femalePct = (g.female / maxEnrollmentGrade) * 100;
                  return (
                    <div
                      key={g.grade}
                      className="flex h-full flex-col items-center"
                    >
                      <div className="flex w-full flex-1 items-end gap-[2px]">
                        <div
                          className={`min-h-[3px] flex-1 rounded-t-sm ${SEX_BAR.male}`}
                          style={{ height: `${Math.max(malePct, 2)}%` }}
                          title={`${getGradeLevelLabel(g.grade)} · Male: ${g.male}`}
                        />
                        <div
                          className={`min-h-[3px] flex-1 rounded-t-sm ${SEX_BAR.female}`}
                          style={{ height: `${Math.max(femalePct, 2)}%` }}
                          title={`${getGradeLevelLabel(g.grade)} · Female: ${g.female}`}
                        />
                      </div>
                      <span className="mt-1.5 text-xs font-medium text-muted-foreground">
                        {g.grade === 0 ? "K" : `G${g.grade}`}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {g.male + g.female}
                      </span>
                    </div>
                  );
                })}
              </div>
              <figcaption className="mt-3 flex items-center gap-3 sm:hidden">
                <LegendItem className={SEX_BAR.male}>Male</LegendItem>
                <LegendItem className={SEX_BAR.female}>Female</LegendItem>
              </figcaption>
            </figure>
          ) : (
            <EmptyState icon={BookOpen}>
              No enrollment data for SY {schoolYear}
            </EmptyState>
          )}
        </Panel>

        {/* Enrollment by lifecycle status */}
        {hasSchoolManagementAccess && (
          <Panel
            title="Enrollment status"
            description={
              loading
                ? `SY ${schoolYear}`
                : `${enrollmentTotal.toLocaleString()} approved records · SY ${schoolYear}`
            }
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
                    color={ENROLLMENT_STATUS_COLORS[s.status] ?? "rgb(148 163 184)"}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState icon={ClipboardList}>No enrollment data</EmptyState>
            )}
          </Panel>
        )}
      </div>

      {hasSchoolManagementAccess && (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <Panel
              title="Record requests"
              description={
                loading ? "This school" : `${totalForm137.toLocaleString()} requests in total`
              }
              icon={FileText}
              action={<PanelLink href="/manage-requests">Open</PanelLink>}
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
                <EmptyState icon={FileText}>No requests</EmptyState>
              )}
            </Panel>

            <Panel
              title="Staff composition"
              description={loading ? "Active personnel" : `${totalStaff} active personnel`}
              icon={Users}
            >
              {loading ? (
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-[68px] w-full" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Teaching" value={staffBreakdown.teaching} tone="sky" />
                  <MiniStat label="Non-teaching" value={staffBreakdown.nonTeaching} tone="amber" />
                  <MiniStat label="School head" value={staffBreakdown.schoolHead} tone="violet" />
                  <MiniStat
                    label="Asst. school head"
                    value={staffBreakdown.assistantSchoolHead}
                    tone="emerald"
                  />
                </div>
              )}
            </Panel>

            <Panel
              title="Advisory load"
              description={`Teachers by advisory assignment · SY ${schoolYear}`}
              icon={UserCheck}
              className="md:col-span-2 xl:col-span-1"
            >
              {loading ? (
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-[68px] w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <MiniStat
                      label="With an advisory class"
                      value={advisory.withAdvisory}
                      tone="emerald"
                    />
                    <MiniStat
                      label="Without one"
                      value={advisory.withoutAdvisory}
                      tone="rose"
                    />
                  </div>
                  {advisory.withAdvisory + advisory.withoutAdvisory > 0 && (
                    <div
                      className="flex h-2 overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={`${advisory.withAdvisory} of ${
                        advisory.withAdvisory + advisory.withoutAdvisory
                      } teachers advise a class`}
                    >
                      <div
                        className="h-full bg-emerald-500"
                        style={{
                          width: `${
                            (advisory.withAdvisory /
                              (advisory.withAdvisory + advisory.withoutAdvisory)) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </Panel>
          </div>

          {/* Enrollment per section, split by sex */}
          <Panel
            title="Enrollment per section"
            description={
              loading
                ? `SY ${schoolYear}`
                : `${sectionSexTotals.male} male, ${sectionSexTotals.female} female across ${sectionEnrollment.length} sections · SY ${schoolYear}`
            }
            icon={Users}
            bodyClassName="p-0"
            action={
              <div className="hidden items-center gap-3 sm:flex">
                <LegendItem className={SEX_BAR.male}>Male</LegendItem>
                <LegendItem className={SEX_BAR.female}>Female</LegendItem>
              </div>
            }
          >
            {loading ? (
              <RowsSkeleton rows={5} className="p-5" />
            ) : sectionEnrollment.length > 0 ? (
              <div className="max-h-[28rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Enrolled learners per section, by sex
                  </caption>
                  <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[inset_0_-1px_0] shadow-border">
                    <tr>
                      <th scope="col" className="px-5 py-2.5 text-left font-medium">
                        Section
                      </th>
                      <th scope="col" className="hidden w-1/3 px-3 py-2.5 text-left font-medium md:table-cell">
                        <span className="sr-only">Male / female split</span>
                      </th>
                      <th scope="col" className="w-16 px-3 py-2.5 text-right font-medium">
                        Male
                      </th>
                      <th scope="col" className="w-16 px-3 py-2.5 text-right font-medium">
                        Female
                      </th>
                      <th scope="col" className="w-20 px-5 py-2.5 text-right font-medium">
                        Total
                      </th>
                    </tr>
                  </thead>
                  {Object.entries(sectionGroups).map(([grade, sections]) => {
                    const gradeMale = sections.reduce((s, x) => s + x.male, 0);
                    const gradeFemale = sections.reduce((s, x) => s + x.female, 0);
                    const gradeTotal = sections.reduce((s, x) => s + x.count, 0);
                    return (
                      <tbody key={grade} className="border-b last:border-0">
                        <tr className="bg-muted/50">
                          <th
                            scope="rowgroup"
                            colSpan={2}
                            className="px-5 py-2 text-left text-xs font-semibold text-foreground"
                          >
                            {getGradeLevelLabel(Number(grade))}
                          </th>
                          <td className="px-3 py-2 text-right text-xs font-medium tabular-nums text-muted-foreground">
                            {gradeMale}
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-medium tabular-nums text-muted-foreground">
                            {gradeFemale}
                          </td>
                          <td className="px-5 py-2 text-right text-xs font-semibold tabular-nums text-foreground">
                            {gradeTotal}
                          </td>
                        </tr>
                        {sections.map((s) => {
                          const split = s.male + s.female;
                          return (
                            <tr key={s.sectionId} className="hover:bg-muted/40">
                              <th
                                scope="row"
                                className="max-w-[12rem] truncate px-5 py-2 text-left font-normal text-foreground"
                              >
                                {s.sectionName}
                              </th>
                              <td className="hidden px-3 py-2 md:table-cell">
                                {split > 0 && (
                                  <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                    <div className={SEX_BAR.male} style={{ width: `${(s.male / split) * 100}%` }} />
                                    <div className={SEX_BAR.female} style={{ width: `${(s.female / split) * 100}%` }} />
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{s.male}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{s.female}</td>
                              <td className="px-5 py-2 text-right font-semibold tabular-nums">
                                {s.count}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    );
                  })}
                  <tfoot className="sticky bottom-0 bg-card shadow-[inset_0_1px_0] shadow-border">
                    <tr>
                      <th scope="row" colSpan={2} className="px-5 py-2.5 text-left font-semibold">
                        All sections
                      </th>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        {sectionSexTotals.male}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        {sectionSexTotals.female}
                      </td>
                      <td className="px-5 py-2.5 text-right font-bold tabular-nums">
                        {sectionSexTotals.total}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <EmptyState icon={Users}>No sections for SY {schoolYear}</EmptyState>
            )}
          </Panel>

          {/* Teaching load per teacher per day */}
          <Panel
            title="Teaching load"
            description={`Minutes per teacher per day · SY ${schoolYear}`}
            icon={Clock}
            bodyClassName="p-0"
          >
            {loading ? (
              <RowsSkeleton rows={5} className="p-5" />
            ) : teacherLoads.length > 0 ? (
              <div className="max-h-[32rem] overflow-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <caption className="sr-only">
                    Teaching minutes per teacher per weekday, with advisorship and ARAL
                  </caption>
                  <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[inset_0_-1px_0] shadow-border">
                    <tr>
                      <th scope="col" className="px-5 py-2.5 text-left font-medium">
                        Teacher
                      </th>
                      {WEEKDAYS.map((d) => (
                        <th key={d.idx} scope="col" className="w-14 px-2 py-2.5 text-right font-medium">
                          {d.label}
                        </th>
                      ))}
                      <th scope="col" className="w-24 px-2 py-2.5 text-right font-medium">
                        Advisorship
                      </th>
                      <th scope="col" className="w-16 px-2 py-2.5 text-right font-medium">
                        ARAL
                      </th>
                      <th scope="col" className="w-20 px-5 py-2.5 text-right font-medium">
                        Week
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {teacherLoads.map((t) => {
                      const advisorshipMin = advisorshipWeeklyMinutes(t);
                      const aralMin = aralWeeklyMinutes(t);
                      const weekTotal = teacherWeeklyTotal(t);
                      const dim = "text-muted-foreground/60";
                      return (
                        <tr key={t.teacherId} className="hover:bg-muted/40">
                          <th
                            scope="row"
                            className="max-w-[200px] truncate px-5 py-2 text-left font-medium text-foreground"
                          >
                            {t.teacherName}
                          </th>
                          {WEEKDAYS.map((d) => {
                            const m = t.minutes[d.idx] || 0;
                            return (
                              <td key={d.idx} className={`px-2 py-2 text-right tabular-nums ${m === 0 ? dim : ""}`}>
                                {m}
                              </td>
                            );
                          })}
                          <td className={`px-2 py-2 text-right tabular-nums ${advisorshipMin === 0 ? dim : ""}`}>
                            {advisorshipMin}
                          </td>
                          <td className={`px-2 py-2 text-right tabular-nums ${aralMin === 0 ? dim : ""}`}>
                            {aralMin}
                          </td>
                          <td className="px-5 py-2 text-right font-semibold tabular-nums">
                            {weekTotal}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={Clock}>No schedules for SY {schoolYear}</EmptyState>
            )}
            {!loading && loadsOutsideStaff > 0 && (
              <p
                role="note"
                className="flex gap-2 border-t bg-amber-50 px-5 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {loadsOutsideStaff === 1
                    ? "1 assignment references a staff member who is inactive or no longer belongs to this school and is not counted above."
                    : `${loadsOutsideStaff} assignments reference staff who are inactive or no longer belong to this school and are not counted above.`}{" "}
                  Check the subject schedules, section advisers, and ARAL tutors
                  for SY {schoolYear}.
                </span>
              </p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
