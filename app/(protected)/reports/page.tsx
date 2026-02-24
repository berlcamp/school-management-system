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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generateSf1Print,
  generateSf2Print,
  generateSf3Print,
  generateSf4Print,
  generateSf5Print,
  generateSf6Print,
  generateSf7Print,
  generateSf8Print,
  generateSf9Print,
} from "@/lib/pdf";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { FileBarChart, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface SchoolOption {
  id: string;
  name: string;
}

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
}

interface StudentOption {
  id: string;
  lrn: string;
  fullName: string;
}

export default function ReportsPage() {
  const user = useAppSelector((state) => state.user.user);
  const isDivisionAdmin = user?.type === "division_admin";

  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [schoolId, setSchoolId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [schoolYear, setSchoolYear] = useState<string>(getCurrentSchoolYear());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [sf9ModalOpen, setSf9ModalOpen] = useState(false);
  const [sf10ModalOpen, setSf10ModalOpen] = useState(false);
  const [sf2Date, setSf2Date] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  );

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
    if (!effectiveSchoolId) {
      setSections([]);
      return;
    }
    const { data } = await supabase
      .from("sms_sections")
      .select("id, name, grade_level")
      .eq("school_id", effectiveSchoolId)
      .eq("school_year", schoolYear)
      .eq("is_active", true)
      .order("grade_level")
      .order("name");
    setSections(data || []);
  }, [effectiveSchoolId, schoolYear]);

  const fetchStudents = useCallback(async () => {
    if (!effectiveSchoolId) {
      setStudents([]);
      return;
    }
    const { data: sectionList } = await supabase
      .from("sms_sections")
      .select("id")
      .eq("school_id", effectiveSchoolId)
      .eq("school_year", schoolYear);
    const secIds = (sectionList || []).map((s) => s.id);
    if (secIds.length === 0) {
      setStudents([]);
      return;
    }
    const { data: enrollments } = await supabase
      .from("sms_enrollments")
      .select("student_id")
      .in("section_id", secIds)
      .eq("school_year", schoolYear)
      .eq("status", "approved");

    const ids = [...new Set((enrollments || []).map((e) => e.student_id))];
    if (ids.length === 0) {
      setStudents([]);
      return;
    }
    const { data: studentList } = await supabase
      .from("sms_students")
      .select("id, lrn, first_name, middle_name, last_name, suffix")
      .in("id", ids)
      .order("last_name")
      .order("first_name");

    const opts: StudentOption[] = (studentList || []).map((s) => ({
      id: s.id,
      lrn: s.lrn,
      fullName:
        `${s.last_name}, ${s.first_name} ${s.middle_name || ""} ${s.suffix || ""}`.trim(),
    }));
    setStudents(opts);
  }, [effectiveSchoolId, schoolYear]);

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
    if (effectiveSchoolId) {
      fetchSections();
      fetchStudents();
    } else {
      setSections([]);
      setStudents([]);
    }
  }, [effectiveSchoolId, schoolYear, fetchSections, fetchStudents]);

  const handleGenerate = async (formKey: string, fn: () => Promise<void>) => {
    try {
      setGenerating(formKey);
      await fn();
      toast.success(
        `${formKey} generated. Use browser print (Ctrl/Cmd+P) to save as PDF.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate form",
      );
    } finally {
      setGenerating(null);
    }
  };

  const canGenerate = effectiveSchoolId && schoolYear;
  const canGenerateWithSection = canGenerate && sectionId;

  const formCards = [
    {
      key: "SF1",
      title: "SF1 - School Register",
      desc: "Master list of class enrollment by section",
      needsSection: true,
      action: () =>
        generateSf1Print({
          schoolId: effectiveSchoolId,
          sectionId: sectionId || null,
          schoolYear,
        }),
    },
    {
      key: "SF2",
      title: "SF2 - Daily Attendance",
      desc: "Daily attendance by section (uses recorded data)",
      needsSection: true,
      action: () =>
        generateSf2Print({
          schoolId: effectiveSchoolId,
          sectionId,
          schoolYear,
          date: sf2Date,
        }),
    },
    {
      key: "SF3",
      title: "SF3 - Books Issued/Returned",
      desc: "Books issued and returned by section",
      needsSection: true,
      action: () =>
        generateSf3Print({
          schoolId: effectiveSchoolId,
          sectionId,
          schoolYear,
        }),
    },
    {
      key: "SF4",
      title: "SF4 - Monthly Learner Movement",
      desc: "Enrollment count and movements by grade level",
      needsSection: false,
      action: () =>
        generateSf4Print({
          schoolId: effectiveSchoolId,
          schoolYear,
        }),
    },
    {
      key: "SF5",
      title: "SF5 - Report on Promotion",
      desc: "Promoted/retained learners by section",
      needsSection: true,
      action: () =>
        generateSf5Print({
          schoolId: effectiveSchoolId,
          sectionId: sectionId || null,
          schoolYear,
        }),
    },
    {
      key: "SF6",
      title: "SF6 - Summary Report on Promotion",
      desc: "Grade-level summary of promotion",
      needsSection: false,
      action: () =>
        generateSf6Print({
          schoolId: effectiveSchoolId,
          schoolYear,
        }),
    },
    {
      key: "SF7",
      title: "SF7 - School Personnel Assignment",
      desc: "Personnel list with teaching load",
      needsSection: false,
      action: () =>
        generateSf7Print({
          schoolId: effectiveSchoolId,
          schoolYear,
        }),
    },
    {
      key: "SF8",
      title: "SF8 - Learner Basic Health",
      desc: "Learner health and nutrition by section.",
      needsSection: true,
      action: () =>
        generateSf8Print({
          schoolId: effectiveSchoolId,
          sectionId,
          schoolYear,
        }),
    },
    {
      key: "SF9",
      title: "SF9 - Progress Report Card",
      desc: "Individual learner grades per quarter",
      needsSection: false,
      needsStudent: true,
      action: () => {
        if (!studentId) {
          setSf9ModalOpen(true);
          return Promise.resolve();
        }
        return generateSf9Print({
          schoolId: effectiveSchoolId,
          studentId,
          schoolYear,
        });
      },
    },
    {
      key: "SF10",
      title: "SF10 - Permanent Record (Form 137)",
      desc: "Learner permanent academic record",
      needsSection: false,
      needsStudent: true,
      action: () => {
        setSf10ModalOpen(true);
        return Promise.resolve();
      },
    },
  ];

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <FileBarChart className="h-5 w-5" />
          DepEd School Forms (SF 1-10)
        </h1>
      </div>

      <div className="app__content space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Select school, section, and school year to generate reports
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                    <SelectValue placeholder="All sections (for SF1/SF5)" />
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
                <label className="text-sm font-medium">Date (SF2)</label>
                <Input
                  type="date"
                  value={sf2Date}
                  onChange={(e) => setSf2Date(e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Student (SF9)</label>
                <Select value={studentId} onValueChange={setStudentId}>
                  <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="Select student for SF9" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.fullName} ({s.lrn})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {formCards.map((form) => {
            const needsSection = "needsSection" in form && form.needsSection;
            const needsStudent = "needsStudent" in form && form.needsStudent;
            const enabled =
              (needsSection ? canGenerateWithSection : canGenerate) &&
              (needsStudent ? !!studentId : true);
            const runAction = () => {
              if (form.key === "SF9" && !studentId) {
                setSf9ModalOpen(true);
                return;
              }
              handleGenerate(form.key, form.action);
            };
            return (
              <Card key={form.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {form.title}
                  </CardTitle>
                  <CardDescription>{form.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  {form.key === "SF10" ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/form137/requests">
                        Open Requests
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={runAction}
                      disabled={!enabled || !!generating}
                    >
                      {generating === form.key ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Generate
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={sf9ModalOpen} onOpenChange={setSf9ModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Student for SF9</DialogTitle>
            <DialogDescription>
              Choose a student from the filters above, then click Generate on
              SF9.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={sf10ModalOpen} onOpenChange={setSf10ModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>SF10 - Form 137 (Permanent Record)</DialogTitle>
            <DialogDescription>
              SF10 is the same as Form 137. Go to Requests to approve
              and generate permanent records for students.
            </DialogDescription>
          </DialogHeader>
          <Button asChild>
            <Link href="/form137/requests">Open Requests</Link>
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
