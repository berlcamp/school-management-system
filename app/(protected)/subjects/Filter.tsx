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
import { supabase } from "@/lib/supabase/client";
import { Filter as FilterIcon, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

export const Filter = ({
  filter,
  setFilter,
}: {
  filter: {
    keyword: string;
    grade_level?: number;
    teacher_id?: string;
  };
  setFilter: (filter: {
    keyword: string;
    grade_level?: number;
    teacher_id?: string;
  }) => void;
}) => {
  const [keyword, setKeyword] = useState(filter.keyword || "");
  const [gradeLevel, setGradeLevel] = useState<string>(
    filter.grade_level?.toString() || "all",
  );
  const [teacherId, setTeacherId] = useState(filter.teacher_id || "all");
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [isOpen, setIsOpen] = useState(false);

  // Fetch teachers
  useEffect(() => {
    const fetchTeachers = async () => {
      const { data } = await supabase
        .from("sms_users")
        .select("id, name")
        .eq("type", "teacher")
        .eq("is_active", true)
        .order("name");

      if (data) {
        setTeachers(data);
      }
    };

    fetchTeachers();
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter({
        keyword,
        grade_level:
          gradeLevel && gradeLevel !== "all" ? parseInt(gradeLevel) : undefined,
        teacher_id: teacherId && teacherId !== "all" ? teacherId : undefined,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [keyword, gradeLevel, teacherId, setFilter]);

  const handleReset = () => {
    setKeyword("");
    setGradeLevel("all");
    setTeacherId("all");
    setFilter({
      keyword: "",
      grade_level: undefined,
      teacher_id: undefined,
    });
  };

  const filterCount = [
    keyword,
    gradeLevel && gradeLevel !== "all",
    teacherId && teacherId !== "all",
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
              Search Subjects
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Search by code or name..."
                className="pl-9 pr-9 h-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500/20 w-full"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Grade Level
            </label>
            <Select value={gradeLevel} onValueChange={setGradeLevel}>
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All grade levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All grade levels</SelectItem>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((level) => (
                  <SelectItem key={level} value={level.toString()}>
                    Grade {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Teacher
            </label>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All teachers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teachers</SelectItem>
                {teachers.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(keyword || gradeLevel || teacherId) && (
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
