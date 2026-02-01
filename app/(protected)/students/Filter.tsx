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
    lrn: string;
    section_id?: string;
    enrollment_status?: string;
  };
  setFilter: (filter: {
    keyword: string;
    lrn: string;
    section_id?: string;
    enrollment_status?: string;
  }) => void;
}) => {
  const [keyword, setKeyword] = useState(filter.keyword || "");
  const [lrn, setLrn] = useState(filter.lrn || "");
  const [sectionId, setSectionId] = useState(filter.section_id || "all");
  const [enrollmentStatus, setEnrollmentStatus] = useState(
    filter.enrollment_status || "all",
  );
  const [sections, setSections] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchSections = async () => {
      const { data } = await supabase
        .from("sms_sections")
        .select("id, name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");

      if (data) {
        setSections(data);
      }
    };

    fetchSections();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter({
        keyword,
        lrn,
        section_id: sectionId && sectionId !== "all" ? sectionId : undefined,
        enrollment_status:
          enrollmentStatus && enrollmentStatus !== "all"
            ? enrollmentStatus
            : undefined,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [keyword, lrn, sectionId, enrollmentStatus, setFilter]);

  const handleReset = () => {
    setKeyword("");
    setLrn("");
    setSectionId("all");
    setEnrollmentStatus("all");
    setFilter({
      keyword: "",
      lrn: "",
      section_id: undefined,
      enrollment_status: undefined,
    });
  };

  const filterCount = [
    keyword,
    lrn,
    sectionId && sectionId !== "all",
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
              Search by Name
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Search by name..."
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
              Search by LRN
            </label>
            <div className="relative">
              <Input
                value={lrn}
                onChange={(e) => setLrn(e.target.value)}
                placeholder="Enter LRN..."
                className="pr-9 h-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500/20 w-full"
              />
              {lrn && (
                <button
                  type="button"
                  onClick={() => setLrn("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Clear LRN"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
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
                  <SelectItem key={section.id} value={section.id}>
                    {section.name}
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
                <SelectItem value="enrolled">Enrolled</SelectItem>
                <SelectItem value="transferred">Transferred</SelectItem>
                <SelectItem value="graduated">Graduated</SelectItem>
                <SelectItem value="dropped">Dropped</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(keyword || lrn || sectionId || enrollmentStatus) && (
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
