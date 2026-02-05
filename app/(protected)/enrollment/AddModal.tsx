"use client";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { Enrollment, Student } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  BookOpen,
  Calendar,
  Check,
  ChevronsUpDown,
  GraduationCap,
  Search,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

const table = "sms_enrollments";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: Enrollment | null;
}

const FormSchema = z.object({
  student_id: z.string().optional(),
  section_id: z.string().min(1, "Section is required"),
  school_year: z.string().min(1, "School year is required"),
  grade_level: z.number().min(1).max(12),
});

type FormType = z.infer<typeof FormSchema>;

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<
    Array<{
      id: string;
      name: string;
      grade_level: number;
      school_year: string;
    }>
  >([]);
  const [searchStudent, setSearchStudent] = useState("");
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const user = useAppSelector((state) => state.user.user);
  const dispatch = useAppDispatch();

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      student_id: "",
      section_id: "",
      school_year: getCurrentSchoolYear(),
      grade_level: 1,
    },
  });

  const gradeLevel = form.watch("grade_level");
  const schoolYear = form.watch("school_year");

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

  const fetchSections = useCallback(
    async (overrideGradeLevel?: number, overrideSchoolYear?: string) => {
      const levelToUse = overrideGradeLevel ?? gradeLevel;
      const yearToUse = overrideSchoolYear ?? schoolYear;

      if (!levelToUse || !yearToUse) {
        setSections([]);
        return;
      }

      const { data } = await supabase
        .from("sms_sections")
        .select("id, name, grade_level, school_year")
        .eq("is_active", true)
        .eq("grade_level", levelToUse)
        .eq("school_year", yearToUse)
        .is("deleted_at", null)
        .order("name");

      if (data) {
        setSections(data);
      }
    },
    [gradeLevel, schoolYear]
  );

  useEffect(() => {
    if (isOpen) {
      fetchStudents();
    }
  }, [isOpen]);

  // Fetch student name when editing
  useEffect(() => {
    const fetchEditingStudent = async () => {
      if (isOpen && editData?.student_id) {
        const { data } = await supabase
          .from("sms_students")
          .select("*")
          .eq("id", editData.student_id)
          .single();

        if (data) {
          setEditingStudent(data);
        }
      } else {
        setEditingStudent(null);
      }
    };

    fetchEditingStudent();
  }, [isOpen, editData]);

  // Populate form when editing
  useEffect(() => {
    if (isOpen && editData) {
      form.reset({
        student_id: editData.student_id ? String(editData.student_id) : "",
        section_id: editData.section_id ? String(editData.section_id) : "",
        school_year: editData.school_year,
        grade_level: editData.grade_level,
      });
      // Fetch sections immediately after setting form values when editing
      if (editData.grade_level && editData.school_year) {
        fetchSections(editData.grade_level, editData.school_year);
      }
    } else if (isOpen && !editData) {
      form.reset({
        student_id: "",
        section_id: "",
        school_year: getCurrentSchoolYear(),
        grade_level: 1,
      });
    }
  }, [isOpen, editData, form, fetchSections]);

  useEffect(() => {
    if (isOpen && gradeLevel && schoolYear) {
      fetchSections();
    }
  }, [isOpen, gradeLevel, schoolYear, fetchSections]);

  const onSubmit = async (data: FormType) => {
    if (isSubmitting) return;

    if (!user?.system_user_id) {
      toast.error("User information is missing. Please try again.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (editData?.id) {
        // Update existing enrollment
        const enrollmentData = {
          student_id: editData.student_id, // Use the original student_id when editing
          section_id: data.section_id,
          school_year: data.school_year.trim(),
          grade_level: data.grade_level,
        };

        const { data: updated, error } = await supabase
          .from(table)
          .update(enrollmentData)
          .eq("id", editData.id)
          .select()
          .single();

        if (error) throw new Error(error.message);

        // Update sms_students with grade_level
        const { error: updateError } = await supabase
          .from("sms_students")
          .update({
            grade_level: data.grade_level,
            current_section_id: data.section_id,
          })
          .eq("id", editData.student_id);

        if (updateError) throw new Error(updateError.message);

        dispatch(updateList(updated));
        onClose();
        toast.success("Enrollment updated successfully!");
        form.reset();
      } else {
        // Create new enrollment
        if (!data.student_id) {
          toast.error("Student is required");
          setIsSubmitting(false);
          return;
        }
        const enrollmentData = {
          student_id: data.student_id,
          section_id: data.section_id,
          school_year: data.school_year.trim(),
          grade_level: data.grade_level,
          enrollment_date: new Date().toISOString().split("T")[0],
          status: "approved" as const,
          enrolled_by: user.system_user_id,
          approved_by: user.system_user_id,
        };

        const { data: inserted, error } = await supabase
          .from(table)
          .insert([enrollmentData])
          .select()
          .single();

        if (error) throw new Error(error.message);

        // Update sms_students with grade_level
        const { error: updateError } = await supabase
          .from("sms_students")
          .update({
            grade_level: data.grade_level,
            current_section_id: data.section_id,
          })
          .eq("id", data.student_id);

        if (updateError) throw new Error(updateError.message);

        dispatch(addItem(inserted));
        onClose();
        toast.success("Enrollment created and approved successfully!");
        form.reset();
      }
    } catch (err) {
      console.error("Submission error:", err);
      toast.error(
        err instanceof Error ? err.message : "Error saving enrollment"
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

  // Sections are already filtered by grade_level and school_year in fetchSections
  const filteredSections = sections;

  const selectedStudent = students.find(
    (s) => String(s.id) === String(form.watch("student_id"))
  );
  const [studentPopoverOpen, setStudentPopoverOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-semibold">
                {editData && editingStudent
                  ? `Edit Enrollment - ${editingStudent.last_name}, ${editingStudent.first_name}`
                  : editData
                  ? "Edit Enrollment"
                  : "New Enrollment"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                {editData
                  ? "Update enrollment details"
                  : "Enroll a student to a section for the current school year"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, (errors) => {
              console.error("Form validation errors:", errors);
              toast.error("Please fix the form errors before submitting.");
            })}
            className="space-y-6"
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="grade_level"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-sm font-medium flex items-center gap-2 mb-2">
                      <GraduationCap className="h-4 w-4 text-muted-foreground" />
                      Grade Level <span className="text-destructive">*</span>
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
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select grade level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(
                          (level) => (
                            <SelectItem key={level} value={level.toString()}>
                              Grade {level}
                            </SelectItem>
                          )
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
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-sm font-medium flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      School Year <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue("section_id", "");
                      }}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select school year" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {getSchoolYearOptions().map((year) => (
                          <SelectItem key={year} value={year}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {!editData && (
              <FormField
                control={form.control}
                name="student_id"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-sm font-medium flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Student <span className="text-destructive">*</span>
                    </FormLabel>
                    <Popover
                      open={studentPopoverOpen}
                      onOpenChange={setStudentPopoverOpen}
                    >
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "h-11 w-full justify-between font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isSubmitting}
                          >
                            {selectedStudent
                              ? `${selectedStudent.lrn} - ${selectedStudent.last_name}, ${selectedStudent.first_name}`
                              : "Search and select student..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-[400px]" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Search by LRN or name..."
                            value={searchStudent}
                            onValueChange={setSearchStudent}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <div className="flex flex-col items-center justify-center py-6 text-center">
                                <Search className="h-8 w-8 text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground">
                                  No student found.
                                </p>
                              </div>
                            </CommandEmpty>
                            <CommandGroup>
                              {filteredStudents.length === 0 ? (
                                <div className="py-6 text-center text-sm text-muted-foreground">
                                  No students available
                                </div>
                              ) : (
                                filteredStudents.map((student) => (
                                  <CommandItem
                                    key={student.id}
                                    value={`${student.lrn} ${student.first_name} ${student.last_name}`}
                                    onSelect={() => {
                                      field.onChange(String(student.id));
                                      setSearchStudent("");
                                      setStudentPopoverOpen(false);
                                    }}
                                    className="cursor-pointer"
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        String(field.value) ===
                                          String(student.id)
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                    <div className="flex flex-col">
                                      <span className="font-medium">
                                        {student.last_name},{" "}
                                        {student.first_name}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        LRN: {student.lrn}
                                      </span>
                                    </div>
                                  </CommandItem>
                                ))
                              )}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="section_id"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-sm font-medium flex items-center gap-2 mb-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    Section <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select section" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {filteredSections.length === 0 ? (
                        <div className="py-6 text-center">
                          <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">
                            No sections available for this grade level
                          </p>
                        </div>
                      ) : (
                        filteredSections.map((section) => (
                          <SelectItem
                            key={section.id}
                            value={String(section.id)}
                          >
                            {section.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                  {(!form.watch("grade_level") ||
                    !form.watch("school_year")) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Please select a grade level and school year first
                    </p>
                  )}
                </FormItem>
              )}
            />

            <DialogFooter className="gap-3 pt-4 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-11 min-w-[100px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-11 min-w-[120px]"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {editData ? "Updating..." : "Enrolling..."}
                  </span>
                ) : editData ? (
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Update Enrollment
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Enroll Student
                  </span>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
