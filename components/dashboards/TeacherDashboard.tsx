"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/redux/hook";
import { getCurrentSchoolYear } from "@/lib/dashboard-utils";
import { supabase } from "@/lib/supabase/client";
import {
  ArrowRight,
  Award,
  BookOpen,
  GraduationCap,
  LayoutGrid,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CHART_COLORS } from "@/lib/dashboard-utils";

interface SectionSummary {
  sectionName: string;
  studentCount: number;
}

export function TeacherDashboard() {
  const user = useAppSelector((state) => state.user.user);
  const [sectionsCount, setSectionsCount] = useState(0);
  const [subjectsCount, setSubjectsCount] = useState(0);
  const [studentsCount, setStudentsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentSchoolYear, setCurrentSchoolYear] = useState("");
  const [sectionsByStudents, setSectionsByStudents] = useState<
    SectionSummary[]
  >([]);
  const [subjectsList, setSubjectsList] = useState<{ name: string }[]>([]);

  useEffect(() => {
    const schoolYear = getCurrentSchoolYear();
    setCurrentSchoolYear(schoolYear);

    if (user?.system_user_id) {
      fetchDashboardData(schoolYear);
    }
  }, [user]);

  const fetchDashboardData = async (schoolYear: string) => {
    if (!user?.system_user_id) return;

    setLoading(true);
    try {
      const { data: adviserSections } = await supabase
        .from("sms_sections")
        .select("id, name")
        .eq("section_adviser_id", user.system_user_id)
        .eq("is_active", true)
        .eq("school_year", schoolYear);

      const sectionIds = new Set<string>();
      adviserSections?.forEach((s) => sectionIds.add(s.id));
      setSectionsCount(sectionIds.size);

      const { data: schedules } = await supabase
        .from("sms_subject_schedules")
        .select("subject_id, subject:sms_subjects(name)")
        .eq("teacher_id", user.system_user_id)
        .eq("school_year", schoolYear);

      const uniqueSubjects = new Map<string, string>();
      schedules?.forEach((s) => {
        const subj = s.subject as { name?: string } | null;
        if (s.subject_id && subj?.name) {
          uniqueSubjects.set(s.subject_id, subj.name);
        }
      });
      setSubjectsCount(uniqueSubjects.size);
      setSubjectsList(
        Array.from(uniqueSubjects.values()).map((name) => ({ name }))
      );

      const sectionsWithCounts: SectionSummary[] = [];
      let totalStudents = 0;

      for (const sec of adviserSections ?? []) {
        const { count } = await supabase
          .from("sms_enrollments")
          .select("*", { count: "exact", head: true })
          .eq("section_id", sec.id)
          .eq("school_year", schoolYear)
          .eq("status", "approved");
        const cnt = count ?? 0;
        totalStudents += cnt;
        sectionsWithCounts.push({
          sectionName: sec.name ?? "Unnamed",
          studentCount: cnt,
        });
      }
      setSectionsByStudents(
        sectionsWithCounts.sort((a, b) => b.studentCount - a.studentCount)
      );
      setStudentsCount(totalStudents);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const maxSectionStudents = Math.max(
    ...sectionsByStudents.map((s) => s.studentCount),
    1
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 via-violet-900 to-purple-900 p-6 sm:p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-400/20 via-transparent to-transparent" />
        <div className="relative">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <div className="rounded-xl bg-white/10 p-2.5 backdrop-blur-sm">
              <LayoutGrid className="h-6 w-6" />
            </div>
            Teacher Dashboard
          </h1>
          <p className="mt-2 text-slate-200/90 text-sm sm:text-base max-w-2xl">
            Your teaching overview for SY {currentSchoolYear || "—"}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {[
          {
            title: "Sections",
            value: sectionsCount,
            icon: Users,
            desc: "Sections you manage",
            iconBg: "bg-indigo-500/20 text-indigo-400",
          },
          {
            title: "Subjects",
            value: subjectsCount,
            icon: BookOpen,
            desc: "Subjects you teach",
            iconBg: "bg-violet-500/20 text-violet-400",
          },
          {
            title: "Students",
            value: studentsCount,
            icon: GraduationCap,
            desc: "Across all sections",
            iconBg: "bg-amber-500/20 text-amber-400",
          },
          {
            title: "School Year",
            value: currentSchoolYear,
            icon: LayoutGrid,
            desc: "Current SY",
            iconBg: "bg-emerald-500/20 text-emerald-400",
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
                    ) : typeof item.value === "number" ? (
                      item.value.toLocaleString()
                    ) : (
                      String(item.value ?? "—")
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

      {/* Charts + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Students by Section - Bar chart */}
        <Card className="overflow-hidden border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Students by Section
            </CardTitle>
            <CardDescription>
              Enrollment in your adviser sections
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-2 gap-2 h-40 items-end">
                {[70, 50, 80, 60].map((pct, i) => (
                  <Skeleton
                    key={i}
                    className="w-full rounded-t-md"
                    style={{ height: `${pct}%` }}
                  />
                ))}
              </div>
            ) : sectionsByStudents.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end h-44">
                  {sectionsByStudents.slice(0, 6).map((s, i) => {
                    const pct = (s.studentCount / maxSectionStudents) * 100;
                    return (
                      <div
                        key={s.sectionName}
                        className="flex flex-col items-center gap-1 h-full justify-end group"
                      >
                        <div
                          className="w-full rounded-t-md transition-all duration-300 hover:opacity-90 min-h-[4px]"
                          style={{
                            height: `${Math.max(pct, 4)}%`,
                            backgroundColor:
                              CHART_COLORS[i % CHART_COLORS.length],
                          }}
                          title={`${s.sectionName}: ${s.studentCount}`}
                        />
                        <span
                          className="text-[10px] font-medium text-muted-foreground truncate max-w-full text-center"
                          title={s.sectionName}
                        >
                          {s.sectionName.length > 10
                            ? s.sectionName.slice(0, 8) + "…"
                            : s.sectionName}
                        </span>
                        <span className="text-xs font-semibold">
                          {s.studentCount}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">
                No section data for this school year
              </p>
            )}
          </CardContent>
        </Card>

        {/* Subjects Widget */}
        <Card className="overflow-hidden border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5" />
              Your Subjects
            </CardTitle>
            <CardDescription>
              Subjects assigned to you for SY {currentSchoolYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : subjectsList.length > 0 ? (
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {subjectsList.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                  >
                    <span className="text-sm font-medium">{s.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No subjects assigned yet
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
              title: "My Sections",
              desc: "View and manage sections",
              href: "/teacher/sections",
              icon: Users,
              color: "text-indigo-600 dark:text-indigo-400",
            },
            {
              title: "My Subjects",
              desc: "View assigned subjects",
              href: "/teacher/subjects",
              icon: BookOpen,
              color: "text-violet-600 dark:text-violet-400",
            },
            {
              title: "Grade Entry",
              desc: "Input and manage grades",
              href: "/teacher/grades",
              icon: Award,
              color: "text-amber-600 dark:text-amber-400",
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
