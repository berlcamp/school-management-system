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
import {
  KINDER_PROGRESS_TERMS,
  KINDER_TERM_LABELS,
  KINDER_TERM_LABELS_FILIPINO,
} from "@/lib/constants/kinderProgress";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import type { KinderProgressTerm } from "@/types";
import { Baby } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { KinderProgressModal } from "./components/KinderProgressModal";

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
  school_name?: string;
}

export default function KinderProgressPage() {
  const user = useAppSelector((state) => state.user.user);
  const searchParams = useSearchParams();

  const [sections, setSections] = useState<SectionOption[]>([]);
  const [sectionId, setSectionId] = useState<string>(
    searchParams.get("section") || "",
  );
  const [schoolYear, setSchoolYear] = useState<string>(
    searchParams.get("school_year") || getCurrentSchoolYear(),
  );
  const [term, setTerm] = useState<KinderProgressTerm>(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Same section resolution as the ECCD page: an adviser sees their own
  // Kindergarten sections, a super admin sees every school's so the module can
  // be exercised without holding an advisory.
  const fetchSections = useCallback(async () => {
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
    void load();
  }, [fetchSections]);

  useEffect(() => {
    if (sectionId && !sections.some((s) => s.id === sectionId)) {
      setSectionId("");
    }
  }, [sections, sectionId]);

  const selectedSection = sections.find((s) => s.id === sectionId);
  const canOpen = !!(sectionId && schoolYear);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <Baby className="h-5 w-5" />
          Kindergarten Progress Report
        </h1>
      </div>

      <div className="app__content">
        <Card>
          <CardHeader>
            <CardTitle>Kindergarten Progress Report</CardTitle>
            <CardDescription>
              Rate each Kindergarten Curriculum Guide competency as BG
              (Beginning), DV (Developing) or CO (Consistent) every ten weeks,
              then print the parent&rsquo;s copy. Ratings are recorded per term;
              the printed card carries all three terms side by side.
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
                <label className="text-sm font-medium">Term</label>
                <Select
                  value={String(term)}
                  onValueChange={(v) =>
                    setTerm(Number(v) as KinderProgressTerm)
                  }
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDER_PROGRESS_TERMS.map((t) => (
                      <SelectItem key={t} value={String(t)}>
                        {KINDER_TERM_LABELS[t]} ({KINDER_TERM_LABELS_FILIPINO[t]}
                        )
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {canOpen && (
              <div className="pt-1">
                <Button onClick={() => setModalOpen(true)} className="gap-2">
                  <Baby className="h-4 w-4" />
                  Open Progress Report
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedSection && (
        <KinderProgressModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          sectionId={sectionId}
          sectionName={selectedSection.name}
          schoolYear={schoolYear}
          term={term}
        />
      )}
    </div>
  );
}
