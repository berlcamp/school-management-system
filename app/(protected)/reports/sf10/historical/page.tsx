"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { HistoricalGrades } from "@/types/database";
import {
  ArrowLeft,
  ClipboardEdit,
  Edit,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import HistoricalGradeForm from "./components/HistoricalGradeForm";

interface StudentInfo {
  id: string;
  lrn: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  grade_level: number | null;
  school_id: string;
}

interface SchoolInfo {
  name: string;
  school_id: string;
  district: string | null;
  division_id: string | null;
  region: string | null;
}

type FormType = "ES" | "JHS" | "SHS";

interface GradeLevelCard {
  gradeLevel: number;
  semester: number | null;
  label: string;
  status: "system" | "historical" | "none";
  historicalRecord?: HistoricalGrades;
  isFuture: boolean;
}

function getFormType(gl: number | null): FormType {
  if (gl === null || gl <= 6) return "ES";
  if (gl <= 10) return "JHS";
  return "SHS";
}

function buildCards(
  formType: FormType,
  currentGradeLevel: number,
  systemGradeLevels: Set<string>,
  historicalMap: Map<string, HistoricalGrades>,
): GradeLevelCard[] {
  const cards: GradeLevelCard[] = [];

  if (formType === "ES") {
    for (let gl = 0; gl <= 6; gl++) {
      const key = `${gl}-0`;
      cards.push({
        gradeLevel: gl,
        semester: null,
        label: gl === 0 ? "Kindergarten" : `Grade ${gl}`,
        status: systemGradeLevels.has(key)
          ? "system"
          : historicalMap.has(key)
            ? "historical"
            : "none",
        historicalRecord: historicalMap.get(key),
        isFuture: gl > currentGradeLevel,
      });
    }
  } else if (formType === "JHS") {
    for (let gl = 7; gl <= 10; gl++) {
      const key = `${gl}-0`;
      cards.push({
        gradeLevel: gl,
        semester: null,
        label: `Grade ${gl}`,
        status: systemGradeLevels.has(key)
          ? "system"
          : historicalMap.has(key)
            ? "historical"
            : "none",
        historicalRecord: historicalMap.get(key),
        isFuture: gl > currentGradeLevel,
      });
    }
  } else {
    // SHS
    for (const gl of [11, 12]) {
      for (const sem of [1, 2]) {
        const key = `${gl}-${sem}`;
        cards.push({
          gradeLevel: gl,
          semester: sem,
          label: `Grade ${gl} – Semester ${sem}`,
          status: systemGradeLevels.has(key)
            ? "system"
            : historicalMap.has(key)
              ? "historical"
              : "none",
          historicalRecord: historicalMap.get(key),
          isFuture:
            gl > currentGradeLevel ||
            (gl === currentGradeLevel && sem > 1),
        });
      }
    }
  }

  return cards;
}

export default function HistoricalGradesPage() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get("studentId") || "";
  const user = useAppSelector((state) => state.user.user);

  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<GradeLevelCard[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [formGradeLevel, setFormGradeLevel] = useState(0);
  const [formSemester, setFormSemester] = useState<number | null>(null);
  const [formExisting, setFormExisting] = useState<HistoricalGrades | null>(
    null,
  );

  const loadData = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);

    try {
      // Fetch student
      const { data: studentData } = await supabase
        .from("sms_students")
        .select(
          "id, lrn, first_name, middle_name, last_name, suffix, grade_level, school_id",
        )
        .eq("id", studentId)
        .single();

      if (!studentData) {
        toast.error("Student not found");
        return;
      }
      setStudent(studentData as StudentInfo);

      // Fetch school info
      const { data: schoolData } = await supabase
        .from("sms_schools")
        .select("name, school_id, district, division_id, region")
        .eq("id", studentData.school_id)
        .single();

      setSchool(schoolData as SchoolInfo | null);

      const currentGL = studentData.grade_level ?? 0;
      const formType = getFormType(currentGL);

      // Fetch system grades to see which levels already have data
      const { data: systemGrades } = await supabase
        .from("sms_grades")
        .select("section:sms_sections(grade_level), grading_period, school_year")
        .eq("student_id", studentId);

      const systemGradeLevels = new Set<string>();
      (systemGrades || []).forEach((g: Record<string, unknown>) => {
        const section = g.section as { grade_level: number } | null;
        if (section?.grade_level != null) {
          if (section.grade_level >= 11) {
            // SHS: determine semester from grading_period
            const gp = g.grading_period as number;
            const sem = gp <= 2 ? 1 : 2;
            systemGradeLevels.add(`${section.grade_level}-${sem}`);
          } else {
            systemGradeLevels.add(`${section.grade_level}-0`);
          }
        }
      });

      // Fetch historical grades
      const { data: historicalData } = await supabase
        .from("sms_historical_grades")
        .select("*")
        .eq("student_id", studentId);

      const historicalMap = new Map<string, HistoricalGrades>();
      (historicalData || []).forEach((hg: HistoricalGrades) => {
        const key = `${hg.grade_level}-${hg.semester ?? 0}`;
        historicalMap.set(key, hg);
      });

      setCards(buildCards(formType, currentGL, systemGradeLevels, historicalMap));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEncode = (card: GradeLevelCard) => {
    setFormGradeLevel(card.gradeLevel);
    setFormSemester(card.semester);
    setFormExisting(null);
    setFormOpen(true);
  };

  const handleEdit = (card: GradeLevelCard) => {
    setFormGradeLevel(card.gradeLevel);
    setFormSemester(card.semester);
    setFormExisting(card.historicalRecord || null);
    setFormOpen(true);
  };

  const handleDelete = async (card: GradeLevelCard) => {
    if (!card.historicalRecord) return;
    if (!confirm(`Delete the historical record for ${card.label}?`)) return;

    setDeleting(card.historicalRecord.id);
    try {
      const { error } = await supabase
        .from("sms_historical_grades")
        .delete()
        .eq("id", card.historicalRecord.id);
      if (error) throw error;
      toast.success("Historical record deleted");
      loadData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete record",
      );
    } finally {
      setDeleting(null);
    }
  };

  if (!studentId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No student ID provided.
      </div>
    );
  }

  const fullName = student
    ? `${student.last_name}, ${student.first_name} ${student.middle_name || ""} ${student.suffix || ""}`.trim()
    : "";

  const formTypeLabel =
    student?.grade_level != null
      ? student.grade_level <= 6
        ? "SF10-ES"
        : student.grade_level <= 10
          ? "SF10-JHS"
          : "SF10-SHS"
      : "";

  const defaultSchoolInfo = {
    schoolName: school?.name || "",
    schoolIdCode: school?.school_id || "",
    district: school?.district || "",
    division: school?.division_id || "",
    region: school?.region || "",
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardEdit className="h-5 w-5" />
          Encode Historical Grades
        </h1>
      </div>

      <div className="app__content space-y-5">
        <Link
          href="/reports/sf10"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to SF10
        </Link>

        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading student data…
          </div>
        ) : student ? (
          <>
            {/* Student Info Header */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{fullName}</CardTitle>
                    <CardDescription>
                      LRN: {student.lrn} &middot; Current Grade Level:{" "}
                      {student.grade_level === -1
                        ? "SNED"
                        : student.grade_level === 0
                          ? "Kindergarten"
                          : `Grade ${student.grade_level}`}
                    </CardDescription>
                  </div>
                  {formTypeLabel && (
                    <Badge variant="outline" className="text-sm">
                      <FileText className="mr-1 h-3.5 w-3.5" />
                      {formTypeLabel}
                    </Badge>
                  )}
                </div>
              </CardHeader>
            </Card>

            {/* Grade Level Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {cards.map((card) => {
                const key = `${card.gradeLevel}-${card.semester ?? 0}`;
                return (
                  <Card
                    key={key}
                    className={`${card.isFuture ? "opacity-50" : ""}`}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{card.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {card.status === "system" && (
                          <Badge className="bg-green-100 text-green-800 border-green-200">
                            System Record
                          </Badge>
                        )}
                        {card.status === "historical" && (
                          <>
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                              Historical Record
                            </Badge>
                            {card.historicalRecord && (
                              <p className="text-xs text-muted-foreground">
                                SY: {card.historicalRecord.school_year}
                                {card.historicalRecord.school_name &&
                                  ` • ${card.historicalRecord.school_name}`}
                              </p>
                            )}
                          </>
                        )}
                        {card.status === "none" && (
                          <Badge variant="secondary">No Record</Badge>
                        )}

                        <div className="flex gap-2 pt-1">
                          {card.status === "none" && !card.isFuture && (
                            <Button
                              size="sm"
                              onClick={() => handleEncode(card)}
                            >
                              <ClipboardEdit className="mr-1.5 h-3.5 w-3.5" />
                              Encode
                            </Button>
                          )}
                          {card.status === "historical" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(card)}
                              >
                                <Edit className="mr-1.5 h-3.5 w-3.5" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive"
                                onClick={() => handleDelete(card)}
                                disabled={deleting === card.historicalRecord?.id}
                              >
                                {deleting === card.historicalRecord?.id ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Delete
                              </Button>
                            </>
                          )}
                          {card.isFuture && card.status === "none" && (
                            <p className="text-xs text-muted-foreground italic">
                              Future grade level
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              <strong>System Record</strong> — grades exist in the system
              (read-only). <strong>Historical Record</strong> — manually encoded
              grades. <strong>No Record</strong> — no data for this grade level
              yet.
            </p>
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            Student not found.
          </div>
        )}
      </div>

      {/* Historical Grade Form Dialog */}
      {student && (
        <HistoricalGradeForm
          open={formOpen}
          onOpenChange={setFormOpen}
          studentId={student.id}
          schoolId={student.school_id}
          gradeLevel={formGradeLevel}
          semester={formSemester}
          existing={formExisting}
          defaultSchoolInfo={defaultSchoolInfo}
          onSaved={loadData}
          encodedBy={user?.id || ""}
        />
      )}
    </div>
  );
}
