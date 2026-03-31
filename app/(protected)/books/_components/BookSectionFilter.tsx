"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getGradeLevelLabel } from "@/lib/constants";
import { getSchoolYearOptions } from "@/lib/utils/schoolYear";
import type { SectionOption } from "@/hooks/useBooks";
import { ReactNode } from "react";

interface BookSectionFilterProps {
  title?: string;
  description?: string;
  sections: SectionOption[];
  sectionId: string;
  onSectionChange: (id: string) => void;
  schoolYear: string;
  onSchoolYearChange: (sy: string) => void;
  children?: ReactNode;
}

export function BookSectionFilter({
  title = "Filters",
  description = "Select section and school year to view and manage book issuances",
  sections,
  sectionId,
  onSectionChange,
  schoolYear,
  onSchoolYearChange,
  children,
}: BookSectionFilterProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">School Year</label>
            <Select value={schoolYear} onValueChange={onSchoolYearChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getSchoolYearOptions().map((sy) => (
                  <SelectItem key={sy} value={sy}>
                    {sy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Section</label>
            <Select value={sectionId} onValueChange={onSectionChange}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {getGradeLevelLabel(s.grade_level)} - {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
