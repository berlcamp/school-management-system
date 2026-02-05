"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  ArrowRight,
  Award,
  BookOpen,
  GraduationCap,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [sectionsCount, setSectionsCount] = useState(0);
  const [subjectsCount, setSubjectsCount] = useState(0);
  const [studentsCount, setStudentsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentSchoolYear, setCurrentSchoolYear] = useState("");

  useEffect(() => {
    const getCurrentSchoolYear = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      if (month >= 5) {
        return `${year}-${year + 1}`;
      } else {
        return `${year - 1}-${year}`;
      }
    };
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
      // Fetch sections where teacher is adviser only
      const { data: adviserSections } = await supabase
        .from("sms_sections")
        .select("id")
        .eq("section_adviser_id", user.system_user_id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .eq("school_year", schoolYear);

      const sectionIds = new Set<string>();
      adviserSections?.forEach((s) => sectionIds.add(s.id));

      setSectionsCount(sectionIds.size);

      // Fetch subjects via subject schedules
      const { data: schedules } = await supabase
        .from("sms_subject_schedules")
        .select("subject_id")
        .eq("teacher_id", user.system_user_id)
        .eq("school_year", schoolYear);

      const uniqueSubjectIds = new Set<string>();
      schedules?.forEach((s) => uniqueSubjectIds.add(s.subject_id));
      setSubjectsCount(uniqueSubjectIds.size);

      // Count students from assigned sections
      if (sectionIds.size > 0) {
        const { count } = await supabase
          .from("sms_section_students")
          .select("*", { count: "exact", head: true })
          .in("section_id", Array.from(sectionIds))
          .eq("school_year", schoolYear)
          .is("transferred_at", null);

        setStudentsCount(count || 0);
      } else {
        setStudentsCount(0);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text">Teacher Dashboard</h1>
      </div>
      <div className="app__content">
        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Assigned Sections
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "..." : sectionsCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Sections you manage
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Assigned Subjects
              </CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "..." : subjectsCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Subjects you teach
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Students
              </CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "..." : studentsCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Across all sections
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Access */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                My Sections
              </CardTitle>
              <CardDescription>
                View and manage sections assigned to you
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/teacher/sections">
                <Button variant="outline" className="w-full">
                  View Sections
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                My Subjects
              </CardTitle>
              <CardDescription>
                View subjects you are assigned to teach
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/teacher/subjects">
                <Button variant="outline" className="w-full">
                  View Subjects
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Grade Entry
              </CardTitle>
              <CardDescription>Input and manage student grades</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/teacher/grades">
                <Button variant="outline" className="w-full">
                  Enter Grades
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
