"use client";

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
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { EccdPeriod } from "@/types";
import { ClipboardList } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ECCDEntryTable } from "./components/ECCDEntryTable";

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
}

const ECCD_PERIODS: { value: EccdPeriod; label: string }[] = [
  { value: "BOSY", label: "Beginning of School Year (BOSY)" },
  { value: "MOSY", label: "Middle of School Year (MOSY)" },
  { value: "EOSY", label: "End of School Year (EOSY)" },
];

export default function ECCDPage() {
  const user = useAppSelector((state) => state.user.user);
  const searchParams = useSearchParams();

  const [sections, setSections] = useState<SectionOption[]>([]);
  const [sectionId, setSectionId] = useState<string>(
    searchParams.get("section") || ""
  );
  const [schoolYear, setSchoolYear] = useState<string>(
    searchParams.get("school_year") || getCurrentSchoolYear()
  );
  const [period, setPeriod] = useState<EccdPeriod>("BOSY");
  const [loading, setLoading] = useState(true);

  const fetchSections = useCallback(async () => {
    if (!user?.school_id) {
      setSections([]);
      return;
    }
    // Fetch Kindergarten sections (grade_level = 0) where teacher is adviser
    const query = supabase
      .from("sms_sections")
      .select("id, name, grade_level")
      .eq("school_id", user.school_id)
      .eq("school_year", schoolYear)
      .eq("grade_level", 0)
      .eq("is_active", true)
      .order("name");

    // If teacher, only show sections they advise
    if (user.type === "teacher") {
      query.eq("section_adviser_id", user.id);
    }

    const { data } = await query;
    setSections(data || []);
  }, [user?.school_id, user?.id, user?.type, schoolYear]);

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
              Assess Kindergarten learners across 7 developmental domains. Rate
              each competency at the Beginning (BOSY), Middle (MOSY), and End
              (EOSY) of the school year.
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
                  <SelectTrigger className="w-[200px]">
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
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">
                  Assessment Period
                </label>
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

            {sectionId && schoolYear && period && (
              <ECCDEntryTable
                sectionId={sectionId}
                schoolYear={schoolYear}
                period={period}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
