// components/AddItemTypeModal.tsx
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEFAULT_STAFF_CATEGORY,
  LEARNING_AREAS,
  SCHOOL_HEAD_ASSIGNABLE_USER_TYPES,
  SCHOOL_STAFF_USER_TYPES,
  USER_TYPE_LABELS,
  canManageRoleSet,
  isLoginDisabledUserType,
  isTeacherRole,
} from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { fetchUserRoles, syncUserRoles } from "@/lib/utils/userRoles";
import { User } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

// Always update this on other pages
type ItemType = User;
const table = "sms_users";
const title = "Staff";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: ItemType | null; // Optional prop for editing existing item
}

const FormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  employee_id: z.string().optional(),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  position: z.string().optional(),
  type: z.enum(SCHOOL_STAFF_USER_TYPES, {
    required_error: "Staff type is required",
  }),
  staff_category_code: z
    .enum([
      "admin",
      "utility",
      "security",
      "health",
      "library",
      "guidance",
      "other",
      "teacher",
    ])
    .optional(),
  // DepEd calls this Sex on its personnel forms; the column is `gender` to
  // match sms_students and its value domain (migration 146).
  gender: z.enum(["male", "female"]).optional(),
  // Teaching specialization. Only meaningful for teaching staff.
  learning_area: z.string().optional(),
  // The other jobs this person also does here (migration 163). The adviser who
  // is also the school nurse holds both; `type` above is whichever one they are
  // working in right now, and they swap from the header role switcher.
  additional_roles: z.array(z.string()).optional(),
});

type FormType = z.infer<typeof FormSchema>;

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rolesLoadFailed, setRolesLoadFailed] = useState(false);

  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: editData ? editData.name : "",
      employee_id: editData?.employee_id ?? "",
      email: editData ? editData.email : "",
      position: editData?.position ?? "",
      type: (editData?.type as FormType["type"]) || undefined,
      staff_category_code:
        (editData?.staff_category_code as FormType["staff_category_code"]) || undefined,
      gender: (editData?.gender as FormType["gender"]) || undefined,
      learning_area: editData?.learning_area ?? undefined,
      additional_roles: [],
    },
  });

  /**
   * Keep `sms_user_roles` in step with the form (migration 163).
   *
   * Only roles this actor may assign are touched, so a school head who cannot
   * hand out `school_head` simply leaves that row alone rather than being
   * refused by RLS — see `syncUserRoles`.
   */
  const saveRoles = async (userId: string | number, data: FormType) => {
    if (!canManageRoleSet(user?.type)) return;
    await syncUserRoles({
      userId,
      schoolId: user?.school_id ?? null,
      primaryRole: data.type,
      extraRoles: data.additional_roles ?? [],
      actorType: user?.type,
    });
  };

  // Submit handler
  const onSubmit = async (data: FormType) => {
    if (isSubmitting) return; // 🚫 Prevent double-submit
    setIsSubmitting(true);

    try {
      // The role often implies the category the Non-Teaching Personnel report
      // needs; fall back to it rather than filing the person under nothing.
      const derivedCategory = isTeacherRole(data.type)
        ? "teacher"
        : data.staff_category_code ||
          DEFAULT_STAFF_CATEGORY[data.type] ||
          null;
      const newData = {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        type: data.type,
        staff_category_code: derivedCategory,
        position: data.position?.trim() || null,
        gender: data.gender || null,
        // A learning area is a teaching specialization; keeping one on a
        // non-teaching record would put that person in the Teaching
        // Specialization report (migration 146).
        learning_area: isTeacherRole(data.type)
          ? data.learning_area || null
          : null,
        ...(user?.school_id != null && { school_id: user.school_id }),
        ...(data.employee_id?.trim() && { employee_id: data.employee_id.trim() }),
      };

      // 🔹 Step 4: Insert or Update logic
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

        // ✅ Fetch updated record
        const { data: updated } = await supabase
          .from(table)
          .select()
          .eq("id", editData.id)
          .single();

        if (updated) {
          dispatch(updateList(updated));
        }

        // Skipped when the existing set could not be read — a diff against a
        // set we never loaded would delete roles the encoder never saw.
        if (!rolesLoadFailed) {
          await saveRoles(editData.id, data);
        }

        onClose();
        toast.success("Staff member updated successfully!");
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
          dispatch(addItem(inserted));
          await saveRoles(inserted.id, data);
        }
        onClose();
        toast.success("Staff member added successfully!");
      }
    } catch (err) {
      console.error("Submission error:", err);
      toast.error(err instanceof Error ? err.message : "Error saving staff member");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      form.clearErrors();
      form.reset({
        name: editData?.name || "",
        employee_id: editData?.employee_id ?? "",
        email: editData?.email || "",
        position: editData?.position ?? "",
        type: (editData?.type as FormType["type"]) || undefined,
        staff_category_code:
          (editData as unknown as { staff_category_code?: FormType["staff_category_code"] })
            ?.staff_category_code || undefined,
        gender: (editData?.gender as FormType["gender"]) || undefined,
        learning_area: editData?.learning_area ?? undefined,
        additional_roles: [],
      });
    }
  }, [form, editData, isOpen]);

  // The extra roles this person already holds here, loaded on open so the
  // checkboxes start from the database rather than from blank (which a diffing
  // save would read as "remove them all").
  useEffect(() => {
    if (!isOpen || !editData?.id || !canManageRoleSet(user?.type)) return;

    let isMounted = true;
    fetchUserRoles(editData.id, user?.school_id ?? null)
      .then((roles) => {
        if (!isMounted) return;
        form.setValue(
          "additional_roles",
          roles.filter((role) => role !== editData.type),
        );
      })
      .catch(() => {
        // Non-fatal: the rest of the record still edits. Leaving the box empty
        // is safe because syncUserRoles is skipped when nothing was loaded.
        if (isMounted) setRolesLoadFailed(true);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, editData?.id, editData?.type, user?.type, user?.school_id, form]);

  const handleClose = () => {
    if (!isSubmitting) {
      form.reset();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {editData ? "Edit" : "Add"} {title}
          </DialogTitle>
          <DialogDescription>
            {editData
              ? "Update staff member information below."
              : "Fill in the details to add a new staff member."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Staff Name <span className="text-red-500">*</span>
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
                      placeholder="staff@example.com"
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
                    Staff Type <span className="text-red-500">*</span>
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select staff type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SCHOOL_STAFF_USER_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {USER_TYPE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">
                    {isLoginDisabledUserType(field.value)
                      ? "Personnel record only — this role cannot sign in to the system."
                      : "Select the role/type for this staff member."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Migration 163: the other jobs this person also does here. The
                adviser who is also the school nurse holds both and swaps from
                the header; `Staff Type` above is the one they start in. */}
            {canManageRoleSet(user?.type) &&
              !isLoginDisabledUserType(form.watch("type")) && (
                <FormField
                  control={form.control}
                  name="additional_roles"
                  render={({ field }) => {
                    const selected = field.value ?? [];
                    const primary = form.watch("type");
                    const options = SCHOOL_HEAD_ASSIGNABLE_USER_TYPES.filter(
                      (role) => role !== primary,
                    );

                    return (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          Also works as
                        </FormLabel>
                        <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                          {options.map((role) => (
                            <label
                              key={role}
                              className="flex items-center gap-2 text-sm"
                            >
                              <Checkbox
                                checked={selected.includes(role)}
                                disabled={isSubmitting}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.checked
                                      ? [...selected, role]
                                      : selected.filter((r) => r !== role),
                                  )
                                }
                              />
                              {USER_TYPE_LABELS[role]}
                            </label>
                          ))}
                        </div>
                        <FormDescription className="text-xs">
                          {rolesLoadFailed
                            ? "Could not read this person's current roles, so they are left unchanged."
                            : "They switch between these from the header. Leave blank if they only do one job."}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              )}

            <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Position / Designation
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Teacher III, Assistant School Head"
                      className="h-10"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Optional. Enter &quot;Assistant School Head&quot; (or
                    &quot;Assistant Principal&quot;) to count this person under
                    Assistant School Head on the dashboard.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Sex — the only staff field the division's Teaching
                Specialization report needs that the system never captured
                (migration 146). No personnel count uses it until it is set. */}
            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Sex</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select sex" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">
                    Required for the division Teaching Specialization report.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Teaching specialization, for teaching roles only — mirrors how
                staff_category_code is shown only for non-teaching ones. */}
            {isTeacherRole(form.watch("type")) && (
              <FormField
                control={form.control}
                name="learning_area"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Teaching Specialization
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select learning area" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEARNING_AREAS.map((a) => (
                          <SelectItem key={a.code} value={a.code}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      Feeds the division Teaching Specialization report.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {form.watch("type") && !isTeacherRole(form.watch("type")) && (
              <FormField
                control={form.control}
                name="staff_category_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Staff Category
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="admin">Administrative</SelectItem>
                        <SelectItem value="utility">Utility</SelectItem>
                        <SelectItem value="security">Security</SelectItem>
                        <SelectItem value="health">Health Services</SelectItem>
                        <SelectItem value="library">Library</SelectItem>
                        <SelectItem value="guidance">Guidance</SelectItem>
                        <SelectItem value="other">Other Non-Teaching</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      Used by the Division Non-Teaching Personnel report.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
