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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ARAL_PROGRAMS,
  ASSESSMENT_PHASES,
  getGradeLevelLabel,
} from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import type { AralProgram } from "@/types";
import { Sprout } from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AralCandidatesTable } from "../components/AralCandidatesTable";
import { AralRosterTable } from "../components/AralRosterTable";

export interface AdviserSection {
  id: string;
  name: string;
  grade_level: number;
  school_id: string;
  school_name?: string;
}

export default function Page() {
  const params = useParams<{ program: string }>();
  const program = params.program as AralProgram;
  const info = ARAL_PROGRAMS.find((p) => p.value === program);

  const user = useAppSelector((state) => state.user.user);
  const [sections, setSections] = useState<AdviserSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [schoolYear, setSchoolYear] = useState<string>(getCurrentSchoolYear());
  const [phase, setPhase] = useState<string>("BoSY");
  // Bumped after an enroll to force the roster to reload.
  const [rosterVersion, setRosterVersion] = useState(0);

  const fetchSections = useCallback(async () => {
    if (!user?.system_user_id || !schoolYear || !info) {
      setSections([]);
      return;
    }
    const isSuperAdmin = user.type === "super admin";
    let query = supabase
      .from("sms_sections")
      .select("id, name, grade_level, school_id")
      .eq("school_year", schoolYear)
      .eq("is_active", true)
      .in("grade_level", info.grades)
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
  }, [user, schoolYear, info]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  if (!info) {
    notFound();
  }

  const section = sections.find((s) => s.id === selectedSection) || null;
  const isSummer = program === "summer";

  return (
    <div>
      <div className="app__title">
        <Link
          href="/teacher/aral"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← ARAL
        </Link>
        <h1 className="app__title_text flex items-center gap-2">
          <Sprout className="h-5 w-5" />
          {info.label}
        </h1>
      </div>

      <div className="app__content">
        <Card>
          <CardHeader>
            <CardTitle>{info.subtitle}</CardTitle>
            <CardDescription>{info.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-36">
                <label className="text-sm font-medium mb-1.5 block">
                  School Year
                </label>
                <Select value={schoolYear} onValueChange={setSchoolYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getSchoolYearOptions().map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-52">
                <label className="text-sm font-medium mb-1.5 block">
                  Section
                </label>
                <Select
                  value={selectedSection}
                  onValueChange={setSelectedSection}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select advisory section" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} — {getGradeLevelLabel(s.grade_level)}
                        {s.school_name ? ` · ${s.school_name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!isSummer && (
                <div className="w-44">
                  <label className="text-sm font-medium mb-1.5 block">
                    Basis Phase
                  </label>
                  <Select value={phase} onValueChange={setPhase}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSESSMENT_PHASES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {isSummer && (
              <p className="text-xs text-muted-foreground">
                Summer candidates are drawn from the End-of-School-Year (EoSY)
                Reading and Math results.
              </p>
            )}

            {sections.length === 0 && (
              <p className="text-sm text-muted-foreground py-6">
                You have no advisory section for this program&apos;s grade range
                in {schoolYear}.
              </p>
            )}

            {section && (
              <Tabs defaultValue="candidates">
                <TabsList>
                  <TabsTrigger value="candidates">Candidates</TabsTrigger>
                  <TabsTrigger value="roster">Enrolled</TabsTrigger>
                </TabsList>
                <TabsContent value="candidates" className="pt-4">
                  <AralCandidatesTable
                    program={program}
                    section={section}
                    schoolYear={schoolYear}
                    phase={isSummer ? "EoSY" : phase}
                    teacherId={
                      user?.system_user_id
                        ? Number(user.system_user_id)
                        : null
                    }
                    onEnrolled={() => setRosterVersion((v) => v + 1)}
                  />
                </TabsContent>
                <TabsContent value="roster" className="pt-4">
                  <AralRosterTable
                    program={program}
                    section={section}
                    schoolYear={schoolYear}
                    reloadKey={rosterVersion}
                  />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
