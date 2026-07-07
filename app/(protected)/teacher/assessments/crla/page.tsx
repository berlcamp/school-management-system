"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear, getSchoolYearOptions } from "@/lib/utils/schoolYear";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CrlaScoresheetTable } from "./components/CrlaScoresheetTable";

export interface AdviserSection {
  id: string;
  name: string;
  grade_level: number;
  school_id: string;
  school_name?: string;
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [sections, setSections] = useState<AdviserSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [schoolYear, setSchoolYear] = useState<string>("");
  const [focusStudentId, setFocusStudentId] = useState<string>("");
  const pendingSectionRef = useRef<string | null>(null);
  const appliedSectionRef = useRef(false);

  // Read deep-link params (section/student/school_year) once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSchoolYear(params.get("school_year") || getCurrentSchoolYear());
    pendingSectionRef.current = params.get("section");
    setFocusStudentId(params.get("student") || "");
  }, []);

  // Preselect the deep-linked section once it appears in the adviser's list.
  useEffect(() => {
    if (appliedSectionRef.current) return;
    const target = pendingSectionRef.current;
    if (target && sections.some((s) => s.id === target)) {
      setSelectedSection(target);
      appliedSectionRef.current = true;
    }
  }, [sections]);

  const fetchSections = useCallback(async () => {
    if (!user?.system_user_id || !schoolYear) {
      setSections([]);
      return;
    }
    // Super admins can see every section (all schools) for testing.
    const isSuperAdmin = user.type === "super admin";
    let query = supabase
      .from("sms_sections")
      .select("id, name, grade_level, school_id")
      .eq("school_year", schoolYear)
      .eq("is_active", true)
      .in("grade_level", [1, 2, 3])
      .order("grade_level")
      .order("name");
    if (!isSuperAdmin) {
      query = query.eq("section_adviser_id", user.system_user_id);
    }
    const { data } = await query;
    let list = (data || []).map((s) => ({
      id: String(s.id),
      name: s.name as string,
      grade_level: s.grade_level as number,
      school_id: String(s.school_id),
    })) as AdviserSection[];
    if (isSuperAdmin && list.length > 0) {
      const schoolIds = [...new Set(list.map((s) => s.school_id))];
      const { data: schools } = await supabase
        .from("sms_schools")
        .select("id, name")
        .in("id", schoolIds);
      const names: Record<string, string> = {};
      (schools || []).forEach((sc) => {
        names[String(sc.id)] = sc.name as string;
      });
      list = list.map((s) => ({ ...s, school_name: names[s.school_id] }));
    }
    setSections(list);
  }, [user, schoolYear]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  return (
    <div>
      <div className="app__title">
        <Link
          href="/teacher/assessments"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Assessments
        </Link>
        <h1 className="app__title_text flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          CRLA
        </h1>
      </div>
      <div className="app__content">
        <Card>
          <CardHeader>
            <CardTitle>Comprehensive Rapid Literacy Assessment</CardTitle>
            <CardDescription>
              Choose your advisory section, language, and phase. Print the learner
              sheet and scoresheet, then record each learner&apos;s results.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user?.system_user_id ? (
              <CrlaScoresheetTable
                sections={sections}
                selectedSection={selectedSection}
                setSelectedSection={setSelectedSection}
                schoolYear={schoolYear}
                setSchoolYear={setSchoolYear}
                schoolYearOptions={getSchoolYearOptions()}
                teacherId={user.system_user_id}
                teacherName={user.name ?? ""}
                schoolId={user.school_id ? Number(user.school_id) : null}
                focusStudentId={focusStudentId}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
