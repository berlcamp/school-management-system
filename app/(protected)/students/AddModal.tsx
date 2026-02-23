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
import { Student } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

type ItemType = Student;
const table = "sms_students";
const title = "Student";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: ItemType | null;
}

const FormSchema = z.object({
  lrn: z.string().min(1, "LRN is required"),
  first_name: z.string().min(1, "First name is required"),
  middle_name: z.string().optional(),
  last_name: z.string().min(1, "Last name is required"),
  suffix: z.string().optional(),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["male", "female"]),
  mother_tongue: z.string().optional(),
  ip_ethnic_group: z.string().optional(),
  religion: z.string().optional(),
  purok: z.string().optional(),
  barangay: z.string().optional(),
  municipality_city: z.string().optional(),
  province: z.string().optional(),
  contact_number: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  father_last_name: z.string().optional(),
  father_first_name: z.string().optional(),
  father_middle_name: z.string().optional(),
  mother_last_name: z.string().optional(),
  mother_first_name: z.string().optional(),
  mother_middle_name: z.string().optional(),
  guardian_last_name: z.string().optional(),
  guardian_first_name: z.string().optional(),
  guardian_middle_name: z.string().optional(),
  parent_guardian_contact: z.string().optional(),
  previous_school: z.string().optional(),
  enrollment_status: z.enum([
    "enrolled",
    "transferred",
    "graduated",
    "dropped",
  ]),
  current_section_id: z.string().optional(),
});

type FormType = z.infer<typeof FormSchema>;

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sections, setSections] = useState<Array<{ id: string; name: string }>>(
    [],
  );

  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      lrn: "",
      first_name: "",
      middle_name: "",
      last_name: "",
      suffix: "",
      date_of_birth: "",
      gender: "male",
      mother_tongue: "",
      ip_ethnic_group: "",
      religion: "",
      purok: "",
      barangay: "",
      municipality_city: "",
      province: "",
      contact_number: "",
      email: "",
      father_last_name: "",
      father_first_name: "",
      father_middle_name: "",
      mother_last_name: "",
      mother_first_name: "",
      mother_middle_name: "",
      guardian_last_name: "",
      guardian_first_name: "",
      guardian_middle_name: "",
      parent_guardian_contact: "",
      previous_school: "",
      enrollment_status: "enrolled",
      current_section_id: undefined,
    },
  });

  useEffect(() => {
    const fetchSections = async () => {
      let query = supabase
        .from("sms_sections")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (user?.school_id != null) {
        query = query.eq("school_id", user.school_id);
      }
      const { data, error } = await query;

      if (!error && data) {
        setSections(data);
      }
    };

    if (isOpen) {
      fetchSections();
    }
  }, [isOpen, user?.school_id]);

  const onSubmit = async (data: FormType) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const newData = {
        lrn: data.lrn.trim(),
        first_name: data.first_name.trim(),
        middle_name: data.middle_name?.trim() || null,
        last_name: data.last_name.trim(),
        suffix: data.suffix?.trim() || null,
        date_of_birth: data.date_of_birth,
        gender: data.gender,
        mother_tongue: data.mother_tongue?.trim() || null,
        ip_ethnic_group: data.ip_ethnic_group?.trim() || null,
        religion: data.religion?.trim() || null,
        purok: data.purok?.trim() || null,
        barangay: data.barangay?.trim() || null,
        municipality_city: data.municipality_city?.trim() || null,
        province: data.province?.trim() || null,
        contact_number: data.contact_number?.trim() || null,
        email: data.email?.trim() || null,
        father_last_name: data.father_last_name?.trim() || null,
        father_first_name: data.father_first_name?.trim() || null,
        father_middle_name: data.father_middle_name?.trim() || null,
        mother_last_name: data.mother_last_name?.trim() || null,
        mother_first_name: data.mother_first_name?.trim() || null,
        mother_middle_name: data.mother_middle_name?.trim() || null,
        guardian_last_name: data.guardian_last_name?.trim() || null,
        guardian_first_name: data.guardian_first_name?.trim() || null,
        guardian_middle_name: data.guardian_middle_name?.trim() || null,
        parent_guardian_contact: data.parent_guardian_contact?.trim() || null,
        previous_school: data.previous_school?.trim() || null,
        enrollment_status: data.enrollment_status,
        current_section_id: data.current_section_id || null,
        ...(user?.school_id != null && { school_id: user.school_id }),
        enrolled_at:
          data.enrollment_status === "enrolled"
            ? new Date().toISOString()
            : null,
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

        if (error) {
          if (error.code === "23505") toast.error("LRN already exists");
          throw new Error(error.message);
        }

        let selectQuery = supabase
          .from(table)
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
        toast.success("Student updated successfully!");
      } else {
        const insertData = {
          ...newData,
          ...(user?.school_id != null && { school_id: user.school_id }),
        };
        const { data: inserted, error } = await supabase
          .from(table)
          .insert([insertData])
          .select()
          .single();

        if (error) {
          if (error.code === "23505") toast.error("LRN already exists");
          throw new Error(error.message);
        }

        dispatch(addItem(inserted));
        onClose();
        toast.success("Student added successfully!");
      }
    } catch (err) {
      console.error("Submission error:", err);
      toast.error(err instanceof Error ? err.message : "Error saving student");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      form.reset({
        lrn: editData?.lrn || "",
        first_name: editData?.first_name || "",
        middle_name: editData?.middle_name || "",
        last_name: editData?.last_name || "",
        suffix: editData?.suffix || "",
        date_of_birth: editData?.date_of_birth || "",
        gender: (editData?.gender as "male" | "female") || "male",
        mother_tongue: editData?.mother_tongue || "",
        ip_ethnic_group: editData?.ip_ethnic_group || "",
        religion: editData?.religion || "",
        purok: editData?.purok || "",
        barangay: editData?.barangay || "",
        municipality_city: editData?.municipality_city || "",
        province: editData?.province || "",
        contact_number: editData?.contact_number || "",
        email: editData?.email || "",
        father_last_name: editData?.father_last_name || "",
        father_first_name: editData?.father_first_name || "",
        father_middle_name: editData?.father_middle_name || "",
        mother_last_name: editData?.mother_last_name || "",
        mother_first_name: editData?.mother_first_name || "",
        mother_middle_name: editData?.mother_middle_name || "",
        guardian_last_name: editData?.guardian_last_name || "",
        guardian_first_name: editData?.guardian_first_name || "",
        guardian_middle_name: editData?.guardian_middle_name || "",
        parent_guardian_contact: editData?.parent_guardian_contact || "",
        previous_school: editData?.previous_school || "",
        enrollment_status:
          (editData?.enrollment_status as
            | "enrolled"
            | "transferred"
            | "graduated"
            | "dropped") || "enrolled",
        current_section_id: editData?.current_section_id || undefined,
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
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {editData ? "Edit" : "Add"} {title}
          </DialogTitle>
          <DialogDescription>
            {editData
              ? "Update student information below."
              : "Fill in the details to add a new student."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="lrn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      LRN (Learner Reference Number){" "}
                      <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter LRN"
                        className="h-10"
                        {...field}
                        disabled={isSubmitting || !!editData}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="enrollment_status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Enrollment Status <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="enrolled">Enrolled</SelectItem>
                        <SelectItem value="transferred">Transferred</SelectItem>
                        <SelectItem value="graduated">Graduated</SelectItem>
                        <SelectItem value="dropped">Dropped</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Last Name <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Last name"
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
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      First Name <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="First name"
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
                name="middle_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Middle Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Middle name"
                        className="h-10"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="suffix"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Suffix
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Jr., Sr., III, etc."
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
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Date of Birth <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
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
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Gender <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="mother_tongue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Mother Tongue
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Mother tongue"
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
                name="ip_ethnic_group"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      IP (Ethnic Group)
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ethnic group"
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
                name="religion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Religion
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Religion"
                        className="h-10"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-4">Address</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="purok"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Purok
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Purok"
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
                  name="barangay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Barangay
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Barangay"
                          className="h-10"
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <FormField
                  control={form.control}
                  name="municipality_city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Municipality/City
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Municipality/City"
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
                  name="province"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Province
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Province"
                          className="h-10"
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contact_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Contact Number
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Contact number"
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
                    <FormLabel className="text-sm font-medium">Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="Email address"
                        className="h-10"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-4">Father Information</h3>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="father_last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Last Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Father's last name"
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
                  name="father_first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        First Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Father's first name"
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
                  name="father_middle_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Middle Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Father's middle name"
                          className="h-10"
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-4">Mother Information</h3>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="mother_last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Last Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Mother's last name"
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
                  name="mother_first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        First Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Mother's first name"
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
                  name="mother_middle_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Middle Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Mother's middle name"
                          className="h-10"
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-4">
                Guardian Information
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="guardian_last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Last Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Guardian's last name"
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
                  name="guardian_first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        First Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Guardian's first name"
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
                  name="guardian_middle_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Middle Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Guardian's middle name"
                          className="h-10"
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="parent_guardian_contact"
                render={({ field }) => (
                  <FormItem className="mt-4">
                    <FormLabel className="text-sm font-medium">
                      Contact Number of Parent or Guardian
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Contact number"
                        className="h-10"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="previous_school"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Previous School
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Previous school (if transferred)"
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
                name="current_section_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Current Section
                    </FormLabel>
                    <Select
                      onValueChange={(value) =>
                        field.onChange(value === "none" ? undefined : value)
                      }
                      value={field.value || "none"}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select section (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">
                          No section assigned
                        </SelectItem>
                        {sections.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
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
