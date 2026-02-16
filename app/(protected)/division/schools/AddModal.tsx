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
import { SCHOOL_DISTRICTS } from "@/lib/constants";
import { useAppDispatch } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { School } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

type ItemType = School;
const table = "sms_schools";
const title = "School";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: ItemType | null;
}

const FormSchema = z.object({
  school_id: z.string().min(1, "School ID is required"),
  name: z.string().min(1, "School name is required"),
  school_type: z
    .enum(["elementary", "junior_high", "senior_high", "integrated"])
    .optional(),
  address: z.string().optional(),
  district: z.string().optional(),
  region: z.string().optional(),
  municipality_city: z.string().optional(),
  email: z.union([z.string().email("Invalid email"), z.literal("")]).optional(),
  telephone_number: z.string().optional(),
  mobile_number: z.string().optional(),
  facebook_url: z
    .union([z.string().url("Invalid URL"), z.literal("")])
    .optional(),
  is_active: z.boolean().default(true),
});

type FormType = z.infer<typeof FormSchema>;

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasResetForEditRef = useRef<string | null>(null);

  const dispatch = useAppDispatch();

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      school_id: "",
      name: "",
      school_type: undefined,
      address: "",
      district: "",
      region: "",
      municipality_city: "",
      email: "",
      telephone_number: "",
      mobile_number: "",
      facebook_url: "",
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
          school_id: editData.school_id || "",
          name: editData.name || "",
          school_type:
            (editData.school_type as FormType["school_type"]) ?? undefined,
          address: editData.address || "",
          district: editData.district || "",
          region: editData.region || "",
          municipality_city: editData.municipality_city || "",
          email: editData.email || "",
          telephone_number: editData.telephone_number || "",
          mobile_number: editData.mobile_number || "",
          facebook_url: editData.facebook_url || "",
          is_active: editData.is_active ?? true,
        });
        hasResetForEditRef.current = editId;
      }
    } else if (!editData && hasResetForEditRef.current !== "add") {
      form.reset({
        school_id: "",
        name: "",
        school_type: undefined,
        address: "",
        district: "",
        region: "",
        municipality_city: "",
        email: "",
        telephone_number: "",
        mobile_number: "",
        facebook_url: "",
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
        school_id: data.school_id.trim(),
        name: data.name.trim(),
        school_type: data.school_type || null,
        address: data.address?.trim() || null,
        district: data.district?.trim() || null,
        region: data.region?.trim() || null,
        municipality_city: data.municipality_city?.trim() || null,
        email: data.email?.trim() || null,
        telephone_number: data.telephone_number?.trim() || null,
        mobile_number: data.mobile_number?.trim() || null,
        facebook_url: data.facebook_url?.trim() || null,
        is_active: data.is_active,
      };

      if (editData?.id) {
        const { error } = await supabase
          .from(table)
          .update({
            school_id: newData.school_id,
            name: newData.name,
            school_type: newData.school_type,
            address: newData.address,
            district: newData.district,
            region: newData.region,
            municipality_city: newData.municipality_city,
            email: newData.email,
            telephone_number: newData.telephone_number,
            mobile_number: newData.mobile_number,
            facebook_url: newData.facebook_url,
            is_active: newData.is_active,
          })
          .eq("id", editData.id);

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
        toast.success("School updated successfully!");
      } else {
        const { data: inserted, error } = await supabase
          .from(table)
          .insert([newData])
          .select()
          .single();

        if (error) {
          if (error.code === "23505") toast.error("School ID already exists");
          throw new Error(error.message);
        }

        dispatch(addItem(inserted));
        onClose();
        toast.success("School added successfully!");
      }
    } catch (err) {
      console.error("Submission error:", err);
      toast.error(err instanceof Error ? err.message : "Error saving school");
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
              ? "Update school information below."
              : "Fill in the DepEd school details."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="school_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      School ID (DepEd) <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., 123456"
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      School Name <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Sample Elementary School"
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
              name="school_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    School Type
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select school type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="elementary">Elementary</SelectItem>
                      <SelectItem value="junior_high">Junior High</SelectItem>
                      <SelectItem value="senior_high">Senior High</SelectItem>
                      <SelectItem value="integrated">Integrated</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Full address"
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
              name="district"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    District
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select district" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SCHOOL_DISTRICTS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Email
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="school@example.com"
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
                name="telephone_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Telephone Number
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Landline"
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
                name="mobile_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Mobile Number
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Mobile number"
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
                name="facebook_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Facebook URL
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://facebook.com/..."
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
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Region
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Region"
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
