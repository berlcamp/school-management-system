"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { generateKinderProgressReportPrint } from "@/lib/pdf/generateKinderProgressReport";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import type { Student } from "@/types";
import { Loader2, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

/**
 * Prints one learner's card. The whole year is always printed — the issued form
 * is a single card carried from June to April with all three term columns on
 * it, not a sheet per term — so this offers learners, not periods.
 */
interface KinderProgressPrintSelectorProps {
  sectionId: string;
  schoolYear: string;
}

export function KinderProgressPrintSelector({
  sectionId,
  schoolYear,
}: KinderProgressPrintSelectorProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [printing, setPrinting] = useState(false);
  const user = useAppSelector((state) => state.user.user);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const fetchStudents = async () => {
      const { data: enrollments } = await supabase
        .from("sms_enrollments")
        .select("student_id")
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear)
        .eq("status", "approved");

      if (!enrollments || enrollments.length === 0) {
        if (isMounted.current) setStudents([]);
        return;
      }

      const { data } = await supabase
        .from("sms_students")
        .select("*")
        .in(
          "id",
          enrollments.map((e) => e.student_id),
        )
        .order("last_name")
        .order("first_name");

      if (isMounted.current) setStudents(data || []);
    };
    void fetchStudents();
  }, [sectionId, schoolYear]);

  const handlePrint = async (studentId: string) => {
    if (!user?.school_id) return;
    setPrinting(true);
    try {
      await generateKinderProgressReportPrint({
        schoolId: String(user.school_id),
        studentId,
        sectionId,
        schoolYear,
      });
    } catch (err) {
      console.error("Error generating Kindergarten progress report:", err);
      toast.error("Failed to generate the progress report");
    } finally {
      if (isMounted.current) setPrinting(false);
    }
  };

  if (students.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={printing}>
          {printing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Printer className="h-3.5 w-3.5" />
          )}
          Print Progress Report
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Select a learner
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {students.map((s) => (
          <DropdownMenuItem key={s.id} onClick={() => void handlePrint(s.id)}>
            {s.last_name}, {s.first_name} {s.middle_name || ""} {s.suffix || ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
