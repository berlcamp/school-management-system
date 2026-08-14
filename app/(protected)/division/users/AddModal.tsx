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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import {
  DIVISION_ASSIGNABLE_USER_TYPES,
  USER_TYPE_LABELS,
  isLoginDisabledUserType,
} from "@/lib/constants";
import { useAppDispatch } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { User } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

type ItemType = User;
const table = "sms_users";
const userSchoolTable = "sms_user_schools";
const title = "User";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: ItemType | null;
}

const DIVISION_TYPES = ["division_type"] as const;

const FormSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    employee_id: z.string().optional(),
    email: z
      .string()
      .min(1, "Email is required")
      .email("Please enter a valid email address"),
    // A user may serve several schools; they switch between them from the
    // header. The first entry is only a fallback for which one is active —
    // see `resolveActiveSchool` below.
    school_ids: z.array(z.string()).default([]),
    type: z.enum(DIVISION_ASSIGNABLE_USER_TYPES, {
      required_error: "User type is required",
    }),
  })
  .refine(
    (data) =>
      (DIVISION_TYPES as readonly string[]).includes(data.type) ||
      data.school_ids.length > 0,
    { message: "At least one school is required", path: ["school_ids"] },
  );

type FormType = z.infer<typeof FormSchema>;

/**
 * Which of the assigned schools the user is working in after the save.
 * Keep the one they are already in when it survives the edit — otherwise a
 * division admin adding a second school would silently move them out of the
 * school they were mid-task in.
 */
const resolveActiveSchool = (
  selected: string[],
  current: string | null,
): string | null => {
  if (selected.length === 0) return null;
  if (current && selected.includes(current)) return current;
  return selected[0];
};

/**
 * Brings `sms_user_schools` in line with the picker. Diffed rather than
 * wiped-and-rewritten so an unchanged assignment keeps its row (and its
 * created_at), and so a save that touches nothing writes nothing.
 */
const syncUserSchools = async (userId: string, schoolIds: string[]) => {
  const { data: existingRows, error: readError } = await supabase
    .from(userSchoolTable)
    .select("school_id")
    .eq("user_id", userId);

  if (readError) throw new Error(readError.message);

  const existing = new Set(
    (existingRows ?? []).map((r) => String(r.school_id)),
  );
  const wanted = new Set(schoolIds);

  const toRemove = [...existing].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !existing.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from(userSchoolTable)
      .delete()
      .eq("user_id", userId)
      .in("school_id", toRemove);
    if (error) throw new Error(error.message);
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from(userSchoolTable).insert(
      toAdd.map((schoolId) => ({
        user_id: Number(userId),
        school_id: Number(schoolId),
      })),
    );
    if (error) throw new Error(error.message);
  }
};

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [schoolPickerOpen, setSchoolPickerOpen] = useState(false);
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
      school_ids: editData?.school_id != null ? [String(editData.school_id)] : [],
      type: (editData?.type as FormType["type"]) || undefined,
    },
  });

  const selectedType = form.watch("type");
  const selectedSchoolIds = form.watch("school_ids");

  const onSubmit = async (data: FormType) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const isDivisionType = (DIVISION_TYPES as readonly string[]).includes(data.type);
      const schoolIds = isDivisionType ? [] : data.school_ids;
      const activeSchool = resolveActiveSchool(
        schoolIds,
        editData?.school_id != null ? String(editData.school_id) : null,
      );

      const newData = {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        type: data.type,
        school_id: activeSchool,
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

        await syncUserSchools(editData.id, schoolIds);

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

        if (inserted) {
          await syncUserSchools(inserted.id, schoolIds);
          dispatch(addItem(inserted));
        }
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

  // Clear the school assignment when switching to a division-level type
  useEffect(() => {
    if ((DIVISION_TYPES as readonly string[]).includes(selectedType)) {
      form.setValue("school_ids", []);
    }
  }, [selectedType, form]);

  useEffect(() => {
    if (isOpen) {
      form.reset({
        name: editData?.name || "",
        employee_id: editData?.employee_id ?? "",
        email: editData?.email || "",
        // Seeded from the active school so the picker is never empty while the
        // real assignment list loads below.
        school_ids:
          editData?.school_id != null ? [String(editData.school_id)] : [],
        type: (editData?.type as FormType["type"]) || undefined,
      });
    }
  }, [form, editData, isOpen]);

  // Load the full assignment set for the user being edited.
  useEffect(() => {
    if (!isOpen || !editData?.id) return;
    let isMounted = true;

    supabase
      .from(userSchoolTable)
      .select("school_id")
      .eq("user_id", editData.id)
      .then(({ data, error }) => {
        if (!isMounted || error || !data) return;
        form.setValue(
          "school_ids",
          data.map((r) => String(r.school_id)),
        );
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, editData?.id, form]);

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
            {!(DIVISION_TYPES as readonly string[]).includes(selectedType) && (
              <FormField
                control={form.control}
                name="school_ids"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Schools <span className="text-red-500">*</span>
                    </FormLabel>
                    <Popover
                      open={schoolPickerOpen}
                      onOpenChange={setSchoolPickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <FormControl>
                          <button
                            type="button"
                            disabled={isSubmitting}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                          >
                            <span
                              className={
                                field.value.length === 0
                                  ? "text-muted-foreground"
                                  : ""
                              }
                            >
                              {field.value.length === 0
                                ? "Select school(s)"
                                : `${field.value.length} school${
                                    field.value.length > 1 ? "s" : ""
                                  } selected`}
                            </span>
                            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                          </button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[--radix-popover-trigger-width] p-0"
                      >
                        <Command>
                          <CommandInput placeholder="Search school…" />
                          <CommandList>
                            <CommandEmpty>No school found.</CommandEmpty>
                            <CommandGroup>
                              {schools.map((s) => {
                                const id = String(s.id);
                                const checked = field.value.includes(id);
                                return (
                                  <CommandItem
                                    key={id}
                                    value={`${s.name} ${s.school_id}`}
                                    className="cursor-pointer"
                                    onSelect={() =>
                                      field.onChange(
                                        checked
                                          ? field.value.filter((v) => v !== id)
                                          : [...field.value, id],
                                      )
                                    }
                                  >
                                    <Check
                                      className={
                                        checked
                                          ? "mr-2 h-4 w-4 opacity-100"
                                          : "mr-2 h-4 w-4 opacity-0"
                                      }
                                    />
                                    <div className="flex flex-col">
                                      <span className="text-sm">{s.name}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {s.school_id}
                                      </span>
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    {field.value.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {field.value.map((id) => {
                          const school = schools.find(
                            (s) => String(s.id) === id,
                          );
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                            >
                              {school?.name ?? id}
                              <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() =>
                                  field.onChange(
                                    field.value.filter((v) => v !== id),
                                  )
                                }
                                className="hover:text-primary/70"
                                aria-label={`Remove ${school?.name ?? id}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <FormDescription className="text-xs">
                      {selectedSchoolIds.length > 1
                        ? "This user can switch between these schools from the header."
                        : "Select every school this user works in. Assign more than one and they can switch between them from the header."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
                      {DIVISION_ASSIGNABLE_USER_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {USER_TYPE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">
                    {isLoginDisabledUserType(field.value)
                      ? "Personnel record only — this role cannot sign in to the system."
                      : "Select the role for this user."}
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
