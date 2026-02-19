"use client";

import { getGradeLevelLabel } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  CHART_COLORS,
  getCurrentSchoolYear,
} from "@/lib/dashboard-utils";
import {
  ArrowRight,
  BookOpen,
  Building2,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutGrid,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Form137Status {
  status: string;
  count: number;
}

interface QuickAction {
  title: string;
  desc: string;
  href: string;
  icon: typeof Building2;
  color: string;
}

export function SchoolDashboard() {
  const user = useAppSelector((state) => state.user.user);
  const [studentsCount, setStudentsCount] = useState(0);
  const [sectionsCount, setSectionsCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [enrollmentTotal, setEnrollmentTotal] = useState(0);
  const [enrollmentByGrade, setEnrollmentByGrade] = useState<
    { grade: number; count: number }[]
  >([]);
  const [form137Status, setForm137Status] = useState<Form137Status[]>([]);
  const [schoolYear] = useState(getCurrentSchoolYear());
  const [loading, setLoading] = useState(true);
  const [schoolName, setSchoolName] = useState("");

  const schoolId = user?.school_id != null ? String(user.school_id) : null;

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

      const { count: studentsCnt } = await supabase
        .from("sms_students")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId);
      setStudentsCount(studentsCnt ?? 0);

      const { count: sectionsCnt } = await supabase
        .from("sms_sections")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("is_active", true);
      setSectionsCount(sectionsCnt ?? 0);

      const { count: staffCnt } = await supabase
        .from("sms_users")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .neq("type", "division_admin");
      setStaffCount(staffCnt ?? 0);

      const { data: enrollments } = await supabase
        .from("sms_enrollments")
        .select("grade_level, status")
        .eq("school_id", schoolId)
        .eq("school_year", schoolYear);

      let total = 0;
      const gradeCounts = Array.from({ length: 13 }, (_, i) => ({
        grade: i,
        count: 0,
      }));
      enrollments?.forEach((e) => {
        if (e.status === "approved") {
          total++;
          const idx = e.grade_level;
          if (idx >= 0 && idx < 13) {
            gradeCounts[idx]!.count++;
          }
        }
      });
      setEnrollmentTotal(total);
      setEnrollmentByGrade(gradeCounts);

      const { data: form137 } = await supabase
        .from("sms_form137_requests")
        .select("status")
        .eq("school_id", schoolId);
      const statusCounts = new Map<string, number>();
      form137?.forEach((f) => {
        const s = f.status || "unknown";
        statusCounts.set(s, (statusCounts.get(s) || 0) + 1);
      });
      setForm137Status(
        Array.from(statusCounts.entries())
          .map(([status, count]) => ({ status, count }))
          .sort((a, b) => b.count - a.count)
      );
    } catch (error) {
      console.error("Error fetching school dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [schoolId, schoolYear]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const maxEnrollmentGrade = Math.max(
    ...enrollmentByGrade.map((x) => x.count),
    1
  );
  const totalForm137 = form137Status.reduce((s, f) => s + f.count, 0);
  // School head, admin, registrar have similar dashboard access
  const hasSchoolManagementAccess =
    user?.type === "school_head" ||
    user?.type === "super admin" ||
    user?.type === "admin" ||
    user?.type === "registrar";

  const quickActions: QuickAction[] = [
    {
      title: "Enrollment",
      desc: "Manage student enrollments",
      href: "/enrollment",
      icon: ClipboardList,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      title: "Sections",
      desc: "Manage class sections",
      href: "/sections",
      icon: LayoutGrid,
      color: "text-violet-600 dark:text-violet-400",
    },
    {
      title: "Students",
      desc: "View student records",
      href: "/students",
      icon: GraduationCap,
      color: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Schedules",
      desc: "Class schedules",
      href: "/schedules",
      icon: BookOpen,
      color: "text-amber-600 dark:text-amber-400",
    },
  ];

  if (hasSchoolManagementAccess) {
    quickActions.push({
      title: "Form 137",
      desc: "Manage record requests",
      href: "/form137/requests",
      icon: FileText,
      color: "text-rose-600 dark:text-rose-400",
    });
  }

  if (!schoolId) {
    return (
      <div className="space-y-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 p-6 sm:p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-white">School Dashboard</h1>
          <p className="mt-2 text-slate-300 text-sm">
            No school assigned. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-900 via-emerald-900 to-cyan-900 p-6 sm:p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-400/20 via-transparent to-transparent" />
        <div className="relative">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <div className="rounded-xl bg-white/10 p-2.5 backdrop-blur-sm">
              <Building2 className="h-6 w-6" />
            </div>
            School Dashboard
          </h1>
          <p className="mt-2 text-slate-200/90 text-sm sm:text-base max-w-2xl">
            {schoolName} — Overview for SY {schoolYear}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {[
          {
            title: "Students",
            value: studentsCount,
            icon: GraduationCap,
            desc: "Total enrolled",
            iconBg: "bg-violet-500/20 text-violet-400",
          },
          {
            title: "Staff",
            value: staffCount,
            icon: Users,
            desc: "Personnel",
            iconBg: "bg-blue-500/20 text-blue-400",
          },
          {
            title: "Sections",
            value: sectionsCount,
            icon: LayoutGrid,
            desc: "Class sections",
            iconBg: "bg-amber-500/20 text-amber-400",
          },
          {
            title: "Enrollments",
            value: enrollmentTotal,
            icon: ClipboardList,
            desc: `SY ${schoolYear}`,
            iconBg: "bg-rose-500/20 text-rose-400",
          },
        ].map((item) => (
          <Card
            key={item.title}
            className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/30 transition-all duration-300 hover:shadow-xl hover:scale-[1.02]"
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {item.title}
                  </p>
                  <div className="mt-1 text-2xl font-bold tracking-tight">
                    {loading ? (
                      <Skeleton className="h-8 w-16" />
                    ) : (
                      item.value.toLocaleString()
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
                <div className={`rounded-xl p-3 ${item.iconBg}`}>
                  <item.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enrollment by Grade */}
        <Card className="overflow-hidden border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5" />
              Enrollment by Grade
            </CardTitle>
            <CardDescription>
              SY {schoolYear} — Enrollments per grade
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid gap-1 h-40 items-end" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
                {Array.from({ length: 13 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="w-full rounded-t"
                    style={{
                      height: `${60 + (i % 4) * 10}%`,
                    }}
                  />
                ))}
              </div>
            ) : enrollmentByGrade.some((g) => g.count > 0) ? (
              <div className="grid gap-1 sm:gap-2 items-end h-40" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
                {enrollmentByGrade.map((g) => {
                  const pct = (g.count / maxEnrollmentGrade) * 100;
                  return (
                    <div
                      key={g.grade}
                      className="flex flex-col items-center gap-1 justify-end group"
                    >
                      <div
                        className="w-full rounded-t-md transition-all duration-300 hover:opacity-90 min-h-[4px]"
                        style={{
                          height: `${Math.max(pct, 4)}%`,
                          background: `linear-gradient(to top, ${CHART_COLORS[0]}, ${CHART_COLORS[1]})`,
                        }}
                        title={`${getGradeLevelLabel(g.grade)}: ${g.count}`}
                      />
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {g.grade === 0 ? "K" : `G${g.grade}`}
                      </span>
                      <span className="text-[10px] font-semibold">
                        {g.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">
                No enrollment data for SY {schoolYear}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Form 137 - For school head, admin, registrar */}
        {hasSchoolManagementAccess && (
          <Card className="overflow-hidden border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                Form 137 Requests
              </CardTitle>
              <CardDescription>
                Record requests for this school
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : form137Status.length > 0 ? (
                <div className="space-y-2">
                  {form137Status.map((f) => (
                    <div
                      key={f.status}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                    >
                      <span className="text-sm capitalize">{f.status}</span>
                      <span className="text-sm font-semibold">{f.count}</span>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground mt-2">
                    Total: {totalForm137} requests
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No Form 137 requests
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Enrollment summary for admin and registrar */}
        {hasSchoolManagementAccess && (
          <Card className="overflow-hidden border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="h-5 w-5" />
                Enrollment Summary
              </CardTitle>
              <CardDescription>
                SY {schoolYear} — Total enrolled
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-sm font-medium">Enrolled</span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {enrollmentTotal}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((item) => (
            <Link key={item.title} href={item.href}>
              <Card className="group overflow-hidden border transition-all duration-300 hover:border-primary/50 hover:shadow-md">
                <CardContent className="p-5 flex items-center gap-4">
                  <div
                    className={`rounded-xl p-3 bg-muted ${item.color} group-hover:scale-105 transition-transform`}
                  >
                    <item.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform flex-shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
