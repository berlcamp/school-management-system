"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isTeacherRole } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { EccdPeriod } from "@/types";
import { ClipboardList } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ECCDModal } from "./components/ECCDModal";

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
  school_name?: string;
}

const ECCD_PERIODS: { value: EccdPeriod; label: string }[] = [
  { value: "1ST_SEM", label: "1st Semester" },
  { value: "2ND_SEM", label: "2nd Semester" },
];

export default function ECCDPage() {
  const user = useAppSelector((state) => state.user.user);
  const searchParams = useSearchParams();

  const [sections, setSections] = useState<SectionOption[]>([]);
  const [sectionId, setSectionId] = useState<string>(
    searchParams.get("section") || "",
  );
  const [schoolYear, setSchoolYear] = useState<string>(
    searchParams.get("school_year") || getCurrentSchoolYear(),
  );
  const [period, setPeriod] = useState<EccdPeriod>("1ST_SEM");
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSections = useCallback(async () => {
    // Super admins see every Kindergarten section, in every school, so the
    // module can be exercised without holding an advisory. Same shape as the
    // assessments pages.
    const isSuperAdmin = user?.type === "super admin";
    if (!user || (!user.school_id && !isSuperAdmin)) {
      setSections([]);
      return;
    }
    if (isTeacherRole(user.type) && user.system_user_id == null) {
      setSections([]);
      return;
    }
    let query = supabase
      .from("sms_sections")
      .select("id, name, grade_level, school_id")
      .eq("school_year", schoolYear)
      .eq("grade_level", 0)
      .eq("is_active", true)
      .order("name");

    if (!isSuperAdmin) {
      query = query
        .eq("school_id", user.school_id)
        .eq("section_adviser_id", user.system_user_id);
    }

    const { data } = await query;
    const rows = (data || []).map((s) => ({
      id: String(s.id),
      name: s.name as string,
      grade_level: s.grade_level as number,
      school_id: String(s.school_id),
    }));

    // Across schools the section name alone is ambiguous, so name the school.
    let names: Record<string, string> = {};
    if (isSuperAdmin && rows.length > 0) {
      const { data: schools } = await supabase
        .from("sms_schools")
        .select("id, name")
        .in("id", [...new Set(rows.map((r) => r.school_id))]);
      names = Object.fromEntries(
        (schools || []).map((sc) => [String(sc.id), sc.name as string]),
      );
    }

    setSections(
      rows.map(({ school_id, ...rest }) => ({
        ...rest,
        school_name: names[school_id],
      })),
    );
  }, [user, schoolYear]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchSections();
      setLoading(false);
    };
    load();
  }, [fetchSections]);

  useEffect(() => {
    const valid = sections.some((s) => s.id === sectionId);
    if (sectionId && !valid) {
      setSectionId("");
    }
  }, [sections, sectionId]);

  const selectedSection = sections.find((s) => s.id === sectionId);
  const canOpen = !!(sectionId && schoolYear && period);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          ECCD Checklist
        </h1>
      </div>

      <div className="app__content">
        <Card>
          <CardHeader>
            <CardTitle>
              Revised Philippine Early Childhood Development (ECCD) Checklist
            </CardTitle>
            <CardDescription>
              Assess Kindergarten learners across developmental domains. Check
              each competency item the child can perform for the 1st and 2nd
              semester of the school year.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
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
                <label className="text-sm font-medium">
                  Kindergarten Section
                </label>
                <Select
                  value={sectionId}
                  onValueChange={setSectionId}
                  disabled={loading}
                >
                  <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.length === 0 ? (
                      <SelectItem value="__empty" disabled>
                        No Kindergarten sections found
                      </SelectItem>
                    ) : (
                      sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          K - {s.name}
                          {s.school_name ? ` (${s.school_name})` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Assessment Period</label>
                <Select
                  value={period}
                  onValueChange={(v) => setPeriod(v as EccdPeriod)}
                >
                  <SelectTrigger className="w-[300px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ECCD_PERIODS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {canOpen && (
              <div className="pt-1">
                <Button onClick={() => setModalOpen(true)} className="gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Open ECCD Checklist
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedSection && (
        <ECCDModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          sectionId={sectionId}
          sectionName={selectedSection.name}
          schoolYear={schoolYear}
          period={period}
        />
      )}
    </div>
  );
}
