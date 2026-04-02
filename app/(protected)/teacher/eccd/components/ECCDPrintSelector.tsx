"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { Student } from "@/types";
import { Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { generateEccdCardPrint } from "@/lib/pdf/generateEccdCard";

interface ECCDPrintSelectorProps {
  sectionId: string;
  schoolYear: string;
}

export function ECCDPrintSelector({
  sectionId,
  schoolYear,
}: ECCDPrintSelectorProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [printing, setPrinting] = useState(false);
  const user = useAppSelector((state) => state.user.user);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
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

      const studentIds = enrollments.map((e) => e.student_id);
      const { data: studentList } = await supabase
        .from("sms_students")
        .select("*")
        .in("id", studentIds)
        .order("last_name")
        .order("first_name");

      if (isMounted.current) setStudents(studentList || []);
    };
    fetchStudents();
  }, [sectionId, schoolYear]);

  const handlePrint = async (studentId: string) => {
    if (!user?.school_id) return;
    setPrinting(true);
    try {
      await generateEccdCardPrint({
        schoolId: user.school_id as string,
        studentId,
        sectionId,
        schoolYear,
      });
    } catch (err) {
      console.error("Error generating ECCD card:", err);
      toast.error("Failed to generate ECCD card");
    } finally {
      if (isMounted.current) setPrinting(false);
    }
  };

  if (students.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={printing}>
          <Printer className="h-3.5 w-3.5" />
          Print ECCD Card
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        {students.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onClick={() => handlePrint(s.id)}
          >
            {s.last_name}, {s.first_name} {s.middle_name || ""} {s.suffix || ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
