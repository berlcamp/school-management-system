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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  generateSf5Print,
  generateSf6Print,
  generateSf8Print,
  generateSf9Print,
  generateSf10Print,
} from "@/lib/pdf";
import { cn, formatLrn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { ArrowLeft, Check, ChevronsUpDown, ClipboardEdit, FileBarChart, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface StudentOption {
  id: string;
  lrn: string;
  fullName: string;
}

export default function TeacherSchoolFormsPage() {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();
  const searchParams = useSearchParams();

  const sectionId = searchParams.get("section") ?? "";
  const schoolYear = searchParams.get("school_year") ?? "";

  const [sectionName, setSectionName] = useState<string>("");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState<string>("");
  const [generating, setGenerating] = useState<string | null>(null);
  const [sf9Open, setSf9Open] = useState(false);
  const [sf10Open, setSf10Open] = useState(false);
  const [sf10StudentId, setSf10StudentId] = useState<string>("");
  const [sf2Month, setSf2Month] = useState<number>(
    () => new Date().getMonth() + 1,
  );
  const [sf2Year, setSf2Year] = useState<number>(() => new Date().getFullYear());

  const schoolId = String(user?.school_id ?? "");

  const fetchSectionName = useCallback(async () => {
    if (!sectionId) return;
    const { data } = await supabase
      .from("sms_sections")
      .select("name, grade_level")
      .eq("id", sectionId)
      .single();
    if (data) {
      const gradeLabel =
        data.grade_level === -1
          ? "SNED"
          : data.grade_level === 0
            ? "K"
            : `Grade ${data.grade_level}`;
      setSectionName(`${gradeLabel} - ${data.name}`);
    }
  }, [sectionId]);

  const fetchStudents = useCallback(async () => {
    if (!sectionId || !schoolYear) {
      setStudents([]);
      return;
    }
    const { data: enrollments } = await supabase
      .from("sms_enrollments")
      .select("student_id")
      .eq("section_id", sectionId)
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
  }, [sectionId, schoolYear]);

  useEffect(() => {
    fetchSectionName();
    fetchStudents();
  }, [fetchSectionName, fetchStudents]);

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

  const canGenerate = !!(schoolId && schoolYear);
  const canGenerateWithSection = canGenerate && !!sectionId;

  const formCards = [
    {
      key: "SF1",
      title: "SF1 - School Register",
      desc: "Master list of class enrollment by section",
      needsSection: true,
      action: () =>
        generateSf1Print({
          schoolId,
          sectionId: sectionId || null,
          schoolYear,
        }),
    },
    {
      key: "SF2",
      title: "SF2 - Daily Attendance",
      desc: "Daily attendance report of learners by section",
      needsSection: true,
      action: () =>
        generateSf2Print({
          schoolId,
          sectionId,
          schoolYear,
          month: sf2Month,
          year: sf2Year,
        }),
    },
    {
      key: "SF3",
      title: "SF3 - Books Issued/Returned",
      desc: "Books issued and returned by section",
      needsSection: true,
      action: () =>
        generateSf3Print({
          schoolId,
          sectionId,
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
          schoolId,
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
          schoolId,
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
          schoolId,
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
      action: () =>
        generateSf9Print({
          schoolId,
          studentId,
          schoolYear,
        }),
    },
    {
      key: "SF10",
      title: "SF10 - School Form 10 (Permanent Record)",
      desc: "Learner permanent academic record (ES / JHS / SHS)",
      needsSection: false,
      needsStudent: true,
      action: () =>
        generateSf10Print({
          studentId: sf10StudentId,
        }),
    },
  ];

  return (
    <div>
      <div className="app__title">
        <div className="flex items-center gap-2">
          <Link href={sectionId ? `/teacher/sections/${sectionId}` : "/teacher/sections"}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="app__title_text flex items-center gap-2">
            <FileBarChart className="h-5 w-5" />
            School Forms
          </h1>
        </div>
      </div>

      <div className="app__content space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Context</CardTitle>
            <CardDescription>
              Generating forms for this section and school year
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Section</span>
                <span className="font-semibold">{sectionName || "—"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">School Year</span>
                <span className="font-semibold">{schoolYear || "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {formCards.map((form) => {
            const needsSection = "needsSection" in form && form.needsSection;
            const needsStudent = "needsStudent" in form && form.needsStudent;
            const isSf10 = form.key === "SF10";
            const currentStudentId = isSf10 ? sf10StudentId : studentId;
            const setCurrentStudentId = isSf10 ? setSf10StudentId : setStudentId;
            const popOpen = isSf10 ? sf10Open : sf9Open;
            const setPopOpen = isSf10 ? setSf10Open : setSf9Open;
            const enabled =
              (needsSection ? canGenerateWithSection : canGenerate) &&
              (needsStudent ? !!currentStudentId : true);
            const runAction = () => {
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
                <CardContent className="space-y-3">
                  {needsStudent && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Student
                      </label>
                      <Popover open={popOpen} onOpenChange={setPopOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={popOpen}
                            className="h-8 justify-between text-xs font-normal"
                          >
                            <span className="truncate">
                              {currentStudentId
                                ? students.find((s) => s.id === currentStudentId)?.fullName ?? "Select student"
                                : "Search student..."}
                            </span>
                            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Type name or LRN..." className="text-xs" />
                            <CommandList>
                              <CommandEmpty>No student found.</CommandEmpty>
                              <CommandGroup>
                                {students.map((s) => (
                                  <CommandItem
                                    key={s.id}
                                    // Carry both spellings of the LRN so a paste
                                    // of the dashed display form still matches.
                                    value={`${s.fullName} ${s.lrn} ${formatLrn(s.lrn)}`}
                                    onSelect={() => {
                                      setCurrentStudentId(s.id);
                                      setPopOpen(false);
                                    }}
                                    className="text-xs"
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-3 w-3",
                                        currentStudentId === s.id ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    {s.fullName} ({s.lrn})
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                  {form.key === "SF2" && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Month
                        </label>
                        <Select
                          value={String(sf2Month)}
                          onValueChange={(v) => setSf2Month(Number(v))}
                        >
                          <SelectTrigger className="w-[130px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              "January", "February", "March", "April",
                              "May", "June", "July", "August",
                              "September", "October", "November", "December",
                            ].map((m, i) => (
                              <SelectItem key={i + 1} value={String(i + 1)}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Year
                        </label>
                        <Select
                          value={String(sf2Year)}
                          onValueChange={(v) => setSf2Year(Number(v))}
                        >
                          <SelectTrigger className="w-[90px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 5 }, (_, i) => {
                              const y = new Date().getFullYear() - 2 + i;
                              return (
                                <SelectItem key={y} value={String(y)}>
                                  {y}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={runAction}
                      disabled={!enabled || !!generating}
                    >
                      {generating === form.key ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Generate &amp; Print
                    </Button>
                    {isSf10 && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!sf10StudentId}
                        onClick={() => {
                          const params = new URLSearchParams({
                            studentId: sf10StudentId,
                            from: `/teacher/school-forms?section=${sectionId}&school_year=${schoolYear}`,
                          });
                          router.push(`/reports/sf10/historical?${params.toString()}`);
                        }}
                      >
                        <ClipboardEdit className="mr-1.5 h-3.5 w-3.5" />
                        Encode Historical Grades
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
