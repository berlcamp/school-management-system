"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { Student } from "@/types";
import { GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (user?.system_user_id && filter.school_year) {
      fetchStudents();
    }
  }, [user, filter]);

  const fetchStudents = async () => {
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
  };

  return (
    <div>
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
      <div className="app__content">
        {loading ? (
          <TableSkeleton />
        ) : students.length === 0 ? (
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground" />
            </div>
            <p className="app__empty_state_title">No students found</p>
            <p className="app__empty_state_description">
              {filter.section_id || filter.subject_id
                ? "Try adjusting your filters"
                : "No students assigned to your sections"}
            </p>
          </div>
        ) : (
          <div className="border rounded-md">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Student Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    LRN
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Section
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Grade Level
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {students.map((student) => {
                  return (
                    <tr key={student.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        {student.last_name}, {student.first_name}
                        {student.middle_name && ` ${student.middle_name}`}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">
                        {student.lrn}
                      </td>
                      <td className="px-4 py-3">
                        {student.section_name || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {student.section_grade_level || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
