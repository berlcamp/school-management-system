"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { getGradeLevelLabel, GRADE_LEVELS } from "@/lib/constants";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { Loader2, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

interface RollbackAutoEnrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRolledBack: () => void;
  schoolId: number | string | null;
}

interface PreviewResult {
  /** Active enrollment row ids to delete — auto-enrolled students only */
  deleteEnrollmentIds: string[];
  /** Student ids whose section will be cleared — auto-enrolled students only */
  studentIds: string[];
  /** Maps student_id → { sourceEnrollmentId, mode } */
  sourceMap: Map<string, { id: string; mode: "promoted" | "retained" }>;
  /** Active students in this grade/SY with no auto-enroll source — left untouched */
  skippedCount: number;
}

export function RollbackAutoEnrollModal({
  isOpen,
  onClose,
  onRolledBack,
  schoolId,
}: RollbackAutoEnrollModalProps) {
  const [targetSchoolYear, setTargetSchoolYear] = useState(getCurrentSchoolYear);
  const [gradeLevel, setGradeLevel] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [rolling, setRolling] = useState(false);

  const schoolYearOptions = useMemo(() => getSchoolYearOptions(1, 2), []);

  const handleClose = () => {
    if (rolling) return;
    setPreview(null);
    setGradeLevel("");
    onClose();
  };

  const handlePreview = async () => {
    if (!gradeLevel) return;
    setLoadingPreview(true);
    setPreview(null);
    try {
      const gl = parseInt(gradeLevel);

      // Find active enrollments in the target school year for this grade level
      let activeQuery = supabase
        .from("sms_enrollments")
        .select("id, student_id")
        .eq("school_year", targetSchoolYear)
        .eq("grade_level", gl)
        .eq("enrollment_status", "active")
        .eq("status", "approved");

      if (schoolId != null) activeQuery = activeQuery.eq("school_id", schoolId);

      const { data: activeRows, error: activeErr } = await activeQuery;
      if (activeErr) throw new Error(activeErr.message);
      if (!activeRows || activeRows.length === 0) {
        toast.error("No active enrollments found for the selected school year and grade level.");
        setLoadingPreview(false);
        return;
      }

      const studentIds = activeRows.map((r) => r.student_id);

      // Find their completed enrollments from the source school year.
      // Auto-enroll marks the prior promoted/retained enrollment as 'completed'
      // (enroll_students_atomic RPC), so a completed source in the previous SY
      // is the signature that distinguishes an auto-enrolled student from one
      // enrolled manually via "New Enrollment" or as a transferee.
      const [targetStart] = targetSchoolYear.split("-");
      const sourceSY = `${parseInt(targetStart) - 1}-${targetStart}`;

      let sourceQuery = supabase
        .from("sms_enrollments")
        .select("id, student_id, grade_level")
        .in("student_id", studentIds)
        .eq("school_year", sourceSY)
        .eq("enrollment_status", "completed")
        .eq("status", "approved");

      if (schoolId != null) sourceQuery = sourceQuery.eq("school_id", schoolId);

      const { data: sourceRows, error: sourceErr } = await sourceQuery;
      if (sourceErr) throw new Error(sourceErr.message);

      const sourceMap = new Map<string, { id: string; mode: "promoted" | "retained" }>();
      for (const row of sourceRows ?? []) {
        // Same grade in source and target → was retained; any grade increase
        // (incl. Kindergarten/SNED → Grade 1) → was promoted.
        const mode: "promoted" | "retained" =
          row.grade_level === gl ? "retained" : "promoted";
        sourceMap.set(row.student_id, { id: row.id, mode });
      }

      // Only roll back students that were actually auto-enrolled (have a
      // completed source). Active students with no source — manually enrolled
      // new students or transferees — are left completely untouched.
      const autoEnrolledRows = activeRows.filter((r) =>
        sourceMap.has(r.student_id),
      );

      if (autoEnrolledRows.length === 0) {
        toast.error(
          "No auto-enrolled students found for this selection. The active enrollments here were created manually and will not be touched.",
        );
        setLoadingPreview(false);
        return;
      }

      setPreview({
        deleteEnrollmentIds: autoEnrolledRows.map((r) => r.id),
        studentIds: autoEnrolledRows.map((r) => r.student_id),
        sourceMap,
        skippedCount: activeRows.length - autoEnrolledRows.length,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load preview");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleRollback = async () => {
    if (!preview) return;
    setRolling(true);
    try {
      // 1. Delete the specific auto-enrolled active enrollment rows (by id)
      let deleteQuery = supabase
        .from("sms_enrollments")
        .delete()
        .in("id", preview.deleteEnrollmentIds);

      if (schoolId != null) deleteQuery = deleteQuery.eq("school_id", schoolId);

      const { error: deleteErr } = await deleteQuery;
      if (deleteErr) throw new Error(deleteErr.message);

      // 2. Revert each source enrollment back to its original mode
      const promotedIds: string[] = [];
      const retainedIds: string[] = [];
      for (const { id, mode } of preview.sourceMap.values()) {
        if (mode === "promoted") promotedIds.push(id);
        else retainedIds.push(id);
      }

      if (promotedIds.length > 0) {
        const { error } = await supabase
          .from("sms_enrollments")
          .update({ enrollment_status: "promoted" })
          .in("id", promotedIds);
        if (error) throw new Error(error.message);
      }

      if (retainedIds.length > 0) {
        const { error } = await supabase
          .from("sms_enrollments")
          .update({ enrollment_status: "retained" })
          .in("id", retainedIds);
        if (error) throw new Error(error.message);
      }

      // 3. Clear current_section_id for affected students
      let studentUpdate = supabase
        .from("sms_students")
        .update({ current_section_id: null })
        .in("id", preview.studentIds);

      if (schoolId != null) studentUpdate = studentUpdate.eq("school_id", schoolId);
      await studentUpdate;

      toast.success(
        `Rolled back ${preview.studentIds.length} enrollments successfully.`,
      );
      onRolledBack();
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setRolling(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && handleClose()}>
      <DialogContent
        className="sm:max-w-[460px]"
        onInteractOutside={(e) => rolling && e.preventDefault()}
        onEscapeKeyDown={(e) => rolling && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-destructive" />
            Rollback Auto-Enroll
          </DialogTitle>
          <DialogDescription>
            Select the school year and grade level whose auto-enrollments you want to undo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                School Year
              </label>
              <Select value={targetSchoolYear} onValueChange={(v) => { setTargetSchoolYear(v); setPreview(null); }} disabled={rolling}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {schoolYearOptions.map((sy) => (
                    <SelectItem key={sy} value={sy}>{sy}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Grade Level
              </label>
              <Select value={gradeLevel} onValueChange={(v) => { setGradeLevel(v); setPreview(null); }} disabled={rolling}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {GRADE_LEVELS.map((gl) => (
                    <SelectItem key={gl} value={String(gl)}>
                      {getGradeLevelLabel(gl)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!preview && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handlePreview}
              disabled={!gradeLevel || loadingPreview || rolling}
            >
              {loadingPreview ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading preview...</>
              ) : (
                <><Search className="h-4 w-4 mr-2" />Preview Rollback</>
              )}
            </Button>
          )}

          {preview && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 space-y-1.5 text-sm">
              <p className="font-medium text-destructive">
                {preview.studentIds.length} auto-enrolled enrollment{preview.studentIds.length !== 1 ? "s" : ""} will be deleted
              </p>
              <p className="text-muted-foreground">
                {preview.sourceMap.size} source enrollment{preview.sourceMap.size !== 1 ? "s" : ""} will be reverted (
                {[...preview.sourceMap.values()].filter((v) => v.mode === "promoted").length} promoted,{" "}
                {[...preview.sourceMap.values()].filter((v) => v.mode === "retained").length} retained)
              </p>
              <p className="text-muted-foreground">
                Student <code>current_section_id</code> will be cleared.
              </p>
              {preview.skippedCount > 0 && (
                <p className="text-muted-foreground border-t border-destructive/20 pt-1.5 mt-1.5">
                  {preview.skippedCount} other active student
                  {preview.skippedCount !== 1 ? "s" : ""} in this grade
                  {" "}(manually enrolled or transferred in) will be{" "}
                  <span className="font-medium text-foreground">left untouched</span>.
                </p>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => { setPreview(null); }}
                disabled={rolling}
              >
                ← Change selection
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={rolling}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRollback}
            disabled={!preview || rolling}
          >
            {rolling ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rolling back...</>
            ) : (
              "Confirm Rollback"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
