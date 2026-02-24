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
import { supabase } from "@/lib/supabase/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import type { BookReturnCode } from "@/types/database";

interface IssuanceRow {
  id: string;
  student_id: string;
  book_id: string;
  date_issued: string;
  student?: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
  };
  book?: { title: string; subject_area: string };
}

const FormSchema = z.object({
  date_returned: z.string().min(1, "Date returned is required"),
  condition_on_return: z.string().optional(),
  return_code: z.enum(["FM", "TDO", "NEG"]).optional().nullable(),
  remarks: z.string().optional(),
});

type FormType = z.infer<typeof FormSchema>;

interface ReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  issuance: IssuanceRow | null;
  onSuccess: () => void;
}

const RETURN_CODE_OPTIONS: { value: BookReturnCode; label: string }[] = [
  { value: "FM", label: "FM - Force Majeure" },
  { value: "TDO", label: "TDO - Transferred/Dropout" },
  { value: "NEG", label: "NEG - Negligence" },
];

const CONDITION_OPTIONS = ["Good", "Damaged", "Lost", "Other"];

export const ReturnModal = ({
  isOpen,
  onClose,
  issuance,
  onSuccess,
}: ReturnModalProps) => {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      date_returned: new Date().toISOString().split("T")[0],
      condition_on_return: "Good",
      return_code: null,
      remarks: "",
    },
  });

  useEffect(() => {
    if (isOpen && issuance) {
      form.reset({
        date_returned: new Date().toISOString().split("T")[0],
        condition_on_return: "Good",
        return_code: null,
        remarks: "",
      });
    }
  }, [isOpen, issuance, form]);

  const getStudentName = () => {
    const s = issuance?.student;
    if (!s) return "—";
    return `${s.last_name}, ${s.first_name}${s.middle_name ? ` ${s.middle_name}` : ""}${s.suffix ? ` ${s.suffix}` : ""}`.trim();
  };

  const handleSubmit = async (data: FormType) => {
    if (!issuance) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("sms_book_issuances")
        .update({
          date_returned: data.date_returned,
          condition_on_return: data.condition_on_return || null,
          return_code: data.return_code || null,
          remarks: data.remarks || null,
        })
        .eq("id", issuance.id);

      if (error) throw error;

      toast.success("Book return recorded successfully");
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to record return");
    } finally {
      setSubmitting(false);
    }
  };

  if (!issuance) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Record Book Return</DialogTitle>
          <DialogDescription>
            Record the return of a book issued to a student.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div className="font-medium">Student</div>
            <div className="text-muted-foreground">{getStudentName()}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div className="font-medium">Book</div>
            <div className="text-muted-foreground">
              {issuance.book?.title ?? "—"}
              {issuance.book?.subject_area && (
                <span className="ml-1">({issuance.book.subject_area})</span>
              )}
            </div>
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div className="font-medium">Date Issued</div>
            <div className="text-muted-foreground">
              {new Date(issuance.date_issued).toLocaleDateString()}
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="date_returned"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Date Returned <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input type="date" className="h-10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="condition_on_return"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condition on Return</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select condition" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CONDITION_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
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
              name="return_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Return Code (for unreturned/lost)</FormLabel>
                  <Select
                    onValueChange={(v) =>
                      field.onChange(v === "none" ? null : (v as BookReturnCode))
                    }
                    value={field.value ?? "none"}
                  >
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {RETURN_CODE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
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
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remarks</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Optional remarks"
                      className="h-10"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Record Return"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
