"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { Student } from "@/types";
import { GraduationCap, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { StudentFilter } from "../components/StudentFilter";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [students, setStudents] = useState<
    (Student & {
      section_id?: string;
      section_name?: string;
      section_grade_level?: number;
    })[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<{
    section_id?: string;
    subject_id?: string;
    school_year: string;
  }>({
    section_id: undefined,
    subject_id: undefined,
    school_year: "",
  });

  useEffect(() => {
    setFilter((prev) => ({ ...prev, school_year: getCurrentSchoolYear() }));
  }, []);

  const fetchStudents = useCallback(async () => {
    if (!user?.system_user_id || !filter.school_year) return;

    setLoading(true);
    try {
      // Get teacher's assigned section IDs
      const sectionIds = new Set<string>();

      // Sections where teacher is adviser
      const { data: adviserSections } = await supabase
        .from("sms_sections")
        .select("id")
        .eq("section_adviser_id", user.system_user_id)
        .eq("school_year", filter.school_year)
        .eq("is_active", true)
        .is("deleted_at", null);

      adviserSections?.forEach((s) => sectionIds.add(s.id));

      // Sections via subject assignments
      const { data: assignmentSections } = await supabase
        .from("sms_subject_assignments")
        .select("section_id")
        .eq("teacher_id", user.system_user_id)
        .eq("school_year", filter.school_year)
        .not("section_id", "is", null);

      assignmentSections?.forEach((a) => {
        if (a.section_id) sectionIds.add(a.section_id);
      });

      if (sectionIds.size === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      // Filter by selected section if provided
      const targetSectionIds = filter.section_id
        ? [filter.section_id]
        : Array.from(sectionIds);

      // Get students from those sections
      const { data: sectionStudents } = await supabase
        .from("sms_section_students")
        .select("student_id, section_id")
        .in("section_id", targetSectionIds)
        .eq("school_year", filter.school_year)
        .is("transferred_at", null);

      if (!sectionStudents || sectionStudents.length === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      const studentIds = sectionStudents.map((ss) => ss.student_id);

      // Fetch student details
      let query = supabase
        .from("sms_students")
        .select("*")
        .in("id", studentIds)
        .is("deleted_at", null);

      // If subject filter is applied, we need to filter by students in sections
      // that have this subject assigned to the teacher
      if (filter.subject_id) {
        // Get sections where teacher teaches this subject
        const { data: subjectAssignments } = await supabase
          .from("sms_subject_assignments")
          .select("section_id")
          .eq("teacher_id", user.system_user_id)
          .eq("subject_id", filter.subject_id)
          .eq("school_year", filter.school_year)
          .not("section_id", "is", null);

        const subjectSectionIds = new Set<string>();
        subjectAssignments?.forEach((a) => {
          if (a.section_id) subjectSectionIds.add(a.section_id);
        });

        // Filter section students by subject sections
        const filteredSectionStudents = sectionStudents.filter((ss) =>
          subjectSectionIds.has(ss.section_id)
        );

        const filteredStudentIds = filteredSectionStudents.map(
          (ss) => ss.student_id
        );
        query = query.in("id", filteredStudentIds);
      }

      const { data: studentsData } = await query
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true });

      if (studentsData) {
        // Create a map of student_id to section_id
        const studentSectionMap = new Map<string, string>();
        sectionStudents.forEach((ss) => {
          studentSectionMap.set(ss.student_id, ss.section_id);
        });

        // Fetch section details for display
        const sectionIdSet = new Set(
          sectionStudents.map((ss) => ss.section_id)
        );
        const { data: sectionsData } = await supabase
          .from("sms_sections")
          .select("id, name, grade_level")
          .in("id", Array.from(sectionIdSet));

        if (sectionsData) {
          const sectionsMap = new Map<
            string,
            { name: string; grade_level: number }
          >();
          sectionsData.forEach((section) => {
            sectionsMap.set(section.id, {
              name: section.name,
              grade_level: section.grade_level,
            });
          });

          // Enrich students with section info
          const enrichedStudents: (Student & {
            section_id?: string;
            section_name?: string;
            section_grade_level?: number;
          })[] = studentsData.map((student) => {
            const sectionId = studentSectionMap.get(student.id);
            const sectionInfo = sectionId ? sectionsMap.get(sectionId) : null;
            return {
              ...student,
              section_id: sectionId,
              section_name: sectionInfo?.name,
              section_grade_level: sectionInfo?.grade_level,
            };
          });

          setStudents(enrichedStudents);
        } else {
          setStudents(studentsData);
        }
      }
    } catch (error) {
      console.error("Error fetching students:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.system_user_id, filter]);

  useEffect(() => {
    if (user?.system_user_id && filter.school_year) {
      fetchStudents();
    }
  }, [user?.system_user_id, filter.school_year, fetchStudents]);

  // Group students by grade level for summary
  const studentsByGrade = students.reduce((acc, student) => {
    const grade = student.section_grade_level || "Unknown";
    acc[grade] = (acc[grade] || 0) + 1;
    return acc;
  }, {} as Record<number | string, number>);

  return (
    <div className="space-y-6">
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          My Students
        </h1>
        <div className="app__title_actions">
          {user?.system_user_id && (
            <StudentFilter
              filter={filter}
              setFilter={(newFilter) => setFilter(newFilter)}
              teacherId={user.system_user_id}
            />
          )}
        </div>
      </div>

      <div className="app__content space-y-6">
        {/* Summary Card */}
        {!loading && students.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Students
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{students.length}</div>
                <p className="text-xs text-muted-foreground">
                  {Object.keys(studentsByGrade).length} different grade level
                  {Object.keys(studentsByGrade).length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>

            {Object.entries(studentsByGrade)
              .sort(([a], [b]) => {
                if (a === "Unknown") return 1;
                if (b === "Unknown") return -1;
                return Number(a) - Number(b);
              })
              .slice(0, 3)
              .map(([grade, count]) => (
                <Card key={grade}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Grade {grade}
                    </CardTitle>
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{count}</div>
                    <p className="text-xs text-muted-foreground">students</p>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}

        {/* Students Table */}
        {loading ? (
          <TableSkeleton />
        ) : students.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-4 mb-4">
                <GraduationCap className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No students found</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                {filter.section_id || filter.subject_id
                  ? "Try adjusting your filters to see more results"
                  : "No students are currently assigned to your sections"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Student List</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[35%]">Student Name</TableHead>
                    <TableHead className="w-[25%]">LRN</TableHead>
                    <TableHead className="w-[25%]">Section</TableHead>
                    <TableHead className="w-[15%]">Grade Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>
                            {student.last_name}, {student.first_name}
                            {student.middle_name && ` ${student.middle_name}`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
                          {student.lrn}
                        </code>
                      </TableCell>
                      <TableCell>
                        {student.section_name ? (
                          <Badge variant="outline">
                            {student.section_name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {student.section_grade_level ? (
                          <Badge variant="secondary">
                            Grade {student.section_grade_level}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
