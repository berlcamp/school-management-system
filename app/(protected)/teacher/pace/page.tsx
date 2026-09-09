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
import { ClipboardList, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PaceModal } from "./components/PaceModal";

/**
 * Grade 1 PACE + Progress Card.
 *
 * Entry is per learner rather than per class, because the document being
 * filled in is one learner's competency list with a T1/T2/T3 rating column —
 * so the adviser picks a section, then a learner, and works down the same page
 * the printer will produce.
 */

interface SectionOption {
  id: string;
  name: string;
  school_id: string;
  school_name?: string;
}

interface LearnerOption {
  id: string;
  name: string;
}

export default function PacePage() {
  const user = useAppSelector((state) => state.user.user);
  const searchParams = useSearchParams();

  const [sections, setSections] = useState<SectionOption[]>([]);
  const [sectionId, setSectionId] = useState<string>(
    searchParams.get("section") || "",
  );
  const [schoolYear, setSchoolYear] = useState<string>(
    searchParams.get("school_year") || getCurrentSchoolYear(),
  );
  const [learners, setLearners] = useState<LearnerOption[]>([]);
  const [studentId, setStudentId] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingLearners, setLoadingLearners] = useState(false);

  // Same section resolution as the Kindergarten Progress page: an adviser sees
  // their own Grade 1 sections, a super admin sees every school's so the module
  // can be exercised without holding an advisory.
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
      .select("id, name, school_id")
      .eq("school_year", schoolYear)
      .eq("grade_level", 1)
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

    setSections(rows.map((r) => ({ ...r, school_name: names[r.school_id] })));
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
    if (sectionId && !sections.some((s) => s.id === sectionId)) setSectionId("");
  }, [sections, sectionId]);

  const fetchLearners = useCallback(async () => {
    if (!sectionId || !schoolYear) {
      setLearners([]);
      return;
    }
    setLoadingLearners(true);
    const { data: enrollments } = await supabase
      .from("sms_enrollments")
      .select("student_id")
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .eq("status", "approved");

    const ids = (enrollments || []).map((e) => e.student_id);
    if (ids.length === 0) {
      setLearners([]);
      setLoadingLearners(false);
      return;
    }

    const { data: students } = await supabase
      .from("sms_students")
      .select("id, first_name, middle_name, last_name, suffix")
      .in("id", ids)
      .order("last_name")
      .order("first_name");

    setLearners(
      (students || []).map((s) => ({
        id: String(s.id),
        name: `${s.last_name}, ${s.first_name} ${s.middle_name || ""} ${s.suffix || ""}`
          .replace(/\s+/g, " ")
          .trim(),
      })),
    );
    setLoadingLearners(false);
  }, [sectionId, schoolYear]);

  useEffect(() => {
    void fetchLearners();
    setStudentId("");
  }, [fetchLearners]);

  const selectedSection = sections.find((s) => s.id === sectionId);
  const selectedLearner = learners.find((l) => l.id === studentId);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Grade 1 PACE &amp; Progress Card
        </h1>
      </div>

      <div className="app__content">
        <Card>
          <CardHeader>
            <CardTitle>Performance and Competency Evaluation</CardTitle>
            <CardDescription>
              Grade 1 reports no numeric grades. Rate each learning competency A
              (Advancing), B (Benchmarking), C (Connecting), D (Developing) or E
              (Emerging) per term, write the parent&rsquo;s narrative for each
              term, then print the Progress Card with the PACE pages attached.
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
                <label className="text-sm font-medium">Grade 1 Section</label>
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
                        No Grade 1 sections found
                      </SelectItem>
                    ) : (
                      sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          Grade 1 - {s.name}
                          {s.school_name ? ` (${s.school_name})` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Learner</label>
                <Select
                  value={studentId}
                  onValueChange={setStudentId}
                  disabled={!sectionId || loadingLearners}
                >
                  <SelectTrigger className="w-[300px]">
                    <SelectValue
                      placeholder={
                        loadingLearners ? "Loading..." : "Select learner"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {learners.length === 0 ? (
                      <SelectItem value="__empty" disabled>
                        No enrolled learners
                      </SelectItem>
                    ) : (
                      learners.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loadingLearners && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading learners...
              </p>
            )}

            {selectedSection && selectedLearner && (
              <div className="pt-1">
                <Button onClick={() => setModalOpen(true)} className="gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Open PACE Form
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedSection && selectedLearner && (
        <PaceModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          schoolId={selectedSection.school_id}
          studentId={selectedLearner.id}
          studentName={selectedLearner.name}
          sectionId={sectionId}
          sectionName={selectedSection.name}
          schoolYear={schoolYear}
        />
      )}
    </div>
  );
}
