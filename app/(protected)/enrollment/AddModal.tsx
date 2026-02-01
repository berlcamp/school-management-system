"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addItem } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { Student } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

const table = "sms_enrollments";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FormSchema = z.object({
  student_id: z.string().min(1, "Student is required"),
  section_id: z.string().min(1, "Section is required"),
  school_year: z.string().min(1, "School year is required"),
  grade_level: z.number().min(1).max(12),
});

type FormType = z.infer<typeof FormSchema>;

export const AddModal = ({ isOpen, onClose }: ModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<
    Array<{ id: string; name: string; grade_level: number }>
  >([]);
  const [searchStudent, setSearchStudent] = useState("");
  const user = useAppSelector((state) => state.user.user);
  const dispatch = useAppDispatch();

  const getCurrentSchoolYear = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    if (month >= 5) {
      return `${year}-${year + 1}`;
    } else {
      return `${year - 1}-${year}`;
    }
  };

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      student_id: "",
      section_id: "",
      school_year: getCurrentSchoolYear(),
      grade_level: 1,
    },
  });

  useEffect(() => {
    if (isOpen) {
      fetchStudents();
      fetchSections();
    }
  }, [isOpen]);

  const fetchStudents = async () => {
    const { data } = await supabase
      .from("sms_students")
      .select("*")
      .is("deleted_at", null)
      .order("last_name")
      .order("first_name");

    if (data) {
      setStudents(data);
    }
  };

  const fetchSections = async () => {
    const { data } = await supabase
      .from("sms_sections")
      .select("id, name, grade_level")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name");

    if (data) {
      setSections(data);
    }
  };

  const onSubmit = async (data: FormType) => {
    if (isSubmitting || !user?.system_user_id) return;
    setIsSubmitting(true);

    try {
      const enrollmentData = {
        student_id: data.student_id,
        section_id: data.section_id,
        school_year: data.school_year.trim(),
        grade_level: data.grade_level,
        enrollment_date: new Date().toISOString().split("T")[0],
        status: "pending" as const,
        enrolled_by: user.system_user_id,
      };

      const { data: inserted, error } = await supabase
        .from(table)
        .insert([enrollmentData])
        .select()
        .single();

      if (error) throw new Error(error.message);

      dispatch(addItem(inserted));
      onClose();
      toast.success("Enrollment created successfully!");
      form.reset();
    } catch (err) {
      console.error("Submission error:", err);
      toast.error(
        err instanceof Error ? err.message : "Error creating enrollment",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredStudents = students.filter((s) => {
    if (!searchStudent) return true;
    const search = searchStudent.toLowerCase();
    return (
      s.lrn.toLowerCase().includes(search) ||
      s.first_name.toLowerCase().includes(search) ||
      s.last_name.toLowerCase().includes(search)
    );
  });

  const filteredSections = sections.filter((s) => {
    const gradeLevel = form.watch("grade_level");
    return !gradeLevel || s.grade_level === gradeLevel;
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            New Enrollment
          </DialogTitle>
          <DialogDescription>
            Enroll a student to a section for the current school year.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="grade_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Grade Level <span className="text-red-500">*</span>
                  </FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(parseInt(value));
                      form.setValue("section_id", "");
                    }}
                    value={field.value?.toString()}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select grade level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(
                        (level) => (
                          <SelectItem key={level} value={level.toString()}>
                            Grade {level}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="school_year"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    School Year <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 2024-2025"
                      className="h-10"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="student_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Student <span className="text-red-500">*</span>
                  </FormLabel>
                  <div className="space-y-2">
                    <Input
                      placeholder="Search by LRN or name..."
                      className="h-10"
                      value={searchStudent}
                      onChange={(e) => setSearchStudent(e.target.value)}
                    />
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select student" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[200px]">
                        {filteredStudents.map((student) => (
                          <SelectItem key={student.id} value={student.id}>
                            {student.lrn} - {student.last_name},{" "}
                            {student.first_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="section_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Section <span className="text-red-500">*</span>
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isSubmitting || !form.watch("grade_level")}
                  >
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select section" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {filteredSections.length === 0 ? (
                        <SelectItem value="no-options" disabled>
                          No sections available for this grade level
                        </SelectItem>
                      ) : (
                        filteredSections.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0 space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-10 min-w-[100px]"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Saving...
                  </span>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
