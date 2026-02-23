"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { ClipboardCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AttendanceEntryTable } from "./components/AttendanceEntryTable";

interface SchoolOption {
  id: string;
  name: string;
}

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
  school_id?: string | null;
}

export default function AttendancePage() {
  const user = useAppSelector((state) => state.user.user);
  const isDivisionAdmin = user?.type === "division_admin";
  const isTeacher = user?.type === "teacher";

  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [schoolId, setSchoolId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [schoolYear, setSchoolYear] = useState<string>(getCurrentSchoolYear());
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [loading, setLoading] = useState(true);

  const effectiveSchoolId = isDivisionAdmin
    ? schoolId
    : ((user?.school_id as string | undefined) ?? "");

  const fetchSchools = useCallback(async () => {
    const { data } = await supabase
      .from("sms_schools")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    setSchools(data || []);
  }, []);

  const fetchSections = useCallback(async () => {
    if (isTeacher && user?.system_user_id) {
      // Teachers: only sections where they are section adviser
      const { data } = await supabase
        .from("sms_sections")
        .select("id, name, grade_level, school_id")
        .eq("section_adviser_id", user.system_user_id)
        .eq("school_year", schoolYear)
        .eq("is_active", true)
        .order("grade_level")
        .order("name");
      setSections(data || []);
    } else if (effectiveSchoolId) {
      // School staff / division admin: all sections in school
      const { data } = await supabase
        .from("sms_sections")
        .select("id, name, grade_level, school_id")
        .eq("school_id", effectiveSchoolId)
        .eq("school_year", schoolYear)
        .eq("is_active", true)
        .order("grade_level")
        .order("name");
      setSections(data || []);
    } else {
      setSections([]);
    }
  }, [isTeacher, user, effectiveSchoolId, schoolYear]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      if (isDivisionAdmin) {
        await fetchSchools();
      } else if (user?.school_id) {
        setSchoolId(String(user.school_id));
      }
      setLoading(false);
    };
    load();
  }, [isDivisionAdmin, user?.school_id, fetchSchools]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  // Reset section when school/year changes and it's no longer valid
  useEffect(() => {
    const valid = sections.some((s) => s.id === sectionId);
    if (sectionId && !valid) {
      setSectionId("");
    }
  }, [sections, sectionId]);

  const selectedSection = sections.find((s) => s.id === sectionId);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Attendance Records
        </h1>
      </div>

      <div className="app__content">
        <Card>
          <CardHeader>
            <CardTitle>Daily Class Attendance</CardTitle>
            <CardDescription>
              Select section and date to record or view attendance. Used for SF2
              (Learner&apos;s Daily Class Attendance).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              {isDivisionAdmin && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">School</label>
                  <Select
                    value={schoolId}
                    onValueChange={setSchoolId}
                    disabled={loading}
                  >
                    <SelectTrigger className="w-[280px]">
                      <SelectValue placeholder="Select school" />
                    </SelectTrigger>
                    <SelectContent>
                      {schools.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">School Year</label>
                <Select value={schoolYear} onValueChange={setSchoolYear}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getSchoolYearOptions().map((sy) => (
                      <SelectItem key={sy} value={sy}>
                        {sy}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Section</label>
                <Select value={sectionId} onValueChange={setSectionId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.grade_level === 0 ? "K" : s.grade_level} - {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-[160px]"
                />
              </div>
            </div>

            {sectionId && date && schoolYear && (
              <AttendanceEntryTable
                sectionId={sectionId}
                schoolYear={schoolYear}
                date={date}
                schoolId={selectedSection?.school_id ?? effectiveSchoolId}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
