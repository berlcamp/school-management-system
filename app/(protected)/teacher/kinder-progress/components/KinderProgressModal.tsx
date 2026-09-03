"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KINDER_TERM_LABELS } from "@/lib/constants/kinderProgress";
import type { KinderProgressTerm } from "@/types";
import { Baby, Loader2 } from "lucide-react";
import { useState } from "react";
import { KinderProgressEntryTable } from "./KinderProgressEntryTable";
import { KinderProgressPrintSelector } from "./KinderProgressPrintSelector";

interface KinderProgressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionId: string;
  sectionName: string;
  schoolYear: string;
  term: KinderProgressTerm;
}

export function KinderProgressModal({
  open,
  onOpenChange,
  sectionId,
  sectionName,
  schoolYear,
  term,
}: KinderProgressModalProps) {
  const [isSaving, setIsSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!h-[calc(100vh-2rem)] !w-[calc(100vw-2rem)] !max-w-none !translate-x-[-50%] !translate-y-[-50%] flex flex-col gap-0 p-0">
        <DialogHeader className="flex-shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Baby className="h-4 w-4 shrink-0" />
              K &ndash; {sectionName}
              <span className="font-normal text-muted-foreground">|</span>
              <span className="font-normal text-muted-foreground">
                {KINDER_TERM_LABELS[term]}
              </span>
            </DialogTitle>
            <div className="flex items-center gap-3">
              <KinderProgressPrintSelector
                sectionId={sectionId}
                schoolYear={schoolYear}
              />
              {isSaving && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </span>
              )}
            </div>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            School Year {schoolYear} &mdash; Kindergarten Progress Report
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <KinderProgressEntryTable
            sectionId={sectionId}
            schoolYear={schoolYear}
            term={term}
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
