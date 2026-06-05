"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getGradeLevelLabel,
  getSectionTypeLabel,
  GRADE_LEVELS,
  SECTION_TYPE_LABELS,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import type { Section } from "@/types/database";
import { Filter as FilterIcon, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

export const Filter = ({
  filter,
  setFilter,
  schoolId,
}: {
  filter: {
    keyword: string;
    school_year?: string;
    grade_level?: number;
    section_id?: string;
    section_type?: string;
    enrollment_status?: string;
  };
  setFilter: (filter: {
    keyword: string;
    school_year?: string;
    grade_level?: number;
    section_id?: string;
    section_type?: string;
    enrollment_status?: string;
  }) => void;
  schoolId?: string | number | null;
}) => {
  const [keyword, setKeyword] = useState(filter.keyword || "");
  const [schoolYear, setSchoolYear] = useState(filter.school_year || "all");
  const [gradeLevel, setGradeLevel] = useState<string>(
    filter.grade_level?.toString() || "all",
  );
  const [sectionId, setSectionId] = useState<string>(
    filter.section_id || "all",
  );
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionType, setSectionType] = useState<string>(
    filter.section_type || "all",
  );
  const [enrollmentStatus, setEnrollmentStatus] = useState(
    filter.enrollment_status || "all",
  );
  const [isOpen, setIsOpen] = useState(false);

  const getSchoolYearOptions = () => {
    const now = new Date();
    const year = now.getFullYear();
    const options: string[] = [];
    for (let i = -2; i <= 2; i++) {
      const startYear = year + i;
      options.push(`${startYear}-${startYear + 1}`);
    }
    return options;
  };

  // Load sections for the selected grade level (scoped to school + school year)
  useEffect(() => {
    if (gradeLevel === "all") {
      setSections([]);
      return;
    }
    let isMounted = true;
    const fetchSections = async () => {
      let query = supabase
        .from("sms_sections")
        .select("*")
        .eq("is_active", true)
        .eq("grade_level", parseInt(gradeLevel))
        .order("name");
      if (schoolId != null) query = query.eq("school_id", schoolId);
      if (schoolYear && schoolYear !== "all")
        query = query.eq("school_year", schoolYear);
      const { data } = await query;
      if (isMounted) setSections((data as Section[]) || []);
    };
    fetchSections();
    return () => {
      isMounted = false;
    };
  }, [gradeLevel, schoolYear, schoolId]);

  // Reset section when the grade level changes (it no longer applies).
  const handleGradeLevelChange = (value: string) => {
    setGradeLevel(value);
    setSectionId("all");
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter({
        keyword,
        school_year:
          schoolYear && schoolYear !== "all" ? schoolYear : undefined,
        grade_level:
          gradeLevel && gradeLevel !== "all" ? parseInt(gradeLevel) : undefined,
        section_id:
          gradeLevel !== "all" && sectionId && sectionId !== "all"
            ? sectionId
            : undefined,
        section_type:
          sectionType && sectionType !== "all" ? sectionType : undefined,
        enrollment_status:
          enrollmentStatus && enrollmentStatus !== "all"
            ? enrollmentStatus
            : undefined,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [
    keyword,
    schoolYear,
    gradeLevel,
    sectionId,
    sectionType,
    enrollmentStatus,
    setFilter,
  ]);

  const handleReset = () => {
    setKeyword("");
    setSchoolYear("all");
    setGradeLevel("all");
    setSectionId("all");
    setSectionType("all");
    setEnrollmentStatus("all");
    setFilter({
      keyword: "",
      school_year: undefined,
      grade_level: undefined,
      section_id: undefined,
      section_type: undefined,
      enrollment_status: undefined,
    });
  };

  const filterCount = [
    keyword,
    schoolYear && schoolYear !== "all",
    gradeLevel && gradeLevel !== "all",
    gradeLevel !== "all" && sectionId && sectionId !== "all",
    sectionType && sectionType !== "all",
    enrollmentStatus && enrollmentStatus !== "all",
  ].filter(Boolean).length;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 border-gray-300 hover:bg-gray-50"
        >
          <FilterIcon className="h-4 w-4" />
          Filter
          {filterCount > 0 && (
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {filterCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-4">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Search
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Search by student name..."
                className="pl-9 pr-9 h-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500/20 w-full"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              School Year
            </label>
            <Select value={schoolYear} onValueChange={setSchoolYear}>
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All school years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All school years</SelectItem>
                {getSchoolYearOptions().map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Grade Level
            </label>
            <Select value={gradeLevel} onValueChange={handleGradeLevelChange}>
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All grade levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All grade levels</SelectItem>
                {GRADE_LEVELS.map((level) => (
                  <SelectItem key={level} value={level.toString()}>
                    {getGradeLevelLabel(level)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {gradeLevel !== "all" && (
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                Section
              </label>
              <Select value={sectionId} onValueChange={setSectionId}>
                <SelectTrigger className="w-full h-10 border-gray-300">
                  <SelectValue placeholder="All sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sections</SelectItem>
                  {sections.map((section) => (
                    <SelectItem key={section.id} value={String(section.id)}>
                      {section.name}
                      {section.section_type && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {getSectionTypeLabel(section.section_type)}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                  {sections.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No sections found for this grade level
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Section Type
            </label>
            <Select value={sectionType} onValueChange={setSectionType}>
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All section types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All section types</SelectItem>
                {Object.entries(SECTION_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Enrollment Status
            </label>
            <Select
              value={enrollmentStatus}
              onValueChange={setEnrollmentStatus}
            >
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="promoted">Promoted</SelectItem>
                <SelectItem value="graduated">Graduated</SelectItem>
                <SelectItem value="retained">Retained</SelectItem>
                <SelectItem value="transferred_out">Transferred Out</SelectItem>
                <SelectItem value="dropped">Dropped</SelectItem>
                <SelectItem value="pending_transfer">Pending Transfer</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(keyword ||
            (schoolYear && schoolYear !== "all") ||
            (gradeLevel && gradeLevel !== "all") ||
            (sectionId && sectionId !== "all") ||
            (sectionType && sectionType !== "all") ||
            (enrollmentStatus && enrollmentStatus !== "all")) && (
            <div className="flex justify-end">
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={handleReset}
                className="h-9 border-gray-300 hover:bg-gray-50"
              >
                <X size={14} className="mr-1.5" />
                Clear
              </Button>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
