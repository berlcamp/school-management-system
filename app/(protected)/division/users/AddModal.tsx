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
  FormDescription,
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
import { User } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

type ItemType = User;
const table = "sms_users";
const title = "User";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: ItemType | null;
}

const FormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  employee_id: z.string().optional(),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  school_id: z.string().min(1, "School is required"),
  type: z.enum(["school_head", "teacher", "registrar", "admin"], {
    required_error: "User type is required",
  }),
});

type FormType = z.infer<typeof FormSchema>;

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [schools, setSchools] = useState<
    { id: string; school_id: string; name: string }[]
  >([]);

  const dispatch = useAppDispatch();

  useEffect(() => {
    if (isOpen) {
      supabase
        .from("sms_schools")
        .select("id, school_id, name")
        .eq("is_active", true)
        .order("name")
        .then(({ data }) => setSchools(data || []));
    }
  }, [isOpen]);

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: editData ? editData.name : "",
      employee_id: editData?.employee_id ?? "",
      email: editData ? editData.email : "",
      school_id: editData?.school_id != null ? String(editData.school_id) : "",
      type:
        (editData?.type as "school_head" | "teacher" | "registrar" | "admin") ||
        undefined,
    },
  });

  const onSubmit = async (data: FormType) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const newData = {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        type: data.type,
        school_id: data.school_id.trim(),
        ...(data.employee_id?.trim() && { employee_id: data.employee_id.trim() }),
      };

      if (editData?.id) {
        const { error } = await supabase
          .from(table)
          .update(newData)
          .eq("id", editData.id);

        if (error) {
          if (
            error.code === "23505" &&
            error.message?.includes("sms_users_email_key")
          ) {
            form.setError("email", {
              type: "manual",
              message: "Email already exists",
            });
            return;
          }
          throw new Error(error.message);
        }

        const { data: updated } = await supabase
          .from(table)
          .select()
          .eq("id", editData.id)
          .single();

        if (updated) {
          dispatch(updateList(updated));
        }

        onClose();
        toast.success("User updated successfully!");
      } else {
        const { data: inserted, error } = await supabase
          .from(table)
          .insert([newData])
          .select()
          .single();

        if (error) {
          if (
            error.code === "23505" &&
            error.message?.includes("sms_users_email_key")
          ) {
            form.setError("email", {
              type: "manual",
              message: "Email already exists",
            });
            return;
          }
          throw new Error(error.message);
        }

        dispatch(addItem(inserted));
        onClose();
        toast.success("User added successfully!");
      }
    } catch (err) {
      console.error("Submission error:", err);
      toast.error(err instanceof Error ? err.message : "Error saving user");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      form.reset({
        name: editData?.name || "",
        employee_id: editData?.employee_id ?? "",
        email: editData?.email || "",
        school_id:
          editData?.school_id != null ? String(editData.school_id) : "",
        type:
          (editData?.type as
            | "school_head"
            | "teacher"
            | "registrar"
            | "admin") || undefined,
      });
    }
  }, [form, editData, isOpen]);

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
            {editData ? "Edit" : "Add"} {title}
          </DialogTitle>
          <DialogDescription>
            {editData
              ? "Update user information below."
              : "Fill in the details. School selection is required before saving."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="school_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    School <span className="text-red-500">*</span>
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || ""}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select school" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {schools.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name} ({s.school_id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">
                    Select the school this user belongs to.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Name <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter full name"
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
              name="employee_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Employee ID
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter employee ID"
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Email Address <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="user@example.com"
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
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    User Type <span className="text-red-500">*</span>
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select user type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectContent>
                        <SelectItem value="school_head">School Head</SelectItem>
                        <SelectItem value="teacher">Teacher</SelectItem>
                        <SelectItem value="registrar">Registrar</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">
                    Select the role for this user.
                  </FormDescription>
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
