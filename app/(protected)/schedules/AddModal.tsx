"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAppDispatch } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { checkScheduleConflicts } from "@/lib/utils/scheduleConflicts";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { RootState, SubjectSchedule } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { z } from "zod";

type ItemType = SubjectSchedule;
const table = "sms_subject_schedules";
const title = "Schedule";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: ItemType | null;
}

const FormSchema = z
  .object({
    subject_id: z.string().min(1, "Subject is required"),
    section_id: z.string().min(1, "Section is required"),
    teacher_id: z.string().min(1, "Teacher is required"),
    room_id: z.string().min(1, "Room is required"),
    days_of_week: z
      .array(z.number())
      .min(1, "At least one day must be selected"),
    start_time: z
      .string()
      .regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:mm)"),
    end_time: z
      .string()
      .regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:mm)"),
    school_year: z.string().min(1, "School year is required"),
  })
  .refine(
    (data) => {
      // Convert times to minutes for comparison
      const [startHours, startMinutes] = data.start_time.split(":").map(Number);
      const [endHours, endMinutes] = data.end_time.split(":").map(Number);
      const startTotal = startHours * 60 + startMinutes;
      const endTotal = endHours * 60 + endMinutes;
      return endTotal > startTotal;
    },
    {
      message: "End time must be after start time",
      path: ["end_time"],
    }
  );

type FormType = z.infer<typeof FormSchema>;

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subjects, setSubjects] = useState<
    Array<{ id: string; name: string; code: string; grade_level: number }>
  >([]);
  const [sections, setSections] = useState<
    Array<{ id: string; name: string; grade_level: number }>
  >([]);
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const hasResetForEditRef = useRef<string | null>(null);

  const dispatch = useAppDispatch();
  const allSchedules = useSelector(
    (state: RootState) => state.list.value
  ) as SubjectSchedule[];

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      subject_id: "",
      section_id: "",
      teacher_id: "",
      room_id: "",
      days_of_week: [],
      start_time: "08:00",
      end_time: "09:00",
      school_year: getCurrentSchoolYear(),
    },
  });

  // Fetch dropdown data
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      // Fetch subjects
      const { data: subjectsData } = await supabase
        .from("sms_subjects")
        .select("id, name, code, grade_level")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("code");

      if (subjectsData) {
        setSubjects(subjectsData);
      }

      // Fetch sections
      const { data: sectionsData } = await supabase
        .from("sms_sections")
        .select("id, name, grade_level")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");

      if (sectionsData) {
        setSections(sectionsData);
      }

      // Fetch teachers
      const { data: teachersData } = await supabase
        .from("sms_users")
        .select("id, name")
        .eq("type", "teacher")
        .eq("is_active", true)
        .order("name");

      if (teachersData) {
        setTeachers(teachersData);
      }

      // Fetch rooms
      const { data: roomsData } = await supabase
        .from("sms_rooms")
        .select("id, name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");

      if (roomsData) {
        setRooms(roomsData);
      }
    };

    fetchData();
  }, [isOpen]);

  // Reset form when modal opens
  useEffect(() => {
    if (!isOpen) {
      hasResetForEditRef.current = null;
      setConflicts([]);
      return;
    }

    if (editData?.id) {
      const editId = editData.id;
      if (hasResetForEditRef.current !== editId) {
        form.reset({
          subject_id: String(editData.subject_id),
          section_id: String(editData.section_id),
          teacher_id: String(editData.teacher_id),
          room_id: String(editData.room_id),
          days_of_week: editData.days_of_week,
          start_time: editData.start_time,
          end_time: editData.end_time,
          school_year: editData.school_year,
        });
        hasResetForEditRef.current = editId;
      }
    } else if (!editData && hasResetForEditRef.current !== "add") {
      const currentYear = getCurrentSchoolYear();
      form.reset({
        subject_id: "",
        section_id: "",
        teacher_id: "",
        room_id: "",
        days_of_week: [],
        start_time: "08:00",
        end_time: "09:00",
        school_year: currentYear,
      });
      hasResetForEditRef.current = "add";
    }
  }, [form, editData, isOpen]);

  // Check for conflicts when form values change
  useEffect(() => {
    const subscription = form.watch((value) => {
      if (
        value.subject_id &&
        value.section_id &&
        value.teacher_id &&
        value.room_id &&
        value.days_of_week &&
        value.days_of_week.length > 0 &&
        value.start_time &&
        value.end_time &&
        value.school_year
      ) {
        const scheduleData = {
          room_id: value.room_id,
          teacher_id: value.teacher_id,
          section_id: value.section_id,
          days_of_week: value.days_of_week.filter(
            (d): d is number => d !== undefined
          ),
          start_time: value.start_time,
          end_time: value.end_time,
          school_year: value.school_year,
        };

        const detectedConflicts = checkScheduleConflicts(
          scheduleData,
          allSchedules,
          editData?.id
        );

        setConflicts(detectedConflicts.map((c) => c.message));
      } else {
        setConflicts([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [form, allSchedules, editData]);

  const onSubmit = async (data: FormType) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // Check conflicts one more time before submitting
      const scheduleData = {
        room_id: data.room_id,
        teacher_id: data.teacher_id,
        section_id: data.section_id,
        days_of_week: data.days_of_week,
        start_time: data.start_time,
        end_time: data.end_time,
        school_year: data.school_year,
      };

      const detectedConflicts = checkScheduleConflicts(
        scheduleData,
        allSchedules,
        editData?.id
      );

      if (detectedConflicts.length > 0) {
        toast.error(
          `Conflicts detected: ${detectedConflicts
            .map((c) => c.type)
            .join(", ")}`
        );
        setConflicts(detectedConflicts.map((c) => c.message));
        setIsSubmitting(false);
        return;
      }

      const newData = {
        subject_id: parseInt(data.subject_id),
        section_id: parseInt(data.section_id),
        teacher_id: parseInt(data.teacher_id),
        room_id: parseInt(data.room_id),
        days_of_week: data.days_of_week,
        start_time: `${data.start_time}:00`, // Add seconds for TIME type
        end_time: `${data.end_time}:00`,
        school_year: data.school_year.trim(),
      };

      if (editData?.id) {
        const { error } = await supabase
          .from(table)
          .update(newData)
          .eq("id", editData.id);

        if (error) {
          if (error.message.includes("conflict")) {
            toast.error(
              "Schedule conflict detected. Please check the details."
            );
          } else {
            throw new Error(error.message);
          }
        } else {
          const { data: updated } = await supabase
            .from(table)
            .select()
            .eq("id", editData.id)
            .single();

          if (updated) {
            dispatch(updateList(updated));
          }

          onClose();
          toast.success("Schedule updated successfully!");
        }
      } else {
        const { data: inserted, error } = await supabase
          .from(table)
          .insert([newData])
          .select()
          .single();

        if (error) {
          if (error.message.includes("conflict")) {
            toast.error(
              "Schedule conflict detected. Please check the details."
            );
          } else {
            throw new Error(error.message);
          }
        } else {
          dispatch(addItem(inserted));
          onClose();
          toast.success("Schedule added successfully!");
        }
      }
    } catch (err) {
      console.error("Submission error:", err);
      toast.error(err instanceof Error ? err.message : "Error saving schedule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      form.reset();
      setConflicts([]);
      onClose();
    }
  };

  const handleDayToggle = (day: number, checked: boolean) => {
    const currentDays = form.getValues("days_of_week") || [];
    if (checked) {
      form.setValue("days_of_week", [...currentDays, day]);
    } else {
      form.setValue(
        "days_of_week",
        currentDays.filter((d) => d !== day)
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {editData ? "Edit" : "Add"} {title}
          </DialogTitle>
          <DialogDescription>
            {editData
              ? "Update schedule information below."
              : "Fill in the details to add a new schedule."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="subject_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Subject <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select subject" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {subjects.map((subject) => (
                          <SelectItem
                            key={subject.id}
                            value={String(subject.id)}
                          >
                            {subject.code} - {subject.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select section" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sections.map((section) => (
                          <SelectItem
                            key={section.id}
                            value={String(section.id)}
                          >
                            {section.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="teacher_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Teacher <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select teacher" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {teachers.map((teacher) => (
                          <SelectItem
                            key={teacher.id}
                            value={String(teacher.id)}
                          >
                            {teacher.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="room_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Room <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select room" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {rooms.map((room) => (
                          <SelectItem key={room.id} value={String(room.id)}>
                            {room.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="days_of_week"
              render={() => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Days of Week <span className="text-red-500">*</span>
                  </FormLabel>
                  <div className="grid grid-cols-4 gap-3">
                    {DAYS.map((day) => (
                      <FormField
                        key={day.value}
                        control={form.control}
                        name="days_of_week"
                        render={() => {
                          const currentDays =
                            form.getValues("days_of_week") || [];
                          return (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={currentDays.includes(day.value)}
                                  onChange={(e) =>
                                    handleDayToggle(day.value, e.target.checked)
                                  }
                                  disabled={isSubmitting}
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-normal cursor-pointer">
                                {day.label.slice(0, 3)}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Start Time <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="time"
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
                name="end_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      End Time <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="time"
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
                name="school_year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      School Year <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
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

            {conflicts.length > 0 && (
              <div className="rounded-md bg-red-50 border border-red-200 p-4">
                <h4 className="text-sm font-medium text-red-800 mb-2">
                  Schedule Conflicts Detected:
                </h4>
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {conflicts.map((conflict, index) => (
                    <li key={index}>{conflict}</li>
                  ))}
                </ul>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0 space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
                className="h-10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || conflicts.length > 0}
                className="h-10 min-w-[100px]"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {editData ? "Updating..." : "Saving..."}
                  </span>
                ) : editData ? (
                  "Update"
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
