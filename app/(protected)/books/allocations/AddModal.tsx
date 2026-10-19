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
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getEffectiveSchoolId } from "@/lib/utils/books";
import { getGradeLevelLabel } from "@/lib/constants";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { Loader2 } from "lucide-react";

/** An existing allocation opened for editing. Teacher and book are fixed —
 *  changing either is a different allocation, not an edit of this one. */
export interface AllocationEditData {
  id: string;
  teacher_id: string;
  book_id: string;
  quantity: number;
  teacherName: string;
  bookTitle: string;
  /** Copies still out (with learners or held by the teacher). The quantity
   *  cannot drop below this. */
  minQuantity: number;
}

interface AddModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolYear: string;
  onSuccess: () => void;
  editData?: AllocationEditData | null;
}

const FormSchema = z.object({
  teacher_id: z.string().min(1, "Teacher is required"),
  book_id: z.string().min(1, "Book is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
});

type FormType = z.infer<typeof FormSchema>;

interface TeacherOption {
  id: string;
  name: string;
}

interface BookOption {
  id: string;
  title: string;
  subject_area: string;
  grade_level: number;
}

export const AddModal = ({
  isOpen,
  onClose,
  schoolYear,
  onSuccess,
  editData = null,
}: AddModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [books, setBooks] = useState<BookOption[]>([]);

  const user = useAppSelector((state) => state.user.user);
  const effectiveSchoolId = getEffectiveSchoolId(user);

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      teacher_id: "",
      book_id: "",
      quantity: 1,
    },
  });

  useEffect(() => {
    if (!isOpen || !effectiveSchoolId) return;

    const fetchTeachers = async () => {
      const { data } = await supabase
        .from("sms_users")
        .select("id, name")
        .eq("school_id", effectiveSchoolId)
        .eq("is_active", true)
        .order("name");
      setTeachers((data || []) as TeacherOption[]);
    };

    const fetchBooks = async () => {
      const { data } = await supabase
        .from("sms_books")
        .select("id, title, subject_area, grade_level")
        .eq("school_id", effectiveSchoolId)
        .eq("is_active", true)
        .order("grade_level")
        .order("title");
      setBooks((data || []) as BookOption[]);
    };

    void fetchTeachers();
    void fetchBooks();
  }, [isOpen, effectiveSchoolId]);

  useEffect(() => {
    if (!isOpen) return;
    form.reset(
      editData
        ? {
            teacher_id: String(editData.teacher_id),
            book_id: String(editData.book_id),
            quantity: editData.quantity,
          }
        : { teacher_id: "", book_id: "", quantity: 1 },
    );
  }, [isOpen, editData, form]);

  const onSubmit = async (data: FormType) => {
    if (isSubmitting || !effectiveSchoolId) return;

    if (editData && data.quantity < editData.minQuantity) {
      form.setError("quantity", {
        message: `${editData.minQuantity} cop${editData.minQuantity === 1 ? "y is" : "ies are"} still out with this teacher or their learners — quantity cannot be lower.`,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (editData) {
        const { error } = await supabase
          .from("sms_book_allocations")
          .update({ quantity: data.quantity })
          .eq("id", editData.id)
          .eq("school_id", effectiveSchoolId);
        if (error) throw error;

        toast.success("Allocation updated successfully!");
        onSuccess();
        onClose();
        return;
      }

      const { error } = await supabase.from("sms_book_allocations").upsert(
        {
          school_id: effectiveSchoolId,
          teacher_id: Number(data.teacher_id),
          book_id: Number(data.book_id),
          quantity: data.quantity,
          school_year: schoolYear,
        },
        {
          onConflict: "teacher_id,book_id,school_year",
        },
      );

      if (error) {
        if (error.code === "23505") {
          toast.error(
            "An allocation for this teacher and book already exists for this school year.",
          );
        } else {
          throw error;
        }
        return;
      }

      toast.success("Allocation added successfully!");
      onSuccess();
      onClose();
      form.reset({ teacher_id: "", book_id: "", quantity: 1 });
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : editData
            ? "Failed to update allocation"
            : "Failed to add allocation",
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {editData ? "Edit Book Allocation" : "Add Book Allocation"}
          </DialogTitle>
          <DialogDescription>
            {editData
              ? `Change the quantity allocated for the ${schoolYear} school year.`
              : `Assign a quantity of a specific book to a teacher or adviser for the ${schoolYear} school year.`}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {editData ? (
              <div className="space-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">User: </span>
                  <span className="font-medium">{editData.teacherName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Book: </span>
                  <span className="font-medium">{editData.bookTitle}</span>
                </div>
              </div>
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="teacher_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        User <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select user" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {teachers.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.name}
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
                  name="book_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Book <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select book" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {books.map((b) => (
                            <SelectItem key={b.id} value={String(b.id)}>
                              {b.title} ({getGradeLevelLabel(b.grade_level)} -{" "}
                              {b.subject_area})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Quantity <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={Math.max(1, editData?.minQuantity ?? 1)}
                      className="h-10"
                      {...field}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 0)
                      }
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  {editData && editData.minQuantity > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {editData.minQuantity} cop
                      {editData.minQuantity === 1 ? "y is" : "ies are"} still
                      out, so the quantity cannot go below that.
                    </p>
                  )}
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
                    <Loader2 className="h-4 w-4 animate-spin" />
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
