"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { useHeldIssuances } from "@/hooks/useBooks";
import { HeldBooksTable } from "../_components/HeldBooksTable";
import { Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

export default function ReturnToManagerPage() {
  const user = useAppSelector((state) => state.user.user);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const teacherId = user?.system_user_id;
  const {
    data: issuances,
    loading,
    refetch: refetchHeld,
  } = useHeldIssuances(teacherId, schoolYear);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === issuances.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(issuances.map((i) => i.id)));
    }
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one book to return");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("sms_book_issuances")
        .update({
          returned_to_manager_at: new Date().toISOString(),
        })
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      toast.success(
        `Successfully returned ${selectedIds.size} book(s) to book manager`,
      );
      refetchHeld();
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to return books",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <RotateCcw className="h-5 w-5" />
          Return to Book Manager
        </h1>
        <div className="app__title_actions">
          <Button variant="outline" size="sm" asChild>
            <Link href="/teacher/books">Back to Books</Link>
          </Button>
        </div>
      </div>

      <div className="app__content space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Books Returned by Students (Held by You)</CardTitle>
            <CardDescription>
              Select books that students have returned to you, then submit them
              back to the book manager.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">School Year</label>
                <select
                  value={schoolYear}
                  onChange={(e) => setSchoolYear(e.target.value)}
                  className="flex h-10 w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {getSchoolYearOptions().map((sy) => (
                    <option key={sy} value={sy}>
                      {sy}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading...
              </div>
            ) : issuances.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No books currently held. Students return books to you first,
                then you can submit them here.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={selectAll}
                  >
                    {selectedIds.size === issuances.length
                      ? "Deselect all"
                      : "Select all"}
                  </Button>
                  <Button
                    variant="green"
                    size="sm"
                    onClick={handleSubmit}
                    disabled={selectedIds.size === 0 || submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Returning...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Return {selectedIds.size} to Book Manager
                      </>
                    )}
                  </Button>
                </div>
                <HeldBooksTable
                  issuances={issuances}
                  selectedIds={selectedIds}
                  onToggle={toggleSelect}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
