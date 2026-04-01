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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { getSchoolYearOptions } from "@/lib/utils/schoolYear";
import { Evaluation } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

type ItemType = Evaluation;

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: ItemType | null;
}

const FormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.enum(["student_to_teacher", "teacher_to_principal"]),
  school_year: z.string().min(1, "School year is required"),
  is_active: z.boolean().default(false),
});

type FormType = z.infer<typeof FormSchema>;

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasResetForEditRef = useRef<string | null>(null);

  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);

  const schoolYearOptions = getSchoolYearOptions();

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "student_to_teacher",
      school_year: "",
      is_active: false,
    },
  });

  useEffect(() => {
    if (!isOpen) {
      hasResetForEditRef.current = null;
      return;
    }

    if (editData?.id) {
      const editId = editData.id;
      if (hasResetForEditRef.current !== editId) {
        form.reset({
          title: editData.title || "",
          description: editData.description || "",
          type: editData.type || "student_to_teacher",
          school_year: editData.school_year || "",
          is_active: editData.is_active ?? false,
        });
        hasResetForEditRef.current = editId;
      }
    } else if (!editData && hasResetForEditRef.current !== "add") {
      form.reset({
        title: "",
        description: "",
        type: "student_to_teacher",
        school_year: "",
        is_active: false,
      });
      hasResetForEditRef.current = "add";
    }
  }, [form, editData, isOpen]);

  const onSubmit = async (data: FormType) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const newData = {
        title: data.title.trim(),
        description: data.description?.trim() || null,
        type: data.type,
        school_year: data.school_year,
        is_active: data.is_active,
        ...(user?.school_id != null && { school_id: user.school_id }),
      };

      if (editData?.id) {
        let updateQuery = supabase
          .from("sms_evaluations")
          .update(newData)
          .eq("id", editData.id);
        if (user?.school_id != null) {
          updateQuery = updateQuery.eq("school_id", user.school_id);
        }
        const { error } = await updateQuery;

        if (error) throw new Error(error.message);

        let selectQuery = supabase
          .from("sms_evaluations")
          .select()
          .eq("id", editData.id);
        if (user?.school_id != null) {
          selectQuery = selectQuery.eq("school_id", user.school_id);
        }
        const { data: updated } = await selectQuery.single();

        if (updated) {
          dispatch(updateList(updated));
        }

        onClose();
        toast.success("Evaluation updated successfully!");
      } else {
        const { data: inserted, error } = await supabase
          .from("sms_evaluations")
          .insert([newData])
          .select()
          .single();

        if (error) throw new Error(error.message);

        if (inserted) {
          dispatch(addItem(inserted));
        }
        onClose();
        toast.success("Evaluation added successfully!");
      }
    } catch (err) {
      console.error("Submission error:", err);
      toast.error(
        err instanceof Error ? err.message : "Error saving evaluation",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      form.reset();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {editData ? "Edit" : "Add"} Evaluation
          </DialogTitle>
          <DialogDescription>
            {editData
              ? "Update the evaluation details below."
              : "Create a new evaluation questionnaire."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Title <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Teacher Evaluation - SY 2025-2026"
                      className="h-10"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Type <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="student_to_teacher">
                          Student to Teacher
                        </SelectItem>
                        <SelectItem value="teacher_to_principal">
                          Teacher to Principal
                        </SelectItem>
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
                        {schoolYearOptions.map((sy) => (
                          <SelectItem key={sy} value={sy}>
                            {sy}
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Description
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter a brief description (optional)"
                      className="min-h-[80px]"
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
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      Active
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      When active, this evaluation is visible to respondents
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-2 space-x-2">
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
                disabled={isSubmitting}
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
