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
import { Label } from "@/components/ui/label";
import { SchoolCalendarNotice } from "@/components/SchoolCalendarNotice";
import { useSchoolCalendar } from "@/hooks/useSchoolCalendar";
import { DEFAULT_CORE_VALUES } from "@/lib/constants/reportCardCoreValues";
import {
  generateReportCardPrint,
  isMatatagDesign,
  type CoreValuesData,
  type ReportCardDesign,
} from "@/lib/pdf/generateReportCard";
import { supabase } from "@/lib/supabase/client";
import { isOldShsCurriculum } from "@/lib/constants/shs";
import { isTermBasedSchoolYear } from "@/lib/utils/schoolYear";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface PrintCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  schoolId: string;
  sectionId: string;
  schoolYear: string;
  /** Migration 189 — "old" prints the semestral SHS card. */
  shsCurriculum?: string | null;
}

export function PrintCardModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  schoolId,
  sectionId,
  schoolYear,
  shsCurriculum,
}: PrintCardModalProps) {
  // Only the MATATAG card is offered — on one long-bond sheet, or cut back to
  // back onto a half-sheet. The legacy 3 Fold / 2 Fold designs are no longer
  // offered here, so a learner whose stored choice is one of them prints
  // MATATAG 2 Fold. The period columns still follow the school year, and an
  // old-curriculum Senior High section prints its semestral blocks on the
  // same design (migration 189).
  const oldShs = isOldShsCurriculum(shsCurriculum);
  const defaultDesign: ReportCardDesign = "matatag";
  const [design, setDesign] = useState<ReportCardDesign>(defaultDesign);
  const [printing, setPrinting] = useState(false);
  const [loading, setLoading] = useState(false);
  // The card's attendance block is a class-day count like any other; printed
  // against an unset calendar it reports every weekday of every month held so
  // far. Said before the print, not after it is handed to a parent.
  const { unset: calendarUnset } = useSchoolCalendar(schoolId, schoolYear, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoading(true);
    supabase
      .from("sms_report_card_core_values")
      .select("card_design")
      .eq("student_id", studentId)
      .eq("school_year", schoolYear)
      .maybeSingle()
      .then(({ data }) => {
        if (!isMounted) return;
        const stored = data?.card_design as ReportCardDesign | undefined;
        setDesign(isMatatagDesign(stored) && stored ? stored : defaultDesign);
        setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen, studentId, schoolYear]);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const { data: row, error: fetchError } = await supabase
        .from("sms_report_card_core_values")
        .select("core_values, card_design")
        .eq("student_id", studentId)
        .eq("school_year", schoolYear)
        .maybeSingle();

      if (fetchError) {
        console.error("PrintCardModal fetch:", fetchError);
        toast.error("Could not load report card data");
        return;
      }

      const coreValues =
        (row?.core_values as CoreValuesData) ?? DEFAULT_CORE_VALUES;

      const { error: upsertError } = await supabase
        .from("sms_report_card_core_values")
        .upsert(
          {
            student_id: Number(studentId),
            school_id: schoolId,
            school_year: schoolYear,
            core_values: coreValues,
            card_design: design,
          },
          { onConflict: "student_id,school_year" },
        );

      if (upsertError) {
        console.error("PrintCardModal upsert:", upsertError);
        toast.error("Could not save card design before printing");
        return;
      }

      await generateReportCardPrint({
        schoolId,
        studentId,
        sectionId,
        schoolYear,
        coreValues,
        design,
      });
    } catch (error) {
      console.error("Error generating report card:", error);
      toast.error("Failed to generate report card");
    } finally {
      setPrinting(false);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print Report Card</DialogTitle>
          <DialogDescription>{studentName}</DialogDescription>
        </DialogHeader>

        {calendarUnset && <SchoolCalendarNotice schoolYear={schoolYear} />}

        <div className="space-y-2">
          <Label className="text-sm font-medium">Card Design</Label>
          <p className="text-xs text-muted-foreground">
            Core values are edited from{" "}
            <span className="font-medium text-foreground">Core Values Entry</span>{" "}
            in the student menu. They are included automatically when you print.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={design === "matatag" ? "default" : "outline"}
              size="sm"
              onClick={() => setDesign("matatag")}
              disabled={loading}
            >
              {oldShs ? "SHS (Semestral) 2 Fold" : "MATATAG 2 Fold"}
            </Button>
            <Button
              type="button"
              variant={design === "matatag-duplex" ? "default" : "outline"}
              size="sm"
              onClick={() => setDesign("matatag-duplex")}
              disabled={loading}
            >
              {oldShs
                ? "SHS (Semestral) 2 Fold back to back"
                : "MATATAG 2 Fold back to back"}
            </Button>
          </div>
          {oldShs ? (
            <p className="text-xs text-muted-foreground">
              This section is on the <span className="font-medium">Old SHS
              Curriculum</span>, so the card prints one block per semester —
              each semester&rsquo;s own subjects over its two quarters, with its
              own Semester Final Grade and General Average.
            </p>
          ) : null}
          {design === "matatag-duplex" ? (
            <p className="text-xs text-muted-foreground">
              Prints on <span className="font-medium">1/2 long bond paper
              (6.5&times;8.5 in)</span>: the first fold on page 1 and the second
              fold on page 2. Set the printer to print on both sides (flip on
              long edge) so the two folds land back to back on one sheet.
            </p>
          ) : null}
          {design === "matatag" && !oldShs ? (
            <p className="text-xs text-muted-foreground">
              Learner&rsquo;s Performance Report &mdash; one folded sheet. Learning
              areas come from the grade level&rsquo;s subjects, and the period
              columns follow the school year (
              {isTermBasedSchoolYear(schoolYear) ? "3 terms" : "4 quarters"}).
              Core values are not part of this form.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={printing || loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handlePrint()}
            disabled={printing || loading}
          >
            <Printer className="mr-2 h-4 w-4" />
            {printing ? "Printing..." : "Print"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
