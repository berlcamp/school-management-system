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
import { Filter as FilterIcon, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

export const Filter = ({
  filter,
  setFilter,
}: {
  filter: {
    keyword: string;
    status?: string;
    school_year?: string;
    grade_level?: number;
  };
  setFilter: (filter: {
    keyword: string;
    status?: string;
    school_year?: string;
    grade_level?: number;
  }) => void;
}) => {
  const [keyword, setKeyword] = useState(filter.keyword || "");
  const [status, setStatus] = useState(filter.status || "all");
  const [schoolYear, setSchoolYear] = useState(filter.school_year || "all");
  const [gradeLevel, setGradeLevel] = useState<string>(
    filter.grade_level?.toString() || "all",
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter({
        keyword,
        status: status && status !== "all" ? status : undefined,
        school_year:
          schoolYear && schoolYear !== "all" ? schoolYear : undefined,
        grade_level:
          gradeLevel && gradeLevel !== "all" ? parseInt(gradeLevel) : undefined,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [keyword, status, schoolYear, gradeLevel, setFilter]);

  const handleReset = () => {
    setKeyword("");
    setStatus("all");
    setSchoolYear("all");
    setGradeLevel("all");
    setFilter({
      keyword: "",
      status: undefined,
      school_year: undefined,
      grade_level: undefined,
    });
  };

  const filterCount = [
    keyword,
    status && status !== "all",
    schoolYear && schoolYear !== "all",
    gradeLevel && gradeLevel !== "all",
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
              Status
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
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
          {(keyword || status || schoolYear || gradeLevel) && (
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
