"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { ARAL_PROGRAMS, getGradeLevelLabel } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import type { AralProgram } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  schoolId: string | number;
  onSaved: () => void;
}

const FormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  program: z.enum(["reading", "mathematics", "science", "summer"]),
  grade_level: z.string().min(1, "Grade level is required"),
});

type FormType = z.infer<typeof FormSchema>;

export function AddTutorModal({ isOpen, onClose, schoolId, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: { name: "", email: "", program: "reading", grade_level: "" },
  });

  const program = form.watch("program");
  const gradeOptions = useMemo(
    () => ARAL_PROGRAMS.find((p) => p.value === program)?.grades ?? [],
    [program],
  );

  useEffect(() => {
    if (isOpen) {
      form.reset({ name: "", email: "", program: "reading", grade_level: "" });
    }
  }, [isOpen, form]);

  // Clear a grade that no longer belongs to the selected program.
  useEffect(() => {
    const current = form.getValues("grade_level");
    if (current && !gradeOptions.includes(Number(current))) {
      form.setValue("grade_level", "");
    }
  }, [program, gradeOptions, form]);

  const onSubmit = async (data: FormType) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const email = data.email.trim().toLowerCase();

      // Reuse an existing sms_users row (by email) or create a tutor login row.
      let userId: number;
      const { data: existing } = await supabase
        .from("sms_users")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (existing?.id) {
        userId = Number(existing.id);
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("sms_users")
          .insert([
            {
              name: data.name.trim(),
              email,
              type: "tutor",
              school_id: String(schoolId),
              is_active: true,
            },
          ])
          .select("id")
          .single();
        if (insErr) throw new Error(insErr.message);
        userId = Number(inserted.id);
      }

      const { error: assignErr } = await supabase
        .from("sms_aral_tutors")
        .insert([
          {
            user_id: userId,
            school_id: Number(schoolId),
            program: data.program as AralProgram,
            grade_level: Number(data.grade_level),
          },
        ]);
      if (assignErr) {
        if (assignErr.code === "23505") {
          toast.error("This tutor is already assigned to that grade level.");
          return;
        }
        throw new Error(assignErr.message);
      }

      toast.success("Tutor added.");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add tutor.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Tutor</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Tutor's full name" {...field} />
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
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="tutor@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="program"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ARAL Program</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ARAL_PROGRAMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
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
              name="grade_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grade Level</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select grade level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {gradeOptions.map((g) => (
                        <SelectItem key={g} value={String(g)}>
                          {getGradeLevelLabel(g)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                {submitting && (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                )}
                Add Tutor
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
