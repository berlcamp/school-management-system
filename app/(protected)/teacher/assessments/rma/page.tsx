"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RMA_GRADES } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear, getSchoolYearOptions } from "@/lib/utils/schoolYear";
import { Calculator } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RmaScoresheetTable } from "./components/RmaScoresheetTable";

export interface AdviserSection {
  id: string;
  name: string;
  grade_level: number;
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [sections, setSections] = useState<AdviserSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [schoolYear, setSchoolYear] = useState<string>("");

  useEffect(() => {
    setSchoolYear(getCurrentSchoolYear());
  }, []);

  const fetchSections = useCallback(async () => {
    if (!user?.system_user_id || !schoolYear) {
      setSections([]);
      return;
    }
    const { data } = await supabase
      .from("sms_sections")
      .select("id, name, grade_level")
      .eq("section_adviser_id", user.system_user_id)
      .eq("school_year", schoolYear)
      .eq("is_active", true)
      .in("grade_level", RMA_GRADES)
      .order("grade_level");
    setSections((data || []) as AdviserSection[]);
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
          <Calculator className="h-5 w-5" />
          RMA
        </h1>
      </div>
      <div className="app__content">
        <Card>
          <CardHeader>
            <CardTitle>Rapid Mathematics Assessment</CardTitle>
            <CardDescription>
              Record per-item results per learner. Total and mastery band are
              computed automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user?.system_user_id ? (
              <RmaScoresheetTable
                sections={sections}
                selectedSection={selectedSection}
                setSelectedSection={setSelectedSection}
                schoolYear={schoolYear}
                setSchoolYear={setSchoolYear}
                schoolYearOptions={getSchoolYearOptions()}
                teacherId={user.system_user_id}
                teacherName={user.name ?? ""}
                schoolId={user.school_id ? Number(user.school_id) : null}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
