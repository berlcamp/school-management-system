"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/lib/redux/hook";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { useTeacherAllocations } from "@/hooks/useBooks";
import { BookMarked } from "lucide-react";
import { useState } from "react";
import { AllocationSummaryCards } from "./_components/AllocationSummaryCards";
import { AllocationQuickActions } from "./_components/AllocationQuickActions";
import { AllocationTable } from "./_components/AllocationTable";

export default function TeacherBooksPage() {
  const user = useAppSelector((state) => state.user.user);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());

  const teacherId = user?.system_user_id;
  const { rows, summary, loading } = useTeacherAllocations(teacherId, schoolYear);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <BookMarked className="h-5 w-5" />
          My Allocated Books
        </h1>
        <div className="app__title_actions">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">School Year</span>
            <Select value={schoolYear} onValueChange={setSchoolYear}>
              <SelectTrigger className="w-[140px] h-9">
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
        </div>
      </div>

      <div className="app__content space-y-6">
        <AllocationSummaryCards summary={summary} />
        <AllocationQuickActions heldCount={summary.held} />
        <AllocationTable rows={rows} loading={loading} schoolYear={schoolYear} />
      </div>
    </div>
  );
}
