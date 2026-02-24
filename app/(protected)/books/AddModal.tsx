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
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { getGradeLevelLabel } from "@/lib/constants";
import { Book } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

type ItemType = Book;
const table = "sms_books";
const title = "Book";

const BOOK_GRADE_LEVELS = Array.from({ length: 12 }, (_, i) => i + 1);

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: ItemType | null;
}

const FormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  subject_area: z.string().min(1, "Subject area is required"),
  grade_level: z.number().min(1).max(12),
  isbn: z.string().optional(),
  is_active: z.boolean().default(true),
});

type FormType = z.infer<typeof FormSchema>;

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasResetForEditRef = useRef<string | null>(null);

  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      title: "",
      subject_area: "",
      grade_level: 1,
      isbn: "",
      is_active: true,
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
          subject_area: editData.subject_area || "",
          grade_level: editData.grade_level ?? 1,
          isbn: editData.isbn || "",
          is_active: editData.is_active ?? true,
        });
        hasResetForEditRef.current = editId;
      }
    } else if (!editData && hasResetForEditRef.current !== "add") {
      form.reset({
        title: "",
        subject_area: "",
        grade_level: 1,
        isbn: "",
        is_active: true,
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
        subject_area: data.subject_area.trim(),
        grade_level: data.grade_level,
        isbn: data.isbn?.trim() || null,
        is_active: data.is_active,
        ...(user?.school_id != null && { school_id: user.school_id }),
      };

      if (editData?.id) {
        let updateQuery = supabase
          .from(table)
          .update(newData)
          .eq("id", editData.id);
        if (user?.school_id != null) {
          updateQuery = updateQuery.eq("school_id", user.school_id);
        }
        const { error } = await updateQuery;

        if (error) throw new Error(error.message);

        const { data: updated } = await supabase
          .from(table)
          .select()
          .eq("id", editData.id)
          .single();

        if (updated) {
          dispatch(updateList(updated));
        }

        onClose();
        toast.success("Book updated successfully!");
      } else {
        const { data: inserted, error } = await supabase
          .from(table)
          .insert([newData])
          .select()
          .single();

        if (error) {
          if (error.code === "23505")
            toast.error("A book with this title and grade level already exists");
          else throw new Error(error.message);
        }

        if (inserted) {
          dispatch(addItem(inserted));
        }
        onClose();
        toast.success("Book added successfully!");
      }
    } catch (err) {
      console.error("Submission error:", err);
      toast.error(err instanceof Error ? err.message : "Error saving book");
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
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {editData ? "Edit" : "Add"} {title}
          </DialogTitle>
          <DialogDescription>
            {editData
              ? "Update book information below."
              : "Fill in the details to add a new book to the catalog."}
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
                      placeholder="e.g., English Grade 7 Textbook"
                      className="h-10"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="subject_area"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Subject Area <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., English, Mathematics"
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
                name="grade_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Grade Level <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      value={field.value?.toString()}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select grade level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BOOK_GRADE_LEVELS.map((level) => (
                          <SelectItem key={level} value={level.toString()}>
                            {getGradeLevelLabel(level)}
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
              name="isbn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">ISBN</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 978-0-123456-78-9"
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
              name="is_active"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormLabel className="text-sm font-medium">
                      Active
                    </FormLabel>
                  </div>
                  <FormMessage />
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
