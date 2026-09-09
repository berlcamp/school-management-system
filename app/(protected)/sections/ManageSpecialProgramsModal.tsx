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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSpecialPrograms } from "@/hooks/useSpecialPrograms";
import { specializationLabel } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { formatLrn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { Section, Student } from "@/types";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: Section | null;
}

/** "none" rather than "": a Radix Select item cannot carry an empty value. */
const NONE = "none";

/**
 * Which special program each learner of a section belongs to (migration 179).
 *
 * MEMBERSHIP, NOT A ROSTER. This says "Juan is an SPA-Music learner this school
 * year". It does not enrol him in any subject — the per-subject roster is its
 * own relationship, edited from Manage Schedules → Manage Students, which
 * merely *pre-ticks* the members recorded here.
 *
 * One strand per program per learner per school year. A learner may hold
 * several programs; this screen edits one program at a time, which is how a
 * school actually works through it.
 */
export const ManageSpecialProgramsModal = ({
  isOpen,
  onClose,
  section,
}: ModalProps) => {
  const user = useAppSelector((state) => state.user.user);
  const { selectable, strandsOf, programs } = useSpecialPrograms();

  const [programId, setProgramId] = useState<string>(NONE);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  /** studentId → specialization id, NONE for "in the program, no strand", or absent for "not a member". */
  const [memberships, setMemberships] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});

  const program = programs.find((p) => String(p.id) === programId) ?? null;
  const strands = programId === NONE ? [] : strandsOf(programId);
  const label = specializationLabel(program);

  const fetchStudents = useCallback(async () => {
    if (!section) return;
    setLoading(true);
    try {
      const { data: enrollments, error } = await supabase
        .from("sms_enrollments")
        .select(
          `student_id, student:sms_students!sms_enrollments_student_id_fkey(*)`,
        )
        .eq("section_id", section.id)
        .eq("school_year", section.school_year)
        .eq("status", "approved");

      if (error) throw error;

      const list = (enrollments || [])
        .map((e) => (Array.isArray(e.student) ? e.student[0] : e.student))
        .filter(Boolean)
        .sort((a, b) => {
          const last = (a.last_name || "").localeCompare(b.last_name || "");
          return last !== 0
            ? last
            : (a.first_name || "").localeCompare(b.first_name || "");
        }) as Student[];

      setStudents(list);
    } catch (err) {
      console.error("Section roster:", err);
      toast.error("Failed to load the section's learners.");
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [section]);

  const fetchMemberships = useCallback(async () => {
    if (!section || programId === NONE || students.length === 0) {
      setMemberships({});
      setOriginal({});
      return;
    }
    const { data, error } = await supabase
      .from("sms_student_special_programs")
      .select("student_id, specialization_id")
      .eq("special_program_id", Number(programId))
      .eq("school_year", section.school_year)
      .in(
        "student_id",
        students.map((s) => s.id),
      );

    if (error) {
      console.error("Memberships:", error);
      toast.error("Failed to load memberships.");
      return;
    }

    const map: Record<string, string> = {};
    (data || []).forEach((row) => {
      map[String(row.student_id)] = row.specialization_id
        ? String(row.specialization_id)
        : NONE;
    });
    setMemberships(map);
    setOriginal(map);
  }, [section, programId, students]);

  useEffect(() => {
    if (isOpen) fetchStudents();
  }, [isOpen, fetchStudents]);

  useEffect(() => {
    if (isOpen) fetchMemberships();
  }, [isOpen, fetchMemberships]);

  useEffect(() => {
    if (!isOpen) setProgramId(NONE);
  }, [isOpen]);

  /** Absent from the map = not a member. */
  const setMembership = (studentId: string, value: string | null) => {
    setMemberships((prev) => {
      const next = { ...prev };
      if (value === null) delete next[studentId];
      else next[studentId] = value;
      return next;
    });
  };

  const hasChanges =
    Object.keys(memberships).length !== Object.keys(original).length ||
    Object.entries(memberships).some(([id, value]) => original[id] !== value);

  const handleSave = async () => {
    if (!section || !user || programId === NONE) return;
    setSaving(true);
    try {
      const removed = Object.keys(original).filter((id) => !(id in memberships));
      const upserts = Object.entries(memberships).filter(
        ([id, value]) => original[id] !== value,
      );

      if (removed.length > 0) {
        const { error } = await supabase
          .from("sms_student_special_programs")
          .delete()
          .eq("special_program_id", Number(programId))
          .eq("school_year", section.school_year)
          .in("student_id", removed);
        if (error) throw error;
      }

      for (const [studentId, value] of upserts) {
        const payload = {
          student_id: Number(studentId),
          special_program_id: Number(programId),
          specialization_id: value === NONE ? null : Number(value),
          school_id: Number(user.school_id),
          school_year: section.school_year,
          enrolled_by: user.system_user_id,
        };
        // UNIQUE(student_id, special_program_id, school_year) — one strand per
        // program per learner per year, so a change is an upsert on that key
        // rather than a second row.
        const { error } = await supabase
          .from("sms_student_special_programs")
          .upsert(payload, {
            onConflict: "student_id,special_program_id,school_year",
          });
        if (error) throw error;
      }

      toast.success("Program membership updated.");
      fetchMemberships();
    } catch (err) {
      console.error("Save memberships:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to save membership.",
      );
    } finally {
      setSaving(false);
    }
  };

  const studentName = (student: Student) =>
    `${student.last_name}, ${student.first_name}${
      student.middle_name ? ` ${student.middle_name.charAt(0)}.` : ""
    }`;

  const memberCount = Object.keys(memberships).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Special Program Membership
          </DialogTitle>
          <DialogDescription>
            Which learners of {section?.name} ({section?.school_year}) belong to
            a special program. This does <strong>not</strong> enrol them in any
            subject — it pre-ticks them when you open that subject&apos;s Manage
            Students.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-sm font-medium">Special Program</label>
            <Select value={programId} onValueChange={setProgramId}>
              {/* w-full: the shared SelectTrigger is w-fit, and a full program
                  name would otherwise push past the dialog. */}
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="Select a program" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Select a program…</SelectItem>
                {selectable.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                    {p.school_id == null ? " (division)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectable.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No special programs yet — add them in School Settings &rarr;
                Special Programs.
              </p>
            )}
          </div>

          {programId !== NONE && (
            <>
              <p className="text-sm text-muted-foreground">
                {memberCount} of {students.length}{" "}
                {students.length === 1 ? "learner" : "learners"} in this program.
              </p>

              <div className="rounded-md border">
                {loading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Loading…
                  </div>
                ) : students.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No learners enrolled in this section.
                  </div>
                ) : (
                  <div className="divide-y">
                    {students.map((student) => {
                      const id = String(student.id);
                      const value = memberships[id];
                      const isMember = value !== undefined;
                      return (
                        <div
                          key={id}
                          className="flex items-center gap-3 p-3 hover:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {studentName(student)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              LRN: {formatLrn(student.lrn)}
                            </div>
                          </div>
                          <Select
                            value={isMember ? value : "not_member"}
                            onValueChange={(next) =>
                              setMembership(
                                id,
                                next === "not_member" ? null : next,
                              )
                            }
                            disabled={saving}
                          >
                            <SelectTrigger className="h-8 w-[220px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not_member">
                                Not in this program
                              </SelectItem>
                              {/* A program with no second level, or a learner
                                  admitted before their strand is settled. */}
                              <SelectItem value={NONE}>
                                In the program
                                {strands.length > 0
                                  ? ` (no ${label.toLowerCase()} yet)`
                                  : ""}
                              </SelectItem>
                              {strands.map((strand) => (
                                <SelectItem
                                  key={strand.id}
                                  value={String(strand.id)}
                                >
                                  {strand.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges || programId === NONE}
          >
            {saving ? "Saving…" : "Save Membership"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
