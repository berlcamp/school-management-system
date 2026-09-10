"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import {
  getGradeLevelLabel,
  getMapehComponent,
  COMM_COMPONENTS,
  getCommComponent,
  getCommComponentLabel,
  getMapehComponentLabel,
  getShsCategory,
  getSubjectProgram,
  getSubjectProgramDescription,
  GRADE_LEVELS,
  GRADE_LEVEL_MAX,
  GRADE_LEVEL_MIN,
  isSelectiveProgram,
  MAPEH_COMPONENTS,
  SUBJECT_PROGRAMS,
  getTleComponent,
  getTleComponentLabel,
  isShsGrade,
  SHS_SUBJECT_CATEGORIES,
  specializationLabel,
  TLE_COMPONENTS,
  UNITS_MAX,
  UNITS_MIN,
} from "@/lib/constants";
import { useSpecialPrograms } from "@/hooks/useSpecialPrograms";
import { Subject } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

type ItemType = Subject;
const table = "sms_subjects";
const title = "Subject";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: ItemType | null;
}

const FormSchema = z.object({
  code: z.string().min(1, "Subject code is required"),
  name: z.string().min(1, "Subject name is required"),
  description: z.string().optional(),
  grade_level: z.number().min(GRADE_LEVEL_MIN).max(GRADE_LEVEL_MAX),
  is_graded: z.boolean().default(true),
  program: z.enum(["regular", "madrasah", "als"]).default("regular"),
  // "none" rather than null: a Radix Select item cannot carry an empty value.
  // Mapped back to NULL on save (migration 153).
  mapeh_component: z
    .enum(["none", "music_arts", "pe_health"])
    .default("none"),
  // Same shape for EPP/TLE (migration 174). A subject belongs to at most one
  // learning area — the database makes that a CHECK, and picking one here
  // clears the other rather than letting the save be refused.
  tle_component: z
    .enum(["none", "ict", "afa", "fcs", "ia"])
    .default("none"),
  // Senior High only (migration 185). The two languages of one learning area,
  // the same shape as MAPEH and EPP/TLE above and under the same CHECK: a
  // subject belongs to at most one computed area.
  comm_component: z
    .enum(["none", "effective_communication", "mabisang_komunikasyon"])
    .default("none"),
  // Migration 185 — the SF9 Units column, as it prints: the units for the whole
  // school year, not per term. A string because the input is one; blank is a
  // legitimate answer and must not become 0.
  units: z
    .string()
    .default("")
    .refine(
      (value) => {
        const trimmed = value.trim();
        if (trimmed === "") return true;
        const parsed = Number(trimmed);
        return (
          /^\d+$/.test(trimmed) && parsed >= UNITS_MIN && parsed <= UNITS_MAX
        );
      },
      `Units must be a whole number from ${UNITS_MIN} to ${UNITS_MAX}, or left blank.`,
    ),
  // Migration 185 — the SF9 Core Subjects / Elective Subjects heading.
  shs_category: z.enum(["none", "core", "elective"]).default("none"),
  // Migration 179. "none" for the same Radix reason as the components above.
  // Orthogonal to `program`: an SPA subject is program 'regular' AND
  // special_program_id SPA. Both are mapped back to NULL on save.
  special_program_id: z.string().default("none"),
  specialization_id: z.string().default("none"),
  // Migration 179 — "this subject has a per-learner roster", and nothing else.
  // Independent of every field above it, including the two special-program
  // ones: a special-program subject may be taken by the whole section, and an
  // ordinary subject may carry a roster.
  selective_enrolment: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

type FormType = z.infer<typeof FormSchema>;

/**
 * One titled block of the form. The modal asks about five separate things —
 * the subject itself, its learning area, its Senior High card fields, its
 * special program and its roster — and ran them together as one column of
 * inputs, which is why it grew past the height of the screen without anyone
 * noticing that the footer had gone with it.
 */
function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t pt-5 first:border-t-0 first:pt-0">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set when a subject literally named after the learning area already exists
  // at this grade level. Tagging components alongside it would print the area
  // twice, so the save is held until the user accepts it — the "Save anyway"
  // shape migration 124 established for intentional schedule double-bookings.
  const [areaCollision, setAreaCollision] = useState<{
    area: string;
    gradeLabel: string;
  } | null>(null);
  const [acceptAreaCollision, setAcceptAreaCollision] = useState(false);
  const hasResetForEditRef = useRef<string | null>(null);

  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);
  const { selectable: selectablePrograms, strandsOf, programs } =
    useSpecialPrograms();

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      grade_level: 1,
      is_graded: true,
      program: "regular",
      mapeh_component: "none",
      tle_component: "none",
      comm_component: "none",
      units: "",
      shs_category: "none",
      special_program_id: "none",
      specialization_id: "none",
      selective_enrolment: false,
      is_active: true,
    },
  });

  // Reset form when modal opens or when teachers finish loading (for edit mode)
  useEffect(() => {
    if (!isOpen) {
      hasResetForEditRef.current = null;
      setAreaCollision(null);
      setAcceptAreaCollision(false);
      return;
    }

    // If editing, reset form with edit data
    if (editData?.id) {
      const editId = editData.id;
      if (hasResetForEditRef.current !== editId) {
        form.reset({
          code: editData.code || "",
          name: editData.name || "",
          description: editData.description || "",
          grade_level: editData.grade_level ?? GRADE_LEVEL_MIN,
          is_graded: editData.is_graded ?? true,
          program: getSubjectProgram(editData),
          // Normalised, so a row still carrying one of migration 153's four
          // values (music/arts/pe/health) opens on the component that
          // replaced it rather than on a choice the dropdown no longer has.
          mapeh_component: getMapehComponent(editData) ?? "none",
          tle_component: getTleComponent(editData) ?? "none",
          comm_component: getCommComponent(editData) ?? "none",
          units: editData.units != null ? String(editData.units) : "",
          shs_category: getShsCategory(editData) ?? "none",
          special_program_id: editData.special_program_id
            ? String(editData.special_program_id)
            : "none",
          specialization_id: editData.specialization_id
            ? String(editData.specialization_id)
            : "none",
          // Rows read before 179 is applied have no column; fall back to the
          // flag the roster question used to be asked of.
          selective_enrolment:
            editData.selective_enrolment ?? editData.is_madrasah ?? false,
          is_active: editData.is_active ?? true,
        });
        hasResetForEditRef.current = editId;
      }
    }
    // If not editing, reset to defaults immediately
    else if (!editData && hasResetForEditRef.current !== "add") {
      form.reset({
        code: "",
        name: "",
        description: "",
        grade_level: 1,
        is_graded: true,
        program: "regular",
        mapeh_component: "none",
        tle_component: "none",
        comm_component: "none",
        units: "",
        shs_category: "none",
        special_program_id: "none",
        specialization_id: "none",
        selective_enrolment: false,
        is_active: true,
      });
      hasResetForEditRef.current = "add";
    }
  }, [form, editData, isOpen]);

  const onSubmit = async (data: FormType) => {
    if (isSubmitting) return;

    const mapehComponent =
      data.mapeh_component === "none" ? null : data.mapeh_component;
    const tleComponent =
      data.tle_component === "none" ? null : data.tle_component;
    // Senior High only (migration 185); the fields below are not shown outside
    // Grades 11-12, so a subject moved down a grade drops them rather than
    // carrying a Units figure no form prints.
    const isShs = isShsGrade(data.grade_level);
    const commComponent =
      !isShs || data.comm_component === "none" ? null : data.comm_component;

    // Each folds the subject into a computed parent row, and two parents
    // cannot both own one grade (migration 185 widened 174's CHECK to all
    // three). The pickers clear each other, so this only catches a form
    // restored from stale state.
    if (
      [mapehComponent, tleComponent, commComponent].filter(Boolean).length > 1
    ) {
      toast.error(
        "A subject can belong to one learning area only — clear all but one component.",
      );
      return;
    }

    const areaComponent = mapehComponent ?? tleComponent ?? commComponent;
    const areaName = mapehComponent
      ? "MAPEH"
      : tleComponent
        ? "EPP/TLE"
        : "Effective Communication / Mabisang Komunikasyon";

    // A tagged component is folded into a computed parent row that DOES count
    // toward the general average; a Madrasah/ALS subject is deliberately left
    // out of it (migration 076). Tagging one as the other asks the card to
    // both include and exclude the same grade, so refuse rather than pick.
    if (areaComponent && isSelectiveProgram(data.program)) {
      toast.error(
        `A Madrasah or ALS subject cannot be a ${areaName} component — those programs are left out of the general average, while ${areaName} counts toward it. Set the program to Regular first.`,
      );
      return;
    }

    // Tagging components beside a subject already named after the learning
    // area would print it twice: once as that subject's own row, once as the
    // computed group. Warn, but let the school proceed — suppressing the
    // untagged row would hide grades a teacher actually encoded.
    if (areaComponent && !acceptAreaCollision) {
      // "EPP" in the primary grades, "TLE" from Grade 7 — a school names the
      // standalone subject whichever its grade level calls it.
      const collisionNames = mapehComponent
        ? ["mapeh"]
        : tleComponent
          ? ["tle", "epp"]
          : // The SHS parent has no short name a school would type as a
            // subject of its own, so there is nothing to collide with.
            [];
      let collisionFound = false;

      for (const areaLabel of collisionNames) {
        let collisionQuery = supabase
          .from(table)
          .select("name", { count: "exact" })
          .eq("grade_level", data.grade_level)
          .eq("is_active", true)
          .ilike("name", areaLabel)
          .is("mapeh_component", null)
          .is("tle_component", null)
          .is("comm_component", null);
        if (user?.school_id != null) {
          collisionQuery = collisionQuery.eq("school_id", user.school_id);
        }
        if (editData?.id) {
          collisionQuery = collisionQuery.neq("id", editData.id);
        }
        const { count: collisionCount } = await collisionQuery;
        if (collisionCount != null && collisionCount > 0) {
          collisionFound = true;
          break;
        }
      }

      if (collisionFound) {
        setAreaCollision({
          area: areaName,
          gradeLabel: getGradeLevelLabel(data.grade_level),
        });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const newData = {
        code: data.code.trim().toUpperCase(),
        name: data.name.trim(),
        description: data.description?.trim() || null,
        grade_level: data.grade_level,
        is_graded: data.is_graded,
        program: data.program,
        // Derived from program by migration 133's trigger; written here too so
        // the row is consistent without relying on it. Since migration 179
        // this means ONE thing: out of the general average.
        is_madrasah: isSelectiveProgram(data.program),
        // Migration 179 — the roster question, asked independently. Forced on
        // for Madrasah/ALS (the database has the same one-directional rule);
        // never the reverse, because ticking a roster on must not drop an
        // ordinary subject out of the general average.
        selective_enrolment:
          isSelectiveProgram(data.program) || data.selective_enrolment,
        // Migration 179 — the second axis. NULL for an ordinary subject.
        special_program_id:
          data.special_program_id === "none"
            ? null
            : Number(data.special_program_id),
        specialization_id:
          data.special_program_id === "none" ||
          data.specialization_id === "none"
            ? null
            : Number(data.specialization_id),
        // NULL = not part of MAPEH (migration 153)
        mapeh_component: mapehComponent,
        // NULL = not part of EPP/TLE (migration 174)
        tle_component: tleComponent,
        // Senior High SF9 (migration 185). All three are NULL outside Grades
        // 11-12, and NULL is what every K-10 subject keeps: the Units column
        // and the Core/Elective headings exist only on the SHS form.
        comm_component: commComponent,
        units: isShs && data.units.trim() !== "" ? Number(data.units) : null,
        shs_category:
          isShs && data.shs_category !== "none" ? data.shs_category : null,
        is_active: data.is_active,
        ...(user?.school_id != null && { school_id: user.school_id }),
      };

      if (editData?.id) {
        // ALS subjects are scheduled in ALS sections and nowhere else
        // (migration 136), so crossing that line would leave every schedule
        // this subject already has in the wrong kind of section.
        const wasAls = getSubjectProgram(editData) === "als";
        const isAls = data.program === "als";
        if (wasAls !== isAls) {
          let alsCheckQuery = supabase
            .from("sms_subject_schedules")
            .select("*", { count: "exact", head: true })
            .eq("subject_id", editData.id);
          if (user?.school_id != null) {
            alsCheckQuery = alsCheckQuery.eq("school_id", user.school_id);
          }
          const { count: alsScheduleCount } = await alsCheckQuery;

          if (alsScheduleCount != null && alsScheduleCount > 0) {
            toast.error(
              isAls
                ? "Cannot switch this subject to ALS because it is already scheduled in non-ALS sections. Remove the schedules first."
                : "Cannot switch this subject away from ALS because it is already scheduled in ALS sections. Remove the schedules first.",
            );
            setIsSubmitting(false);
            return;
          }
        }

        // Prevent grade_level change if subject is already linked to schedules
        if (editData.grade_level !== data.grade_level) {
          let scheduleCheckQuery = supabase
            .from("sms_subject_schedules")
            .select("*", { count: "exact", head: true })
            .eq("subject_id", editData.id);
          if (user?.school_id != null) {
            scheduleCheckQuery = scheduleCheckQuery.eq(
              "school_id",
              user.school_id,
            );
          }
          const { count: scheduleCount } = await scheduleCheckQuery;

          if (scheduleCount != null && scheduleCount > 0) {
            toast.error(
              "Cannot change grade level because this subject is already assigned to schedules. Remove the schedules first.",
            );
            setIsSubmitting(false);
            return;
          }
        }

        let updateQuery = supabase
          .from(table)
          .update(newData)
          .eq("id", editData.id);
        if (user?.school_id != null) {
          updateQuery = updateQuery.eq("school_id", user.school_id);
        }
        const { error } = await updateQuery;

        if (error) throw new Error(error.message);

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
        toast.success("Subject updated successfully!");
      } else {
        const { data: inserted, error } = await supabase
          .from(table)
          .insert([newData])
          .select()
          .single();

        if (error) {
          if (error.code === "23505") {
            toast.error("Subject code already exists in this school");
            setIsSubmitting(false);
            return;
          }
          throw new Error(error.message);
        }

        if (inserted) {
          dispatch(addItem(inserted));
        }
        onClose();
        toast.success("Subject added successfully!");
      }
    } catch (err) {
      console.error("Submission error:", err);
      toast.error(err instanceof Error ? err.message : "Error saving subject");
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
      {/* A Senior High subject asks about five blocks of fields, which ran off
          the bottom of the screen — taking the Save button with it, on a
          dialog that had no scroll of its own. The header and footer are
          pinned and only the middle scrolls, so the buttons are reachable at
          any height. `min-h-0` on the flex children is what actually lets the
          middle shrink; without it a flex item refuses to go below its
          content and the overflow never engages. */}
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-[640px]">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle className="text-xl font-semibold">
            {editData ? "Edit" : "Add"} {title}
          </DialogTitle>
          <DialogDescription>
            {editData
              ? "Update subject information below."
              : "Fill in the details to add a new subject."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <FormSection title="Subject details">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Subject Code <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., MATH-101"
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
                          {GRADE_LEVELS.map((level) => (
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

                <FormField
                  control={form.control}
                  name="is_graded"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Grading
                      </FormLabel>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(value === "graded")
                        }
                        value={field.value ? "graded" : "no_graded"}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select grading type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="graded">Graded</SelectItem>
                          <SelectItem value="no_graded">
                            Not graded
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="program"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Curriculum Program
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select program type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SUBJECT_PROGRAMS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isSelectiveProgram(field.value) && (
                        <p className="text-xs text-muted-foreground">
                          {getSubjectProgramDescription(field.value)} — only
                          learners you add to this subject take it, and it is left
                          out of the general average.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Subject Name <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Mathematics"
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
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Description
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter subject description (optional)"
                        className="min-h-[80px]"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            {/* The two K-10 learning areas. Senior High has neither, so the
                pickers are hidden there rather than offering a choice that
                cannot apply — unless the row already carries one, which must
                stay visible to be cleared. */}
            {(!isShsGrade(form.watch("grade_level")) ||
              form.watch("mapeh_component") !== "none" ||
              form.watch("tle_component") !== "none") && (
              <FormSection
                title="Learning area"
                hint="Tag a subject that prints indented under one computed row on the report card and SF9, counting once toward the general average."
              >
              <FormField
                control={form.control}
                name="mapeh_component"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      MAPEH Component
                    </FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        // A subject belongs to one learning area only, so
                        // picking MAPEH clears EPP/TLE rather than letting the
                        // database refuse the save (migration 174's CHECK).
                        if (value !== "none") {
                          form.setValue("tle_component", "none");
                          form.setValue("comm_component", "none");
                        }
                        // A different choice is a different question; make the
                        // school re-accept any duplicate-area warning.
                        setAreaCollision(null);
                        setAcceptAreaCollision(false);
                      }}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Not part of MAPEH</SelectItem>
                        {MAPEH_COMPONENTS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.value !== "none" && (
                      <p className="text-xs text-muted-foreground">
                        Prints as {getMapehComponentLabel(field.value)} indented
                        under a MAPEH row on the report card and SF9. MAPEH is
                        averaged from its components and counts once toward the
                        general average, not once per component.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tle_component"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      EPP / TLE Component
                    </FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value !== "none") {
                          form.setValue("mapeh_component", "none");
                          form.setValue("comm_component", "none");
                        }
                        setAreaCollision(null);
                        setAcceptAreaCollision(false);
                      }}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Not part of EPP / TLE</SelectItem>
                        {TLE_COMPONENTS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.value !== "none" && (
                      <p className="text-xs text-muted-foreground">
                        Prints as {getTleComponentLabel(field.value)} indented
                        under one EPP row (Grades 1-6) or TLE row (Grades 7-10) on
                        the report card and SF9, counting once toward the general
                        average.{" "}
                        {field.value === "ict"
                          ? "ICT runs across all three terms and carries 25% of the term grade."
                          : "The specialisation carries 75% of the term grade, alongside ICT."}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              </FormSection>
            )}

            {/* ================================================================
                SENIOR HIGH SF9 (migration 185) — Grades 11-12 only.
                The issued SF9 - GRADE 11 / 12 sheets carry a Units column and
                group the learning areas under Core Subjects / Elective
                Subjects. Both are printed, never computed from: units are
                reported beside the grades and are NOT weights, and the General
                Average stays the plain mean of the finals that count.
               ================================================================ */}
            {isShsGrade(form.watch("grade_level")) && (
              <FormSection
                title="Senior High report card"
                hint="Printed on the SF9 for Grades 11-12: the Units column, the Core / Elective heading, and the two halves of Effective Communication / Mabisang Komunikasyon."
              >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="units"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel className="text-sm font-medium">
                            Units
                          </FormLabel>
                          <FormControl>
                            <Input
                              inputMode="numeric"
                              placeholder="e.g., 6"
                              className="h-10"
                              {...field}
                              disabled={isSubmitting}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            The units for the whole school year, exactly as they
                            print on the SF9 — a core subject taken all three
                            terms is 6 (2 per term), a one-term academic elective
                            is 3. Leave blank to print an empty cell.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="shs_category"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel className="text-sm font-medium">
                            SF9 Grouping
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
                              <SelectItem value="none">No heading</SelectItem>
                              {SHS_SUBJECT_CATEGORIES.map((c) => (
                                <SelectItem key={c.value} value={c.value}>
                                  {c.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {SHS_SUBJECT_CATEGORIES.find(
                              (c) => c.value === field.value,
                            )?.hint ??
                              "Printed with the other untagged subjects, under no heading."}
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="comm_component"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          Communication Component
                        </FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            // One learning area per subject, per the CHECK
                            // migration 185 widened to three components.
                            if (value !== "none") {
                              form.setValue("mapeh_component", "none");
                              form.setValue("tle_component", "none");
                            }
                          }}
                          value={field.value}
                          disabled={isSubmitting}
                        >
                          <FormControl>
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">
                              Not part of Effective Communication / Mabisang
                              Komunikasyon
                            </SelectItem>
                            {COMM_COMPONENTS.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {field.value !== "none" && (
                          <p className="text-xs text-muted-foreground">
                            Prints as{" "}
                            {getCommComponentLabel(field.value)} indented under
                            one Effective Communication / Mabisang Komunikasyon
                            row, averaged from whichever halves are encoded and
                            counting once toward the general average. Put the
                            learning area&rsquo;s units on this row; the two
                            components are added together.
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
              </FormSection>
            )}

            {/* ================================================================
                SPECIAL PROGRAM — a SECOND axis (migration 179).
                Orthogonal to Curriculum Program above: an SPA Music subject is
                Curriculum Program "Regular" AND Special Program "SPA". The two
                are never the same field, and neither implies selective
                enrolment.
               ================================================================ */}
            <FormSection
              title="Special program"
              hint="A second axis, not a curriculum program: an SPA Music subject is Curriculum Program &ldquo;Regular&rdquo; AND Special Program &ldquo;SPA&rdquo;."
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="special_program_id"
                  render={({ field }) => (
                    // min-w-0: a grid item defaults to min-width:auto, so without
                    // it a long program name widens the track instead of being
                    // clamped, and pushes the next column off its own.
                    <FormItem className="min-w-0">
                      <FormLabel className="text-sm font-medium">
                        Special Program
                      </FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          // A strand belongs to exactly one program, so changing
                          // the program can only invalidate it. The database
                          // refuses the mismatch either way (migration 179).
                          form.setValue("specialization_id", "none");
                        }}
                        value={field.value}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          {/* w-full because the shared SelectTrigger is w-fit:
                              fine for "Regular", not for a full program name. */}
                          <SelectTrigger className="h-10 w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {selectablePrograms.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.name}
                              {p.school_id == null ? " (division)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectablePrograms.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No special programs yet — add them in School Settings
                          &rarr; Special Programs.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="specialization_id"
                  render={({ field }) => {
                    const programId = form.watch("special_program_id");
                    const strands =
                      programId === "none" ? [] : strandsOf(programId);
                    const program = programs.find(
                      (p) => String(p.id) === programId,
                    );
                    return (
                      <FormItem className="min-w-0">
                        <FormLabel className="text-sm font-medium">
                          {specializationLabel(program)}
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={
                            isSubmitting ||
                            programId === "none" ||
                            strands.length === 0
                          }
                        >
                          <FormControl>
                            <SelectTrigger className="h-10 w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">
                              {programId === "none"
                                ? "Select a special program first"
                                : "Whole program (no strand)"}
                            </SelectItem>
                            {strands.map((strand) => (
                              <SelectItem key={strand.id} value={String(strand.id)}>
                                {strand.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {programId !== "none" && strands.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            This program has no{" "}
                            {specializationLabel(program).toLowerCase()} defined.
                            Subjects tagged to it belong to the whole program.
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>

            </FormSection>

            {/* ================================================================
                SELECTIVE ENROLMENT — generic, and independent of everything.
                Not "the Madrasah flag", not "the TLE flag": it asks only
                whether this subject keeps a per-learner roster.
               ================================================================ */}
            <FormSection title="Enrollment">
              <FormField
                control={form.control}
                name="selective_enrolment"
                render={({ field }) => {
                  // Madrasah and ALS are selectively enrolled by definition, so
                  // the box is checked and locked for them — the database
                  // enforces the same one-directional rule. The reverse never
                  // holds: ticking this on a Regular subject leaves it a Regular
                  // subject, fully inside the general average.
                  const forced = isSelectiveProgram(form.watch("program"));
                  return (
                    <FormItem>
                      <label className="flex items-start gap-2">
                        <FormControl>
                          <Checkbox
                            className="mt-0.5"
                            checked={forced || field.value}
                            onChange={(e) => field.onChange(e.target.checked)}
                            disabled={isSubmitting || forced}
                          />
                        </FormControl>
                        <span className="text-sm">
                          <span className="font-medium">Selective enrollment</span>
                          <span className="block text-xs text-muted-foreground">
                            Only learners assigned to this subject take it, rather
                            than everyone in the section. Assign them from Sections
                            &rarr; Manage Schedules &rarr; Manage Students.
                            {forced
                              ? " Required for Madrasah and ALS subjects."
                              : " This does not affect the general average."}
                          </span>
                        </span>
                      </label>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {areaCollision && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                  <p className="text-xs text-amber-900">
                    A subject named <strong>{areaCollision.area}</strong> already
                    exists for {areaCollision.gradeLabel}. Tagging components as
                    well will print {areaCollision.area} twice on the card — once
                    as that subject&apos;s own row, and once as the group computed
                    from its components.
                  </p>
                  <label className="flex items-start gap-2 text-xs text-amber-900">
                    <Checkbox
                      className="mt-0.5"
                      checked={acceptAreaCollision}
                      onChange={(e) => setAcceptAreaCollision(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    <span>Save anyway — I know both rows will appear.</span>
                  </label>
                </div>
              )}
            </FormSection>
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:gap-2 space-x-2">
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
