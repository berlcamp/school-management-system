"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  generateGrade1ProgressCardPrint,
  generatePaceFormPrint,
} from "@/lib/pdf";
import { ClipboardList, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PaceEntryPanel } from "./PaceEntryPanel";

interface PaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  studentId: string;
  studentName: string;
  sectionId: string;
  sectionName: string;
  schoolYear: string;
}

export function PaceModal({
  open,
  onOpenChange,
  schoolId,
  studentId,
  studentName,
  sectionId,
  sectionName,
  schoolYear,
}: PaceModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [printing, setPrinting] = useState<"card" | "pace" | null>(null);

  const print = async (what: "card" | "pace") => {
    setPrinting(what);
    try {
      const params = { schoolId, studentId, sectionId, schoolYear };
      await (what === "card"
        ? generateGrade1ProgressCardPrint(params)
        : generatePaceFormPrint(params));
    } catch (err) {
      console.error("Grade 1 print error:", err);
      toast.error("Failed to prepare the printout");
    } finally {
      setPrinting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!h-[calc(100vh-2rem)] !w-[calc(100vw-2rem)] !max-w-none !translate-x-[-50%] !translate-y-[-50%] flex flex-col gap-0 p-0">
        <DialogHeader className="flex-shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 shrink-0" />
              {studentName}
              <span className="font-normal text-muted-foreground">|</span>
              <span className="font-normal text-muted-foreground">
                Grade 1 &ndash; {sectionName}
              </span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={printing !== null}
                onClick={() => void print("pace")}
              >
                {printing === "pace" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                PACE Form
              </Button>
              <Button
                size="sm"
                disabled={printing !== null}
                onClick={() => void print("card")}
              >
                {printing === "card" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                Progress Card
              </Button>
              {isSaving && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </span>
              )}
            </div>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            School Year {schoolYear} &mdash; the Progress Card prints with the
            PACE pages attached, as the card&rsquo;s own note to parents says.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <PaceEntryPanel
            studentId={studentId}
            sectionId={sectionId}
            schoolYear={schoolYear}
            fillHeight
            onSavingChange={setIsSaving}
          />
        </div>

        <div className="flex flex-shrink-0 items-center justify-end border-t border-border bg-muted/30 px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            Changes are saved automatically
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
