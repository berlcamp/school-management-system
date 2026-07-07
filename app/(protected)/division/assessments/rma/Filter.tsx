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
import { getGradeLevelLabel, RMA_GRADES } from "@/lib/constants";
import { Filter as FilterIcon, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { RmaFilter } from "./page";

export const Filter = ({
  filter,
  setFilter,
}: {
  filter: RmaFilter;
  setFilter: (filter: RmaFilter) => void;
}) => {
  const [keyword, setKeyword] = useState(filter.keyword || "");
  const [grade, setGrade] = useState<string>(
    filter.grade_level !== undefined ? String(filter.grade_level) : "all",
  );
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter({
        keyword,
        grade_level: grade !== "all" ? Number(grade) : undefined,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword, grade, setFilter]);

  const handleReset = () => {
    setKeyword("");
    setGrade("all");
    setFilter({ keyword: "" });
  };

  const filterCount = [keyword, grade !== "all"].filter(Boolean).length;

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
                placeholder="Search by title..."
                className="pl-9 pr-9 h-10 w-full"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger className="w-full h-10">
                <SelectValue placeholder="All grades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All grades</SelectItem>
                {RMA_GRADES.map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    {getGradeLevelLabel(g)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {filterCount > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={handleReset}
                className="h-9"
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
