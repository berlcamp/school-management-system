"use client";

import { Badge } from "@/components/ui/badge";
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
import { GRADE_LEVELS, getGradeLevelLabel } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getSchoolYearOptions } from "@/lib/utils/schoolYear";
import { getMasteryLevel } from "@/lib/utils/mps";
import { MPSEntry } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
}

interface SubjectOption {
  id: string;
  name: string;
  grade_level: number;
}

interface EditMpsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData: MPSEntry | null;
  sectionOptions: SectionOption[];
  subjectOptions: SubjectOption[];
  defaultSchoolYear: string;
}

const FormSchema = z.object({
  school_year: z.string().min(1, "School year is required"),
  grade_level: z.string().min(1, "Grade level is required"),
  subject_id: z.string().min(1, "Subject is required"),
  section_id: z.string().min(1, "Section is required"),
  grading_period: z.string().min(1, "Quarter is required"),
  mps: z
    .string()
    .min(1, "MPS is required")
    .refine(
      (v) => {
        const n = parseFloat(v);
        return !Number.isNaN(n) && n >= 0 && n <= 100;
      },
      { message: "MPS must be between 0 and 100" }
    ),
});

type FormType = z.infer<typeof FormSchema>;

export function EditMpsModal({
  isOpen,
  onClose,
  onSaved,
  editData,
  sectionOptions,
  subjectOptions,
  defaultSchoolYear,
}: EditMpsModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const user = useAppSelector((state) => state.user.user);
  const schoolYearOptions = getSchoolYearOptions();

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      school_year: defaultSchoolYear,
      grade_level: "",
      subject_id: "",
      section_id: "",
      grading_period: "1",
      mps: "",
    },
  });

  const watchedGradeLevel = form.watch("grade_level");
  const watchedMps = form.watch("mps");

  const filteredSections = useMemo(
    () =>
      watchedGradeLevel
        ? sectionOptions.filter(
            (s) => s.grade_level === Number(watchedGradeLevel)
          )
        : sectionOptions,
    [sectionOptions, watchedGradeLevel]
  );

  const filteredSubjects = useMemo(
    () =>
      watchedGradeLevel
        ? subjectOptions.filter(
            (s) => s.grade_level === Number(watchedGradeLevel)
          )
        : subjectOptions,
    [subjectOptions, watchedGradeLevel]
  );

  const masteryPreview = useMemo(() => {
    if (!watchedMps) return null;
    const n = parseFloat(watchedMps);
    if (Number.isNaN(n) || n < 0 || n > 100) return null;
    return getMasteryLevel(n);
  }, [watchedMps]);

  useEffect(() => {
    if (!isOpen) return;
    if (editData) {
      form.reset({
        school_year: editData.school_year,
        grade_level: String(editData.grade_level),
        subject_id: String(editData.subject_id),
        section_id: String(editData.section_id),
        grading_period: String(editData.grading_period),
        mps: String(editData.mps),
      });
    } else {
      form.reset({
        school_year: defaultSchoolYear,
        grade_level: "",
        subject_id: "",
        section_id: "",
        grading_period: "1",
        mps: "",
      });
    }
  }, [editData, isOpen, defaultSchoolYear, form]);

  const onSubmit = async (data: FormType) => {
    if (submitting) return;
    if (user?.school_id == null) {
      toast.error("No school associated with your account");
      return;
    }
    const section = sectionOptions.find((s) => s.id === data.section_id);
    if (!section) {
      toast.error("Selected section is not available");
      return;
    }

    setSubmitting(true);
    try {
      const row = {
        school_id: Number(user.school_id),
        subject_id: Number(data.subject_id),
        section_id: Number(data.section_id),
        grade_level: section.grade_level,
        school_year: data.school_year,
        grading_period: Number(data.grading_period),
        mps: parseFloat(data.mps),
        teacher_id: user.system_user_id ?? null,
      };

      if (editData?.id) {
        const { error } = await supabase
          .from("sms_mps")
          .update(row)
          .eq("id", editData.id);
        if (error) throw error;
        toast.success("MPS updated");
      } else {
        const { error } = await supabase
          .from("sms_mps")
          .upsert([row], {
            onConflict: "subject_id,section_id,grading_period,school_year",
          });
        if (error) throw error;
        toast.success("MPS saved");
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error("Error saving MPS:", err);
      const msg = err instanceof Error ? err.message : "Failed to save MPS";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{editData ? "Edit MPS" : "Add MPS"}</DialogTitle>
          <DialogDescription>
            One MPS row per Subject + Section + Quarter + School Year. Saving a
            combination that already exists will overwrite it.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Scope section */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Scope
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="school_year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        School Year <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={submitting}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select year" />
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

                <FormField
                  control={form.control}
                  name="grade_level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Grade Level <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={(v) => {
                          field.onChange(v);
                          // Cascade: reset dependent fields when grade changes
                          form.setValue("section_id", "");
                          form.setValue("subject_id", "");
                        }}
                        value={field.value}
                        disabled={submitting}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select grade" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {GRADE_LEVELS.map((lvl) => (
                            <SelectItem key={lvl} value={String(lvl)}>
                              {getGradeLevelLabel(lvl)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="section_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Section <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={submitting || !watchedGradeLevel}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                watchedGradeLevel
                                  ? "Select section"
                                  : "Select grade first"
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredSections.length === 0 ? (
                            <SelectItem value="none" disabled>
                              No sections in this grade
                            </SelectItem>
                          ) : (
                            filteredSections.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subject_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Subject <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={submitting || !watchedGradeLevel}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                watchedGradeLevel
                                  ? "Select subject"
                                  : "Select grade first"
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredSubjects.length === 0 ? (
                            <SelectItem value="none" disabled>
                              No subjects in this grade
                            </SelectItem>
                          ) : (
                            filteredSubjects.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Score section */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Score
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="grading_period"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Quarter <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={submitting}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Quarter" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[1, 2, 3, 4].map((q) => (
                            <SelectItem key={q} value={String(q)}>
                              Quarter {q}
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
                  name="mps"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        MPS <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="0 – 100"
                          {...field}
                          disabled={submitting}
                        />
                      </FormControl>
                      <div className="min-h-[22px] mt-1">
                        {masteryPreview && (
                          <Badge
                            variant="outline"
                            className={`${masteryPreview.colorClass} border`}
                          >
                            {masteryPreview.label}
                          </Badge>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

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
                {submitting ? "Saving..." : editData ? "Update" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
