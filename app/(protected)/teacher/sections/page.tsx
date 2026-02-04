"use client";

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
import { Section } from "@/types";
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { SectionCard } from "../components/SectionCard";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [sections, setSections] = useState<
    (Section & { student_count?: number })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [schoolYear, setSchoolYear] = useState("");

  useEffect(() => {
    const currentYear = getCurrentSchoolYear();
    setSchoolYear(currentYear);

    if (user?.system_user_id) {
      fetchSections(currentYear);
    }
  }, [user]);

  useEffect(() => {
    if (user?.system_user_id && schoolYear) {
      fetchSections(schoolYear);
    }
  }, [schoolYear, user]);

  const fetchSections = async (year: string) => {
    if (!user?.system_user_id) return;

    setLoading(true);
    try {
      // Fetch sections where teacher is adviser
      const { data: adviserSections } = await supabase
        .from("sms_sections")
        .select("*")
        .eq("section_adviser_id", user.system_user_id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .eq("school_year", year);

      // Fetch sections via subject assignments
      const { data: assignmentData } = await supabase
        .from("sms_subject_assignments")
        .select(
          `
          section_id,
          sections:section_id (*)
        `
        )
        .eq("teacher_id", user.system_user_id)
        .eq("school_year", year)
        .not("section_id", "is", null);

      // Combine sections
      const sectionMap = new Map<
        string,
        Section & { student_count?: number }
      >();

      // Add adviser sections
      adviserSections?.forEach((section) => {
        sectionMap.set(section.id, section);
      });

      // Add assignment sections
      assignmentData?.forEach((assignment) => {
        if (assignment.section_id && assignment.sections) {
          const section = Array.isArray(assignment.sections)
            ? assignment.sections[0]
            : assignment.sections;
          if (!sectionMap.has(section.id)) {
            sectionMap.set(section.id, section);
          }
        }
      });

      // Fetch student counts for each section
      const sectionsWithCounts = await Promise.all(
        Array.from(sectionMap.values()).map(async (section) => {
          const { count } = await supabase
            .from("sms_section_students")
            .select("*", { count: "exact", head: true })
            .eq("section_id", section.id)
            .eq("school_year", year)
            .is("transferred_at", null);

          return {
            ...section,
            student_count: count || 0,
          };
        })
      );

      setSections(sectionsWithCounts);
    } catch (error) {
      console.error("Error fetching sections:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <Users className="h-5 w-5" />
          My Sections
        </h1>
        <div className="app__title_actions">
          <Select value={schoolYear} onValueChange={setSchoolYear}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="School Year" />
            </SelectTrigger>
            <SelectContent>
              {getSchoolYearOptions().map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="app__content">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading sections...
          </div>
        ) : sections.length === 0 ? (
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <Users className="w-12 h-12 mx-auto text-muted-foreground" />
            </div>
            <p className="app__empty_state_title">No sections found</p>
            <p className="app__empty_state_description">
              You are not assigned to any sections for {schoolYear}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                schoolYear={schoolYear}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
