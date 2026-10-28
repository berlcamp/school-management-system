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
import { useScheduleScope } from "@/hooks/useScheduleScope";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { ALS_SECTION_TYPE, isAlsSectionType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  blocksOverlap,
  checkScheduleConflicts,
  describeBlock,
  parseDbConflictError,
  type ScheduleConflictLookups,
  type TimeBlock,
} from "@/lib/utils/scheduleConflicts";
import { pickGradeLevelCoordinatorScheduleUpdate } from "@/lib/utils/scheduleEditScope";
import {
  encodedConflictMessage,
  fetchEncodedPeriods,
  handoverGuardPeriods,
  periodsKeptByOtherRows,
  pinHandoverRows,
  planHandover,
  runHandover,
  schedulePeriodLabels,
} from "@/lib/utils/scheduleHandover";
import { normaliseScheduleTerms, scheduleTermOptions } from "@/lib/utils/scheduleTerms";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import {
  fetchAssignableStaff,
  FORMER_STAFF_LABEL,
  type StaffOption,
} from "@/lib/utils/staff";
import { RootState, SubjectSchedule } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { z } from "zod";
import type { ScheduleHandover } from "./ChangeFromDialog";

type ItemType = SubjectSchedule;
const table = "sms_subject_schedules";
const title = "Schedule";

/**
 * Sentinel for the "no teacher" option. Radix Select rejects "" as an item
 * value, so the empty choice needs a stand-in. Saved as NULL — see migration 117.
 */
const NO_TEACHER = "none";

/**
 * A schedule with no teacher is "Temporary". It is still checked for room
 * clashes; only the teacher and section checks fall away.
 */
const hasTeacher = (teacherId: string | undefined): boolean =>
  !!teacherId && teacherId !== NO_TEACHER;

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: ItemType | null;
  /** Pre-fill section when adding (e.g. from View Subjects modal) */
  initialSectionId?: string;
  /** Pre-fill school year when adding */
  initialSchoolYear?: string;
  /** Pre-fill and lock subject when adding from View Subjects modal */
  initialSubjectId?: string;
  /** Display label for locked subject (e.g. "MATH 101 - Algebra") */
  initialSubjectLabel?: string;
  /** When true, subject field is read-only (used with initialSubjectId) */
  subjectLocked?: boolean;
  /** When provided, fetch schedules for this year for conflict check instead of using Redux */
  conflictCheckSchoolYear?: string;
  /** Called after successful add/update before closing */
  onSuccess?: () => void;
  /** When true, do not dispatch to Redux (e.g. when opened from sections page) */
  skipReduxUpdate?: boolean;
  /**
   * "Change from…" (migration 222): add the new teacher's rows for the periods
   * from `fromPeriod` on and narrow `sources` to the periods before it.
   */
  handover?: ScheduleHandover | null;
}

const TIME_PATTERN = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * One set of days sharing one time span — "Mon, Wed 8:00–9:00".
 *
 * A subject rarely meets at the same hour all week: the same class may sit
 * 8–9am on Mon/Wed and 2–3pm on Fri. Each block is saved as its own
 * sms_subject_schedules row, which is the shape the rest of the system already
 * reads — the calendar filters row by row, and teaching load / SF7 sum row by
 * row, so two blocks total correctly without any schema change.
 */
const BlockSchema: z.ZodType<TimeBlock> = z
  .object({
    days_of_week: z
      .array(z.number())
      .min(1, "At least one day must be selected"),
    start_time: z.string().regex(TIME_PATTERN, "Invalid time format (HH:mm)"),
    end_time: z.string().regex(TIME_PATTERN, "Invalid time format (HH:mm)"),
  })
  .refine(
    (block) => toMinutes(block.end_time) > toMinutes(block.start_time),
    {
      message: "End time must be after start time",
      path: ["end_time"],
    },
  );

const FormSchema = z.object({
  subject_id: z.string().min(1, "Subject is required"),
  section_id: z.string().min(1, "Section is required"),
  // Optional: a schedule may be created before a teacher is assigned
  teacher_id: z.string(),
  room_id: z.string().min(1, "Room is required"),
  blocks: z.array(BlockSchema).min(1, "At least one time block is required"),
  school_year: z.string().min(1, "School year is required"),
  // Ticked terms; [] = the whole school year (migration 222)
  grading_periods: z.array(z.number()),
});

type FormType = z.infer<typeof FormSchema>;

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

const DAYS = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

const EMPTY_BLOCK: TimeBlock = {
  days_of_week: [],
  start_time: "08:00",
  end_time: "09:00",
};

/**
 * form.watch() hands back a deep-partial (a block may be half-typed, days may
 * hold holes) while form.getValues() hands back the full FormType. The conflict
 * check accepts both and keeps only the blocks that are complete enough to
 * compare.
 */
type LooseValues = {
  subject_id?: string;
  section_id?: string;
  teacher_id?: string;
  room_id?: string;
  school_year?: string;
  grading_periods?: (number | undefined)[];
  blocks?: Array<
    | {
        days_of_week?: (number | undefined)[];
        start_time?: string;
        end_time?: string;
      }
    | undefined
  >;
};

const completeBlocks = (blocks: LooseValues["blocks"]): TimeBlock[] =>
  (blocks ?? []).flatMap((block) => {
    const days = (block?.days_of_week ?? []).filter(
      (day): day is number => day !== undefined,
    );
    if (days.length === 0 || !block?.start_time || !block?.end_time) return [];
    return [
      {
        days_of_week: days,
        start_time: block.start_time,
        end_time: block.end_time,
      },
    ];
  });

/**
 * Day toggles for one block. Pills rather than a checkbox grid: a schedule may
 * now hold several blocks stacked in the same modal, and seven labelled
 * checkboxes per block pushes everything else off the screen.
 */
const DayPicker = ({
  value,
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
}) => (
  <div className="flex flex-wrap gap-1.5">
    {DAYS.map((day) => {
      const selected = value.includes(day.value);
      return (
        <button
          key={day.value}
          type="button"
          disabled={disabled}
          aria-pressed={selected}
          aria-label={day.label}
          onClick={() =>
            onChange(
              selected
                ? value.filter((d) => d !== day.value)
                : [...value, day.value].sort((a, b) => a - b),
            )
          }
          className={cn(
            "h-8 rounded-full border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          {day.short}
        </button>
      );
    })}
  </div>
);

export const AddModal = ({
  isOpen,
  onClose,
  editData,
  initialSectionId,
  initialSchoolYear,
  initialSubjectId,
  initialSubjectLabel,
  subjectLocked,
  conflictCheckSchoolYear,
  onSuccess,
  skipReduxUpdate,
  handover,
}: ModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflictCheckSchedules, setConflictCheckSchedules] = useState<
    SubjectSchedule[]
  >([]);
  const [subjects, setSubjects] = useState<
    Array<{
      id: string;
      name: string;
      code: string;
      grade_level: number;
      program: string | null;
    }>
  >([]);
  const [sections, setSections] = useState<
    Array<{
      id: string;
      name: string;
      grade_level: number;
      section_type: string | null;
      shs_curriculum: string | null;
    }>
  >([]);
  const [teachers, setTeachers] = useState<StaffOption[]>([]);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  /**
   * Encoder ticked "Create anyway" on the conflict warning. Schools do run
   * combined classes — two grade levels in one room under one teacher — so a
   * detected clash is a warning, not a wall. Persisted as conflict_override so
   * the DB trigger lets the row through; see migration 124.
   */
  const [overrideConflicts, setOverrideConflicts] = useState(false);
  /** Blocks of THIS schedule colliding with each other — never overridable */
  const [blockOverlaps, setBlockOverlaps] = useState<string[]>([]);
  const hasResetForEditRef = useRef<string | null>(null);

  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);
  const allSchedules = useSelector(
    (state: RootState) => state.list.value,
  ) as SubjectSchedule[];

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      subject_id: "",
      section_id: "",
      teacher_id: NO_TEACHER,
      room_id: "",
      blocks: [EMPTY_BLOCK],
      grading_periods: [],
      school_year: getCurrentSchoolYear(),
    },
  });

  const {
    fields: blockFields,
    append: appendBlock,
    remove: removeBlock,
  } = useFieldArray({ control: form.control, name: "blocks" });

  const blockValues = form.watch("blocks") ?? [];

  /**
   * Migration 216 scope. A roster role is always "full" (unchanged). A
   * Department Head-only user adds and edits schedules of the subjects they
   * head; a Grade Level Coordinator-only row edits the teacher and nothing
   * else ("teacher_only"); anything else opens read-only.
   */
  const scope = useScheduleScope();
  const editGradeLevel = editData
    ? sections.find((s) => String(s.id) === String(editData.section_id))
        ?.grade_level
    : undefined;
  const handoverSource = !editData ? (handover?.sources[0] ?? null) : null;
  const editMode = editData
    ? scope.modeFor(editData.subject_id, editGradeLevel)
    : scope.canAdd(handoverSource?.subject_id ?? initialSubjectId)
      ? "full"
      : "none";
  const teacherOnly = editMode === "teacher_only";
  const readOnly = editMode === "none";
  /** Every field except Teacher is locked */
  const lockOthers = teacherOnly || readOnly;
  /** The subject picker offers only the subjects the Department Head heads */
  const restrictSubjects = scope.designeeOnly && editMode === "full";
  const headsSubject = scope.headsSubject;

  /**
   * An ALS section takes ALS subjects and nothing else, and an ALS subject is
   * scheduled nowhere else (migration 136), so the section chosen decides which
   * subjects are on offer. Before a section is picked the full list stands.
   */
  const selectedSectionId = form.watch("section_id");
  const selectedSection = useMemo(
    () => sections.find((s) => String(s.id) === selectedSectionId) ?? null,
    [sections, selectedSectionId],
  );
  // The section's own periods (three terms, or four quarters / SHS semester
  // pairs). Memoised: it is a dependency of the conflict check below.
  const watchedSchoolYear = form.watch("school_year");
  const selectedShsCurriculum = selectedSection?.shs_curriculum;
  // Old-curriculum SHS picks a semester (periods 1-2 / 3-4); the rest pick
  // terms or quarters (migration 222). Values stay grading periods.
  const termOptions = useMemo(
    () =>
      scheduleTermOptions(
        watchedSchoolYear || getCurrentSchoolYear(),
        selectedShsCurriculum,
      ),
    [watchedSchoolYear, selectedShsCurriculum],
  );
  const sectionPeriods = useMemo(
    () => termOptions.flatMap((o) => o.periods),
    [termOptions],
  );
  const termsFor = useCallback(
    (values: { grading_periods?: (number | undefined)[] }) =>
      normaliseScheduleTerms(
        (values.grading_periods ?? []).filter((p): p is number => p != null),
        sectionPeriods,
      ),
    [sectionPeriods],
  );
  // A section change can leave ticked periods the new section does not have.
  // Waits for the section to load: until then the periods are the school
  // year's default, and an old-SHS row's period 4 would be stripped.
  useEffect(() => {
    if (!selectedSection) return;
    const picked = (form.getValues("grading_periods") ?? []).filter(
      (p): p is number => p != null,
    );
    const valid = picked.filter((p) => sectionPeriods.includes(p));
    if (valid.length !== picked.length) form.setValue("grading_periods", valid);
  }, [sectionPeriods, form, selectedSection]);
  const visibleSubjects = useMemo(() => {
    const scoped = restrictSubjects
      ? subjects.filter((subject) => headsSubject(subject.id))
      : subjects;
    if (!selectedSection) return scoped;
    const wantsAls = isAlsSectionType(selectedSection.section_type);
    return scoped.filter(
      (subject) => (subject.program === ALS_SECTION_TYPE) === wantsAls,
    );
  }, [subjects, selectedSection, restrictSubjects, headsSubject]);

  // Switching to a section of the other kind strands whatever subject was
  // already picked, so it is cleared rather than silently submitted.
  useEffect(() => {
    const current = form.getValues("subject_id");
    if (!current || !selectedSectionId || subjects.length === 0) return;
    if (!visibleSubjects.some((s) => String(s.id) === current)) {
      form.setValue("subject_id", "");
    }
  }, [form, visibleSubjects, selectedSectionId, subjects.length]);

  // Fetch ALL schedules for conflict check (avoids filtered Redux list).
  // Uses conflictCheckSchoolYear when provided (e.g. ViewSubjectsModal), else form's school_year.
  const formSchoolYear = form.watch("school_year");
  const targetSchoolYear =
    conflictCheckSchoolYear ?? formSchoolYear ?? getCurrentSchoolYear();

  useEffect(() => {
    if (!isOpen || !targetSchoolYear?.trim()) {
      setConflictCheckSchedules([]);
      return;
    }

    const fetchSchedules = async () => {
      let query = supabase
        .from("sms_subject_schedules")
        .select("*")
        .eq("school_year", targetSchoolYear.trim());
      if (user?.school_id != null) {
        query = query.eq("school_id", user.school_id);
      }
      const { data } = await query;
      setConflictCheckSchedules(data || []);
    };

    fetchSchedules();
  }, [isOpen, targetSchoolYear, user?.school_id]);

  // Fetch dropdown data
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      // Fetch subjects (school-scoped)
      let subjectsQuery = supabase
        .from("sms_subjects")
        .select("id, name, code, grade_level, program")
        .eq("is_active", true)
        .order("code");
      if (user?.school_id != null) {
        subjectsQuery = subjectsQuery.eq("school_id", user.school_id);
      }
      const { data: subjectsData } = await subjectsQuery;
      if (subjectsData) {
        setSubjects(subjectsData);
      }

      // Fetch sections (school-scoped)
      let sectionsQuery = supabase
        .from("sms_sections")
        .select("id, name, grade_level, section_type, shs_curriculum")
        .eq("is_active", true)
        .order("name");
      if (user?.school_id != null) {
        sectionsQuery = sectionsQuery.eq("school_id", user.school_id);
      }
      const { data: sectionsData } = await sectionsQuery;
      if (sectionsData) {
        setSections(sectionsData);
      }

      // Fetch teachers (school-scoped; all users except division_admin/
      // division_type can be assigned as subject teachers). The row's own
      // teacher is added even after they move schools, so an edit shows who is
      // on it instead of an empty box over a live value.
      setTeachers(
        await fetchAssignableStaff(
          user?.school_id,
          editData?.teacher_id ?? handoverSource?.teacher_id,
        ),
      );

      // Fetch rooms (school-scoped)
      let roomsQuery = supabase
        .from("sms_rooms")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (user?.school_id != null) {
        roomsQuery = roomsQuery.eq("school_id", user.school_id);
      }
      const { data: roomsData } = await roomsQuery;
      if (roomsData) {
        setRooms(roomsData);
      }
    };

    fetchData();
  }, [isOpen, user?.school_id, editData?.teacher_id, handoverSource?.teacher_id]);

  // Helper function to normalize time format from HH:mm:ss to HH:mm
  const normalizeTime = (time: string): string => {
    if (!time) return time;
    // If time includes seconds (HH:mm:ss), strip them
    return time.split(":").slice(0, 2).join(":");
  };

  // Reset form when modal opens
  useEffect(() => {
    if (!isOpen) {
      hasResetForEditRef.current = null;
      setConflicts([]);
      setOverrideConflicts(false);
      return;
    }

    if (editData?.id) {
      const editId = editData.id;
      if (hasResetForEditRef.current !== editId) {
        form.reset({
          subject_id: String(editData.subject_id),
          section_id: String(editData.section_id),
          teacher_id:
            editData.teacher_id != null
              ? String(editData.teacher_id)
              : NO_TEACHER,
          room_id: String(editData.room_id),
          // An edit targets one row, so it opens as one block; extra blocks
          // added here are saved as additional rows
          blocks: [
            {
              days_of_week: editData.days_of_week,
              start_time: normalizeTime(editData.start_time),
              end_time: normalizeTime(editData.end_time),
            },
          ],
          school_year: editData.school_year,
          grading_periods: editData.grading_periods ?? [],
        });
        // A row already saved as an accepted conflict re-opens with the
        // acknowledgement kept, so an unrelated edit does not have to re-tick it
        setOverrideConflicts(!!editData.conflict_override);
        hasResetForEditRef.current = editId;
      }
    } else if (handoverSource && handover) {
      const key = `handover:${handover.fromPeriod}:${handover.sources
        .map((s) => s.id)
        .join(",")}`;
      if (hasResetForEditRef.current !== key) {
        // The new teacher's rows: same class, one block per moving row, the
        // periods from the chosen one on. The teacher starts as the current
        // one so the picker shows who is handing over; it must be changed.
        form.reset({
          subject_id: String(handoverSource.subject_id),
          section_id: String(handoverSource.section_id),
          teacher_id:
            handoverSource.teacher_id != null
              ? String(handoverSource.teacher_id)
              : NO_TEACHER,
          room_id: String(handoverSource.room_id),
          blocks: handover.sources.map((s) => ({
            days_of_week: s.days_of_week,
            start_time: normalizeTime(s.start_time),
            end_time: normalizeTime(s.end_time),
          })),
          school_year: handoverSource.school_year,
          // Trimmed to the section's own periods once it loads (effect above)
          grading_periods: (handoverSource.grading_periods ?? [1, 2, 3, 4]).filter(
            (p) => p >= handover.fromPeriod,
          ),
        });
        setOverrideConflicts(false);
        hasResetForEditRef.current = key;
      }
    } else if (!editData && hasResetForEditRef.current !== "add") {
      const currentYear = initialSchoolYear ?? getCurrentSchoolYear();
      form.reset({
        subject_id: initialSubjectId != null ? String(initialSubjectId) : "",
        section_id: initialSectionId != null ? String(initialSectionId) : "",
        teacher_id: NO_TEACHER,
        room_id: "",
        blocks: [EMPTY_BLOCK],
        school_year: currentYear,
        grading_periods: [],
      });
      setOverrideConflicts(false);
      hasResetForEditRef.current = "add";
    }
  }, [
    form,
    editData,
    isOpen,
    initialSectionId,
    initialSchoolYear,
    initialSubjectId,
    handover,
    handoverSource,
  ]);

  /**
   * The handover split, against the section's own periods. NULL outside a
   * handover, or when the chosen period leaves either teacher nothing.
   */
  const handoverPlan = useMemo(
    () =>
      handoverSource && handover
        ? planHandover(
            handoverSource.grading_periods ?? null,
            handover.fromPeriod,
            sectionPeriods,
          )
        : null,
    [handover, handoverSource, sectionPeriods],
  );

  // Always use freshly fetched schedules for conflict check (avoids filtered
  // list). During a handover the moving rows are checked as they will be once
  // narrowed, or the new teacher's blocks would clash with the very rows they
  // replace.
  const schedulesForConflictCheck = useMemo(() => {
    const base =
      conflictCheckSchedules.length > 0 ? conflictCheckSchedules : allSchedules;
    if (!handover || !handoverPlan) return base;
    const moving = new Set(handover.sources.map((s) => String(s.id)));
    return base.map((row) =>
      moving.has(String(row.id))
        ? { ...row, grading_periods: handoverPlan.narrowed }
        : row,
    );
  }, [conflictCheckSchedules, allSchedules, handover, handoverPlan]);

  /**
   * Conflicts for every block, split by whether they can be overridden.
   *
   *  - `external` — this schedule against ones already saved. A school may mean
   *    these (combined classes), so they are overridable.
   *  - `internal` — two blocks of THIS schedule landing on the same day at the
   *    same hour. One class cannot meet twice at once; that is a typo, not an
   *    arrangement, so it is a hard stop.
   */
  const detectConflicts = useCallback(
    (
      values: LooseValues,
    ): {
      external: string[];
      /** Aligned with the blocks, so each saved row can carry its own flag */
      externalByBlock: string[][];
      internal: string[];
    } => {
      const blocks = completeBlocks(values.blocks);
      if (
        !values.subject_id ||
        !values.section_id ||
        !values.room_id ||
        !values.school_year ||
        blocks.length === 0
      ) {
        return { external: [], externalByBlock: [], internal: [] };
      }

      const lookups: ScheduleConflictLookups = {
        rooms: rooms.map((r) => ({ id: String(r.id), name: r.name })),
        teachers: teachers.map((t) => ({ id: String(t.id), name: t.name })),
        sections: sections.map((s) => ({ id: String(s.id), name: s.name })),
      };

      // Name the block only when there is more than one, so the single-block
      // case reads exactly as it did before
      const prefix = (block: TimeBlock) =>
        blocks.length > 1 ? `${describeBlock(block)} — ` : "";

      const externalByBlock = blocks.map((block) =>
        checkScheduleConflicts(
          {
            room_id: values.room_id as string,
            // Map the "no teacher" sentinel to null so it is never compared as an id
            teacher_id: hasTeacher(values.teacher_id)
              ? (values.teacher_id as string)
              : null,
            section_id: values.section_id as string,
            days_of_week: block.days_of_week,
            start_time: block.start_time,
            end_time: block.end_time,
            school_year: values.school_year as string,
            grading_periods: termsFor(values),
          },
          schedulesForConflictCheck,
          editData?.id,
          lookups,
        ).map((conflict) => `${prefix(block)}${conflict.message}`),
      );
      const external = externalByBlock.flat();

      const internal: string[] = [];
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          if (blocksOverlap(blocks[i]!, blocks[j]!)) {
            internal.push(
              `${describeBlock(blocks[i]!)} and ${describeBlock(
                blocks[j]!,
              )} overlap — the same class cannot meet twice at once.`,
            );
          }
        }
      }

      return { external, externalByBlock, internal };
    },
    [rooms, teachers, sections, schedulesForConflictCheck, editData?.id, termsFor],
  );

  // Check for conflicts when form values change
  useEffect(() => {
    const runCheck = (values: LooseValues) => {
      const { external, internal } = detectConflicts(values);
      setConflicts(external);
      setBlockOverlaps(internal);
    };

    // Run against the values already in the form, not only on the next change:
    // an edit opens with every field filled, so a clash on an existing row has
    // to be visible before the user touches anything.
    runCheck(form.getValues());

    const subscription = form.watch((values) => runCheck(values));

    return () => subscription.unsubscribe();
  }, [form, detectConflicts]);

  const onSubmit = async (data: FormType) => {
    if (isSubmitting || readOnly) return;
    setIsSubmitting(true);

    const teacherAssigned = hasTeacher(data.teacher_id);

    try {
      // Check conflicts one more time before submitting. A Temporary schedule
      // (no teacher) is still room-checked; teacher/section checks fall away.
      const { external, externalByBlock, internal } = detectConflicts(data);

      // Two blocks of this same schedule colliding is bad data, not a shared
      // room — it cannot be overridden away
      if (internal.length > 0) {
        toast.error("Time blocks overlap each other. Adjust the days or times.");
        setBlockOverlaps(internal);
        setIsSubmitting(false);
        return;
      }

      // A clash blocks the save unless the encoder explicitly accepted it
      if (external.length > 0 && !overrideConflicts) {
        toast.error("Conflicts detected — see details below.");
        setConflicts(external);
        setIsSubmitting(false);
        return;
      }

      // Only the server saw a clash (it checks rows this modal never fetched),
      // so it cannot be attributed to one block — every row has to carry the
      // flag or the retry is rejected again.
      const serverOnlyConflict =
        external.length === 0 && overrideConflicts && conflicts.length > 0;

      // One row per time block: "Mon/Wed 8-9" and "Fri 2-3" are two rows of the
      // same subject, section, teacher and room. The flag records what was true
      // for THAT block, so a clean block is not marked as an accepted conflict
      // just because a sibling clashes.
      const rowFor = (block: TimeBlock, index: number) => ({
        subject_id: parseInt(data.subject_id),
        section_id: parseInt(data.section_id),
        teacher_id: teacherAssigned ? parseInt(data.teacher_id) : null,
        room_id: parseInt(data.room_id),
        days_of_week: block.days_of_week,
        start_time: `${block.start_time}:00`, // Add seconds for TIME type
        end_time: `${block.end_time}:00`,
        school_year: data.school_year.trim(),
        grading_periods: termsFor(data),
        conflict_override:
          serverOnlyConflict || (externalByBlock[index]?.length ?? 0) > 0,
        ...(user?.school_id != null && { school_id: user.school_id }),
      });

      /**
       * A term is never taken from a teacher who has class record scores in
       * it (migration 222): the scores stay on their class record and the next
       * teacher would open an empty one. Periods the teacher still holds
       * through another block of the same class are not lost.
       */
      const refusedForScores = async (
        slot: {
          teacherId: string;
          subjectId: string;
          sectionId: string;
          schoolYear: string;
          excludeIds: string[];
        },
        dropped: number[],
      ): Promise<boolean> => {
        const kept = periodsKeptByOtherRows(schedulesForConflictCheck, {
          ...slot,
          allPeriods: sectionPeriods,
        });
        const lost = dropped.filter((p) => !kept.includes(p));
        if (lost.length === 0) return false;
        const encoded = await fetchEncodedPeriods(supabase, {
          subjectId: Number(slot.subjectId),
          sectionId: Number(slot.sectionId),
          schoolYear: slot.schoolYear,
          teacherId: Number(slot.teacherId),
        });
        const hit = encoded.filter((p) => lost.includes(p));
        if (hit.length === 0) return false;
        const name =
          teachers.find((t) => String(t.id) === slot.teacherId)?.name ??
          "This teacher";
        toast.error(
          encodedConflictMessage(name, schedulePeriodLabels(hit, termOptions)),
        );
        return true;
      };

      const showServerConflict = (message: string): boolean => {
        const dbConflicts = parseDbConflictError(message);
        if (!dbConflicts) return false;
        // The trigger saw a clash the client check did not. Show what it
        // said, so the override checkbox appears and the save is retryable.
        setConflicts(
          dbConflicts.length > 0
            ? dbConflicts
            : ["This slot is already taken (reported by the server)."],
        );
        toast.error("Schedule conflict detected — see details below.");
        return true;
      };

      // "Change from…": narrow the current teacher's rows, insert the new
      // teacher's, and put the old rows back if the insert is refused.
      if (handoverSource && handover) {
        if (!handoverPlan) {
          toast.error("There is nothing to hand over from that period.");
          return;
        }
        const handedOver = handoverPlan.handedOver ?? sectionPeriods;
        // The same teacher moving to a new room or time keeps these periods,
        // so only a change of teacher is checked for encoded scores
        const guarded = handoverGuardPeriods(
          handoverSource.teacher_id,
          teacherAssigned ? data.teacher_id : null,
          handedOver,
        );
        if (
          handoverSource.teacher_id != null &&
          (await refusedForScores(
            {
              teacherId: String(handoverSource.teacher_id),
              subjectId: String(handoverSource.subject_id),
              sectionId: String(handoverSource.section_id),
              schoolYear: handoverSource.school_year,
              excludeIds: handover.sources.map((s) => String(s.id)),
            },
            guarded,
          ))
        ) {
          return;
        }

        const result = await runHandover(supabase, {
          sources: handover.sources.map((s) => ({
            id: Number(s.id),
            grading_periods: s.grading_periods ?? null,
          })),
          narrowed: handoverPlan.narrowed,
          // Pinned to the plan, whatever the (locked) form fields hold
          insertRows: pinHandoverRows(
            data.blocks.map((block, index) => rowFor(block, index)),
            {
              handedOver: handoverPlan.handedOver,
              schoolYear: handoverSource.school_year,
            },
          ),
          schoolId: user?.school_id,
        });
        if (!result.ok) {
          if (!showServerConflict(result.error)) toast.error(result.error);
          return;
        }

        if (!skipReduxUpdate) {
          handover.sources.forEach((s) =>
            dispatch(
              updateList({ ...s, grading_periods: handoverPlan.narrowed }),
            ),
          );
          result.inserted.forEach((row) => dispatch(addItem(row)));
        }
        onSuccess?.();
        onClose();
        toast.success(
          `Schedule changed from ${schedulePeriodLabels(
            handedOver,
            termOptions,
          ).join(" and ")}.`,
        );
        return;
      }

      // An edit that moves the row to another teacher, or to another class,
      // takes every period it covered from the original teacher; an edit that
      // only narrows it takes the periods it no longer covers.
      if (editData?.id && editData.teacher_id != null) {
        const before = (editData.grading_periods ?? sectionPeriods).filter((p) =>
          sectionPeriods.includes(p),
        );
        const sameSlot =
          data.teacher_id === String(editData.teacher_id) &&
          data.subject_id === String(editData.subject_id) &&
          data.section_id === String(editData.section_id) &&
          data.school_year.trim() === editData.school_year;
        const after = sameSlot ? (termsFor(data) ?? sectionPeriods) : [];
        const dropped = before.filter((p) => !after.includes(p));
        if (
          await refusedForScores(
            {
              teacherId: String(editData.teacher_id),
              subjectId: String(editData.subject_id),
              sectionId: String(editData.section_id),
              schoolYear: editData.school_year,
              excludeIds: [String(editData.id)],
            },
            dropped,
          )
        ) {
          return;
        }
      }

      // On edit the first block updates the row that was opened; any block
      // added alongside it is a new row
      const newData = rowFor(data.blocks[0]!, 0);
      // A Grade Level Coordinator changes the teacher of the opened row and
      // nothing else: no sibling blocks (an insert would be refused) and only
      // the two columns migration 216's guard admits.
      const extraRows = teacherOnly
        ? []
        : data.blocks.slice(1).map((block, index) => rowFor(block, index + 1));

      if (editData?.id) {
        let updateQuery = supabase
          .from(table)
          .update(
            teacherOnly
              ? pickGradeLevelCoordinatorScheduleUpdate(newData)
              : newData,
          )
          .eq("id", editData.id);
        if (user?.school_id != null) {
          updateQuery = updateQuery.eq("school_id", user.school_id);
        }
        const { error } = await updateQuery;

        if (error) {
          if (!showServerConflict(error.message)) throw new Error(error.message);
        } else {
          let selectQuery = supabase
            .from(table)
            .select()
            .eq("id", editData.id);
          if (user?.school_id != null) {
            selectQuery = selectQuery.eq("school_id", user.school_id);
          }
          const { data: updated } = await selectQuery.single();

          if (updated && !skipReduxUpdate) {
            dispatch(updateList(updated));
          }

          // Blocks added during the edit become rows of their own. The update
          // above is already committed, so a failure here is reported as the
          // partial save it is rather than swallowed.
          if (extraRows.length > 0) {
            const { data: addedRows, error: addError } = await supabase
              .from(table)
              .insert(extraRows)
              .select();

            if (addError) {
              setIsSubmitting(false);
              toast.error(
                `Saved the edited time block, but the ${extraRows.length} new one(s) failed: ${addError.message}`,
              );
              return;
            }

            if (addedRows && !skipReduxUpdate) {
              addedRows.forEach((row) => dispatch(addItem(row)));
            }
          }

          onSuccess?.();
          onClose();
          toast.success(
            extraRows.length > 0
              ? `Schedule updated and ${extraRows.length} time block(s) added!`
              : "Schedule updated successfully!",
          );
        }
      } else {
        // Single statement, so the blocks are inserted or rejected together
        const { data: inserted, error } = await supabase
          .from(table)
          .insert([newData, ...extraRows])
          .select();

        if (error) {
          if (!showServerConflict(error.message)) throw new Error(error.message);
        } else {
          if (inserted && !skipReduxUpdate) {
            inserted.forEach((row) => dispatch(addItem(row)));
          }
          onSuccess?.();
          onClose();
          toast.success(
            data.blocks.length > 1
              ? `Schedule added with ${data.blocks.length} time blocks!`
              : "Schedule added successfully!",
          );
        }
      }
    } catch (err) {
      console.error("Submission error:", err);
      toast.error(err instanceof Error ? err.message : "Error saving schedule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      form.reset();
      setConflicts([]);
      setBlockOverlaps([]);
      setOverrideConflicts(false);
      onClose();
    }
  };

  /**
   * A new block starts from the last one's times — a Friday afternoon slot is
   * usually a variation on what is already there, not a blank form.
   */
  const handleAddBlock = () => {
    const last = form.getValues("blocks").at(-1);
    appendBlock({
      days_of_week: [],
      start_time: last?.start_time ?? EMPTY_BLOCK.start_time,
      end_time: last?.end_time ?? EMPTY_BLOCK.end_time,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {handoverSource ? "Change Teacher" : editData ? "Edit" : "Add"}{" "}
            {title}
          </DialogTitle>
          <DialogDescription>
            {handoverSource
              ? "Pick the teacher who takes over, or keep the same one to move the class to a new room or time. On save the current blocks keep the earlier periods and these are added for the rest."
              : readOnly
              ? "You can view this schedule but not change it."
              : teacherOnly
                ? "As Grade Level Coordinator you can change the teacher of this schedule."
                : editData
                  ? "Update schedule information below."
                  : "Fill in the details to add a new schedule."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="subject_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Subject <span className="text-red-500">*</span>
                    </FormLabel>
                    {(subjectLocked || !!handoverSource) && field.value ? (
                      <div className="h-10 px-3 py-2 rounded-md border bg-muted text-sm font-medium flex items-center">
                        {initialSubjectLabel ??
                          (() => {
                            const subj = subjects.find(
                              (s) => String(s.id) === field.value,
                            );
                            return subj
                              ? `${subj.code} - ${subj.name}`
                              : field.value;
                          })()}
                      </div>
                    ) : (
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isSubmitting || lockOthers}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select subject" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {visibleSubjects.map((subject) => (
                            <SelectItem
                              key={subject.id}
                              value={String(subject.id)}
                            >
                              {subject.code} - {subject.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {selectedSection && visibleSubjects.length === 0 && (
                      <p className="text-xs text-amber-700">
                        {isAlsSectionType(selectedSection.section_type)
                          ? "This is an ALS section, so only ALS subjects can be scheduled here — there are none yet."
                          : "Only ALS subjects are available, and they belong to ALS sections only."}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!initialSectionId ? (
                <FormField
                  control={form.control}
                  name="section_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Section <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isSubmitting || lockOthers || !!handoverSource}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select section" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sections.map((section) => (
                            <SelectItem
                              key={section.id}
                              value={String(section.id)}
                            >
                              {section.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="section_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Section</FormLabel>
                      <div className="h-10 px-3 py-2 rounded-md border bg-muted text-sm font-medium flex items-center">
                        {sections.find((s) => String(s.id) === field.value)?.name ?? "Loading..."}
                      </div>
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="teacher_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Teacher
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting || readOnly}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select teacher" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_TEACHER}>
                          No teacher (Temporary)
                        </SelectItem>
                        {teachers.map((teacher) => (
                          <SelectItem
                            key={teacher.id}
                            value={String(teacher.id)}
                          >
                            {teacher.name}
                            {teacher.isFormer && ` — ${FORMER_STAFF_LABEL}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!hasTeacher(field.value) && (
                      <p className="text-xs text-amber-700">
                        Saved as Temporary. Room conflicts are still checked;
                        teacher and section conflicts are not, until a teacher is
                        assigned.
                      </p>
                    )}
                    {teachers.some(
                      (t) => t.isFormer && t.id === field.value,
                    ) && (
                      <p className="text-xs text-amber-700">
                        This teacher has moved to another school. Saving keeps
                        them on the slot — pick a replacement, or &quot;No
                        teacher (Temporary)&quot;, to hand it over.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="room_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Room <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting || lockOthers}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select room" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {rooms.map((room) => (
                          <SelectItem key={room.id} value={String(room.id)}>
                            {room.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* A Grade Level Coordinator may change only the teacher (216's trigger) */}
            {!teacherOnly && (
            <FormField
              control={form.control}
              name="grading_periods"
              render={({ field }) => {
                const picked = (field.value ?? []).filter(
                  (p): p is number => p != null,
                );
                const semestral = termOptions.some((o) => o.periods.length > 1);
                const noun = semestral
                  ? "semester"
                  : termOptions.length === 3
                    ? "term"
                    : "quarter";
                return (
                  <FormItem>
                    <FormLabel className="text-sm font-medium capitalize">
                      {noun}s (optional)
                    </FormLabel>
                    <div className="flex flex-wrap gap-4">
                      {termOptions.map((o) => (
                        <label key={o.label} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={o.periods.every((p) => picked.includes(p))}
                            disabled={isSubmitting || !!handoverSource}
                            onChange={(e) =>
                              field.onChange(
                                e.target.checked
                                  ? Array.from(new Set([...picked, ...o.periods]))
                                  : picked.filter((v) => !o.periods.includes(v)),
                              )
                            }
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                    {handoverSource ? (
                      <p className="text-xs text-muted-foreground">
                        Set by the {noun} chosen in &quot;Change from…&quot;.
                        To start from another {noun}, cancel and choose again.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Leave all unticked for the whole school year. Tick only
                        the {noun}s this teacher handles when the subject changes
                        hands mid-year — schedule the other teacher for the rest.
                      </p>
                    )}
                  </FormItem>
                );
              }}
            />
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <FormLabel className="text-sm font-medium">
                  Meeting Times <span className="text-red-500">*</span>
                </FormLabel>
                {!lockOthers && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddBlock}
                    disabled={isSubmitting}
                    className="h-8"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add time block
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Days that share a time go in one block. Add another block when a
                day meets at a different hour — e.g. Mon &amp; Wed 8:00–9:00,
                Fri 14:00–15:00.
              </p>

              {blockFields.map((blockField, index) => {
                const block = blockValues[index];
                const days = block?.days_of_week ?? [];
                return (
                  <div
                    key={blockField.id}
                    className="rounded-md border bg-muted/30 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-muted-foreground">
                        {days.length > 0 && block
                          ? describeBlock(block as TimeBlock)
                          : `Time block ${index + 1}`}
                      </span>
                      {blockFields.length > 1 && !lockOthers && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeBlock(index)}
                          disabled={isSubmitting}
                          className="h-7 px-2 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Remove
                        </Button>
                      )}
                    </div>

                    <FormField
                      control={form.control}
                      name={`blocks.${index}.days_of_week`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <DayPicker
                              value={field.value ?? []}
                              onChange={field.onChange}
                              disabled={isSubmitting || lockOthers}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`blocks.${index}.start_time`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground">
                              Start Time
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="time"
                                className="h-10"
                                {...field}
                                disabled={isSubmitting || lockOthers}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`blocks.${index}.end_time`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground">
                              End Time
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="time"
                                className="h-10"
                                {...field}
                                disabled={isSubmitting || lockOthers}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {editData && index > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Saved as a separate schedule entry for this subject.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-4">
              {!initialSchoolYear ? (
                <FormField
                  control={form.control}
                  name="school_year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        School Year <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isSubmitting || lockOthers || !!handoverSource}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select school year" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {getSchoolYearOptions().map((year) => (
                            <SelectItem key={year} value={year}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="school_year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">School Year</FormLabel>
                      <div className="h-10 px-3 py-2 rounded-md border bg-muted text-sm font-medium flex items-center">
                        {field.value}
                      </div>
                    </FormItem>
                  )}
                />
              )}
            </div>

            {blockOverlaps.length > 0 && (
              <div className="rounded-md bg-red-50 border border-red-200 p-4">
                <h4 className="text-sm font-medium text-red-800 mb-2">
                  Time Blocks Overlap:
                </h4>
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {blockOverlaps.map((overlap, index) => (
                    <li key={index}>{overlap}</li>
                  ))}
                </ul>
              </div>
            )}

            {conflicts.length > 0 && (
              <div className="rounded-md bg-red-50 border border-red-200 p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-medium text-red-800 mb-2">
                    Schedule Conflicts Detected:
                  </h4>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                    {conflicts.map((conflict, index) => (
                      <li key={index}>{conflict}</li>
                    ))}
                  </ul>
                </div>
                <label className="flex items-start gap-3 cursor-pointer border-t border-red-200 pt-3">
                  <Checkbox
                    checked={overrideConflicts}
                    onChange={(e) => setOverrideConflicts(e.target.checked)}
                    disabled={isSubmitting || readOnly}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-red-800">
                    Save anyway — this double-booking is intentional
                    <span className="block text-xs font-normal text-red-700 mt-0.5">
                      For combined classes, e.g. two grade levels handled
                      together in one room by the same teacher. The schedule is
                      kept and marked as a shared slot.
                    </span>
                  </span>
                </label>
              </div>
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
                disabled={
                  isSubmitting ||
                  readOnly ||
                  blockOverlaps.length > 0 ||
                  (conflicts.length > 0 && !overrideConflicts)
                }
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
