"use client";

/**
 * View + print a saved Table of Specification. Loads the competency rows and
 * item placement for the given TOS, renders TosPreviewTable, and prints via
 * window.print() (the #tos-print-area rules in globals.css isolate it).
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase/client";
import type { CognitiveLevel } from "@/lib/constants/examinations";
import type { Tos } from "@/types";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { PrintPortal } from "./PrintPortal";
import {
  TosPreviewTable,
  type TosPreviewCompetency,
  type TosPreviewItem,
} from "./TosPreviewTable";

interface TosViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  tos: Tos | null;
}

export function TosViewModal({ isOpen, onClose, tos }: TosViewModalProps) {
  const [loading, setLoading] = useState(false);
  const [competencies, setCompetencies] = useState<TosPreviewCompetency[]>([]);
  const [items, setItems] = useState<TosPreviewItem[]>([]);

  useEffect(() => {
    if (!isOpen || !tos?.id) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [{ data: compRows }, { data: itemRows }] = await Promise.all([
        supabase
          .from("sms_tos_competencies")
          .select("*")
          .eq("tos_id", tos.id)
          .order("position"),
        supabase
          .from("sms_tos_items")
          .select("*")
          .eq("tos_id", tos.id)
          .order("item_number"),
      ]);
      if (!active) return;
      setCompetencies(
        (compRows || []).map((c) => ({
          id: String(c.id),
          competency_text: c.competency_text || "",
          lc_code: c.lc_code,
          no_of_days: Number(c.no_of_days) || 0,
          no_of_items: Number(c.no_of_items) || 0,
        })),
      );
      setItems(
        (itemRows || []).map((it) => ({
          competency_id: String(it.competency_id),
          item_number: it.item_number,
          cognitive_level: it.cognitive_level as CognitiveLevel,
        })),
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [isOpen, tos?.id]);

  if (!tos) return null;

  const previewHeader = {
    title: tos.title,
    subject_name: tos.subject_name,
    grade_level: tos.grade_level,
    exam_type: tos.exam_type,
    school_year: tos.school_year,
    grading_period: tos.grading_period,
    total_items: tos.total_items,
    total_days: tos.total_days,
    prepared_by_name: tos.prepared_by_name,
    prepared_by_position: tos.prepared_by_position,
    legend: tos.legend,
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4">
            <span>Table of Specification</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.print()}
              className="mr-6"
            >
              <Printer className="mr-1.5 h-4 w-4" /> Print
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {/* On-screen preview */}
            <div className="bg-white p-2">
              <TosPreviewTable
                header={previewHeader}
                competencies={competencies}
                items={items}
              />
            </div>
            {/* Print copy (outside the transformed dialog) */}
            <PrintPortal id="tos-print-area">
              <TosPreviewTable
                header={previewHeader}
                competencies={competencies}
                items={items}
              />
            </PrintPortal>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
