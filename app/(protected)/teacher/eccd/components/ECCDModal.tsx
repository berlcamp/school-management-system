"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EccdPeriod } from "@/types";
import { ClipboardList, Loader2 } from "lucide-react";
import { useState } from "react";
import { ECCDEntryTable } from "./ECCDEntryTable";
import { ECCDPrintSelector } from "./ECCDPrintSelector";

const PERIOD_LABELS: Record<EccdPeriod, string> = {
  "1ST_SEM": "1st Semester",
  "2ND_SEM": "2nd Semester",
};

interface ECCDModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionId: string;
  sectionName: string;
  schoolYear: string;
  period: EccdPeriod;
}

export function ECCDModal({
  open,
  onOpenChange,
  sectionId,
  sectionName,
  schoolYear,
  period,
}: ECCDModalProps) {
  const [isSaving, setIsSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-none !w-[calc(100vw-2rem)] !h-[calc(100vh-2rem)] !translate-x-[-50%] !translate-y-[-50%] flex flex-col p-0 gap-0"
      >
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 shrink-0" />
              K &ndash; {sectionName}
              <span className="text-muted-foreground font-normal">|</span>
              <span className="text-muted-foreground font-normal">
                {PERIOD_LABELS[period]}
              </span>
            </DialogTitle>
            <div className="flex items-center gap-3">
              <ECCDPrintSelector
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
          <p className="text-xs text-muted-foreground mt-0.5">
            School Year {schoolYear} &mdash; Revised Philippine ECCD Checklist
          </p>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-auto min-h-0 px-4 py-4">
          <ECCDEntryTable
            sectionId={sectionId}
            schoolYear={schoolYear}
            period={period}
            fillHeight
            onSavingChange={setIsSaving}
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border flex-shrink-0 flex items-center justify-end bg-muted/30">
          <span className="text-xs text-muted-foreground">
            Changes are saved automatically
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
