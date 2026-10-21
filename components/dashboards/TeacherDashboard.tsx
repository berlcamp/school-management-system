"use client";

import {
  DashboardHeader,
  EmptyState,
  Panel,
  PanelLink,
  QuickLink,
  RowsSkeleton,
  StatTile,
  TONE,
} from "@/components/dashboards/DashboardKit";
import { getCurrentSchoolYear } from "@/lib/dashboard-utils";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  Award,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

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
    <div className="space-y-6">
      <DashboardHeader
        title="Teaching overview"
        context={`Your sections, subjects and learners · SY ${currentSchoolYear || "—"}`}
      />

      {/* Headline figures */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Sections"
          value={sectionsCount}
          hint="Sections you advise"
          icon={Users}
          tone="sky"
          loading={loading}
        />
        <StatTile
          label="Subjects"
          value={subjectsCount}
          hint="Subjects you teach"
          icon={BookOpen}
          tone="violet"
          loading={loading}
        />
        <StatTile
          label="Learners"
          value={studentsCount}
          hint="Across your advisory sections"
          icon={GraduationCap}
          tone="amber"
          loading={loading}
        />
        <StatTile
          label="School Year"
          value={currentSchoolYear || "—"}
          hint="Current school year"
          icon={CalendarDays}
          tone="emerald"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Learners per advisory section */}
        <Panel
          title="Learners by section"
          description="Approved enrolments in the sections you advise"
          icon={Users}
          bodyClassName="p-0"
        >
          {loading ? (
            <RowsSkeleton rows={4} className="p-5" />
          ) : sectionsByStudents.length > 0 ? (
            <div className="max-h-[22rem] overflow-y-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Enrolled learners per advisory section, SY {currentSchoolYear}
                </caption>
                <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[inset_0_-1px_0] shadow-border">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">
                      Section
                    </th>
                    <th scope="col" className="hidden w-2/5 px-3 py-2.5 text-left font-medium sm:table-cell">
                      <span className="sr-only">Share of largest section</span>
                    </th>
                    <th scope="col" className="w-24 px-5 py-2.5 text-right font-medium">
                      Learners
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sectionsByStudents.slice(0, 6).map((s) => {
                    const pct = (s.studentCount / maxSectionStudents) * 100;
                    return (
                      <tr
                        key={s.sectionName}
                        className="border-b last:border-0 hover:bg-muted/40"
                      >
                        <th
                          scope="row"
                          className="max-w-[12rem] truncate px-5 py-2.5 text-left font-normal text-foreground"
                          title={s.sectionName}
                        >
                          {s.sectionName}
                        </th>
                        <td className="hidden px-3 py-2.5 sm:table-cell">
                          <div
                            className="h-2 overflow-hidden rounded-full bg-muted"
                            role="img"
                            aria-label={`${s.sectionName}: ${s.studentCount} learners`}
                          >
                            <div
                              className={cn("h-full rounded-full", TONE.sky.bar)}
                              style={{ width: `${Math.max(pct, 4)}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-foreground">
                          {s.studentCount.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={Users} className="px-5">
              You are not the adviser of any active section for SY{" "}
              {currentSchoolYear || "—"}.
            </EmptyState>
          )}
        </Panel>

        {/* Subjects taught */}
        <Panel
          title="Your subjects"
          description={`Subjects scheduled to you for SY ${currentSchoolYear || "—"}`}
          icon={BookOpen}
          action={<PanelLink href="/teacher/subjects">View all</PanelLink>}
        >
          {loading ? (
            <RowsSkeleton rows={4} />
          ) : subjectsList.length > 0 ? (
            <ul className="max-h-[18rem] space-y-2 overflow-y-auto">
              {subjectsList.map((s) => (
                <li
                  key={s.name}
                  className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm font-medium text-foreground"
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-md",
                      TONE.violet.chip,
                    )}
                  >
                    <BookOpen className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 truncate">{s.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={BookOpen}>
              No subject schedules are assigned to you for this school year yet.
            </EmptyState>
          )}
        </Panel>
      </div>

      {/* Shortcuts */}
      <section aria-labelledby="teacher-quick-actions" className="space-y-3">
        <h2
          id="teacher-quick-actions"
          className="text-base font-semibold text-foreground"
        >
          Quick actions
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickLink
            href="/teacher/sections"
            title="My Sections"
            description="View and manage sections"
            icon={Users}
            tone="sky"
          />
          <QuickLink
            href="/teacher/subjects"
            title="My Subjects"
            description="View assigned subjects"
            icon={BookOpen}
            tone="violet"
          />
          <QuickLink
            href="/teacher/grades"
            title="Grade Entry"
            description="Input and manage grades"
            icon={Award}
            tone="amber"
          />
        </div>
      </section>
    </div>
  );
}
