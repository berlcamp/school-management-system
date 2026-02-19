"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase/client";
import { CHART_COLORS, getCurrentSchoolYear } from "@/lib/dashboard-utils";
import {
  ArrowRight,
  BookOpen,
  Building2,
  ClipboardList,
  FileBarChart,
  GraduationCap,
  LayoutGrid,
  School,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface SchoolUserCount {
  school_id: string;
  school_name: string;
  count: number;
}

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
  registrar: "Registrars",
  admin: "Admins",
};

export function DivisionDashboard() {
  const [schoolsCount, setSchoolsCount] = useState(0);
  const [usersCount, setUsersCount] = useState(0);
  const [studentsCount, setStudentsCount] = useState(0);
  const [sectionsCount, setSectionsCount] = useState(0);
  const [usersBySchool, setUsersBySchool] = useState<SchoolUserCount[]>([]);
  const [studentsBySchool, setStudentsBySchool] = useState<SchoolStudentCount[]>(
    []
  );
  const [staffByType, setStaffByType] = useState<StaffByType[]>([]);
  const [enrollmentByGrade, setEnrollmentByGrade] = useState<
    { grade: number; count: number }[]
  >([]);
  const [form137Status, setForm137Status] = useState<Form137Status[]>([]);
  const [schoolYear] = useState(getCurrentSchoolYear());
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const { count: schoolsCnt } = await supabase
        .from("sms_schools")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);
      setSchoolsCount(schoolsCnt ?? 0);

      const { data: schools } = await supabase
        .from("sms_schools")
        .select("id, name")
        .eq("is_active", true);
      const schoolMap = new Map<string, string>();
      schools?.forEach((s) => schoolMap.set(String(s.id), s.name));

      const { data: users, count: usersCnt } = await supabase
        .from("sms_users")
        .select("school_id, type", { count: "exact" })
        .neq("type", "division_admin");
      setUsersCount(usersCnt ?? 0);

      const typeCounts = new Map<string, number>();
      users?.forEach((u) => {
        const t = u.type || "other";
        typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
      });
      const byType: StaffByType[] = Array.from(typeCounts.entries())
        .map(([type, count]) => ({
          type,
          count,
          label: STAFF_TYPE_LABELS[type] || type,
        }))
        .sort((a, b) => b.count - a.count);
      setStaffByType(byType);

      const countsBySchool = new Map<string, number>();
      users?.forEach((u) => {
        if (u.school_id) {
          const sid = String(u.school_id);
          countsBySchool.set(sid, (countsBySchool.get(sid) || 0) + 1);
        }
      });
      setUsersBySchool(
        Array.from(countsBySchool.entries())
          .map(([schoolId, count]) => ({
            school_id: schoolId,
            school_name: schoolMap.get(schoolId) || schoolId,
            count,
          }))
          .sort((a, b) => b.count - a.count)
      );

      const { data: students } = await supabase
        .from("sms_students")
        .select("school_id");
      setStudentsCount(students?.length ?? 0);
      const studentCountsBySchool = new Map<string, number>();
      students?.forEach((s) => {
        if (s.school_id) {
          const sid = String(s.school_id);
          studentCountsBySchool.set(
            sid,
            (studentCountsBySchool.get(sid) || 0) + 1
          );
        }
      });
      setStudentsBySchool(
        Array.from(studentCountsBySchool.entries())
          .map(([schoolId, count]) => ({
            school_id: schoolId,
            school_name: schoolMap.get(schoolId) || schoolId,
            count,
          }))
          .sort((a, b) => b.count - a.count)
      );

      const { count: sectionsCnt } = await supabase
        .from("sms_sections")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);
      setSectionsCount(sectionsCnt ?? 0);

      const { data: enrollments } = await supabase
        .from("sms_enrollments")
        .select("grade_level")
        .eq("status", "approved")
        .eq("school_year", schoolYear);
      const gradeCounts = Array.from({ length: 12 }, (_, i) => ({
        grade: i + 1,
        count: 0,
      }));
      enrollments?.forEach((e) => {
        const idx = e.grade_level - 1;
        if (idx >= 0 && idx < 12) {
          gradeCounts[idx]!.count++;
        }
      });
      setEnrollmentByGrade(gradeCounts);

      const { data: form137 } = await supabase
        .from("sms_form137_requests")
        .select("status");
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
  const maxStudentsBySchool = Math.max(
    ...studentsBySchool.map((x) => x.count),
    1
  );
  const maxEnrollmentGrade = Math.max(
    ...enrollmentByGrade.map((x) => x.count),
    1
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 sm:p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent" />
        <div className="relative">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <div className="rounded-xl bg-white/10 p-2.5 backdrop-blur-sm">
              <LayoutGrid className="h-6 w-6" />
            </div>
            Division Dashboard
          </h1>
          <p className="mt-2 text-slate-300 text-sm sm:text-base max-w-2xl">
            Overview of schools, staff, students, and key metrics across the
            division for SY {schoolYear}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {[
          {
            title: "Schools",
            value: schoolsCount,
            icon: Building2,
            desc: "Active schools",
            iconBg: "bg-emerald-500/20 text-emerald-400",
          },
          {
            title: "Staff",
            value: usersCount,
            icon: Users,
            desc: "Personnel total",
            iconBg: "bg-blue-500/20 text-blue-400",
          },
          {
            title: "Students",
            value: studentsCount,
            icon: GraduationCap,
            desc: "Enrolled learners",
            iconBg: "bg-violet-500/20 text-violet-400",
          },
          {
            title: "Sections",
            value: sectionsCount,
            icon: LayoutGrid,
            desc: "Class sections",
            iconBg: "bg-amber-500/20 text-amber-400",
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
        <Card className="overflow-hidden border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Staff by Role
            </CardTitle>
            <CardDescription>
              Personnel distribution across roles in the division
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-52">
                <Skeleton className="h-40 w-40 rounded-full" />
              </div>
            ) : staffByType.length > 0 ? (
              <>
                <div className="flex flex-col sm:flex-row items-center gap-8">
                  <div className="relative w-40 h-40 flex-shrink-0">
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `conic-gradient(from 0deg, ${staffByType
                          .map((t, i) => {
                            const prev = staffByType
                              .slice(0, i)
                              .reduce((s, x) => s + x.count, 0);
                            const pctStart = (prev / totalStaffForPie) * 100;
                            const pctEnd =
                              ((prev + t.count) / totalStaffForPie) * 100;
                            return `${CHART_COLORS[i % CHART_COLORS.length]} ${pctStart}% ${pctEnd}%`;
                          })
                          .join(", ")})`,
                      }}
                    />
                    <div className="absolute inset-[25%] rounded-full bg-card flex items-center justify-center">
                      <span className="text-lg font-bold">
                        {totalStaffForPie}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2 min-w-0">
                    {staffByType.map((t, idx) => (
                      <div
                        key={t.type}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="h-3 w-3 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor:
                                CHART_COLORS[idx % CHART_COLORS.length],
                            }}
                          />
                          <span className="text-sm truncate">{t.label}</span>
                        </div>
                        <span className="text-sm font-semibold flex-shrink-0">
                          {t.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {usersBySchool.length > 0 && (
                  <div className="mt-6 pt-4 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Top schools by staff
                    </p>
                    <div className="space-y-1.5 max-h-24 overflow-y-auto">
                      {usersBySchool.slice(0, 5).map((s) => (
                        <div
                          key={s.school_id}
                          className="flex justify-between text-sm"
                        >
                          <span className="truncate max-w-[140px]">
                            {s.school_name}
                          </span>
                          <span className="font-medium">{s.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">
                No staff data available
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <School className="h-5 w-5" />
              Students by School
            </CardTitle>
            <CardDescription>
              Enrollment distribution across schools (top 8)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-4 gap-2 h-48 items-end">
                {[70, 50, 80, 60].map((pct, i) => (
                  <Skeleton
                    key={i}
                    className="w-full rounded-t-md"
                    style={{ height: `${pct}%` }}
                  />
                ))}
              </div>
            ) : studentsBySchool.length > 0 ? (
              <div className="space-y-3">
                <div className="grid gap-2 items-end h-48 grid-cols-4 sm:grid-cols-6 lg:grid-cols-4">
                  {studentsBySchool.slice(0, 8).map((s, i) => {
                    const pct = (s.count / maxStudentsBySchool) * 100;
                    return (
                      <div
                        key={s.school_id}
                        className="flex flex-col items-center gap-1 h-full justify-end group"
                      >
                        <div
                          className="w-full rounded-t-md transition-all duration-300 hover:opacity-90 min-h-[4px]"
                          style={{
                            height: `${Math.max(pct, 4)}%`,
                            backgroundColor:
                              CHART_COLORS[i % CHART_COLORS.length],
                          }}
                          title={`${s.school_name}: ${s.count}`}
                        />
                        <span
                          className="text-[10px] sm:text-xs font-medium text-muted-foreground truncate max-w-full text-center"
                          title={s.school_name}
                        >
                          {s.school_name.length > 12
                            ? s.school_name.slice(0, 10) + "…"
                            : s.school_name}
                        </span>
                        <span className="text-xs font-semibold">{s.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">
                No student data by school
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Enrollment by Grade + Form 137 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 overflow-hidden border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5" />
              Enrollment by Grade Level
            </CardTitle>
            <CardDescription>
              SY {schoolYear} — Approved enrollments per grade
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-12 gap-1 h-40 items-end">
                {Array.from({ length: 12 }).map((_, i) => (
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
              <div className="grid grid-cols-12 gap-1 sm:gap-2 items-end h-40">
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
                          background: `linear-gradient(to top, var(--chart-1), var(--chart-2))`,
                        }}
                        title={`Grade ${g.grade}: ${g.count}`}
                      />
                      <span className="text-[10px] font-medium text-muted-foreground">
                        G{g.grade}
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

        <Card className="overflow-hidden border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5" />
              Form 137 Requests
            </CardTitle>
            <CardDescription>
              Status of record requests across schools
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
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              title: "Schools",
              desc: "Manage schools in this division",
              href: "/division/schools",
              icon: Building2,
              color: "text-emerald-600 dark:text-emerald-400",
            },
            {
              title: "Users",
              desc: "Manage users and assign to schools",
              href: "/division/users",
              icon: Users,
              color: "text-blue-600 dark:text-blue-400",
            },
            {
              title: "Reports",
              desc: "View common DepEd division reports",
              href: "/division/reports",
              icon: FileBarChart,
              color: "text-violet-600 dark:text-violet-400",
            },
          ].map((item) => (
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
