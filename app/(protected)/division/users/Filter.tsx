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
    type?: string;
    school_id?: string;
  };
  setFilter: (filter: {
    keyword: string;
    type?: string;
    school_id?: string;
  }) => void;
}) => {
  const [keyword, setKeyword] = useState(filter.keyword || "");
  const [type, setType] = useState(filter.type || "all");
  const [schoolId, setSchoolId] = useState(filter.school_id || "all");
  const [schools, setSchools] = useState<{ id: string; school_id: string; name: string }[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("sms_schools")
      .select("id, school_id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setSchools(data || []));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter({
        keyword,
        type: type && type !== "all" ? type : undefined,
        school_id: schoolId && schoolId !== "all" ? schoolId : undefined,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [keyword, type, schoolId, setFilter]);

  const handleReset = () => {
    setKeyword("");
    setType("all");
    setSchoolId("all");
    setFilter({ keyword: "", type: undefined, school_id: undefined });
  };

  const filterCount = [
    keyword,
    type && type !== "all",
    schoolId && schoolId !== "all",
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
              Search Users
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Search by name or email..."
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
              School
            </label>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All schools" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All schools</SelectItem>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.school_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              User Type
            </label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="school_head">School Head</SelectItem>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="registrar">Registrar</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(keyword || type !== "all" || schoolId !== "all") && (
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
