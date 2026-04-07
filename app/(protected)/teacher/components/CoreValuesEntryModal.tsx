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
import {
  CORE_VALUE_STATEMENTS,
  DEFAULT_CORE_VALUES,
  RATING_OPTIONS,
} from "@/lib/constants/reportCardCoreValues";
import type {
  CoreValueRating,
  CoreValuesData,
  ReportCardDesign,
} from "@/lib/pdf/generateReportCard";
import { supabase } from "@/lib/supabase/client";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

const AUTOSAVE_MS = 500;

interface CoreValuesEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  schoolId: string;
  schoolYear: string;
}

export function CoreValuesEntryModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  schoolId,
  schoolYear,
}: CoreValuesEntryModalProps) {
  const [coreValues, setCoreValues] = useState<CoreValuesData>({
    ...DEFAULT_CORE_VALUES,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const cardDesignRef = useRef<ReportCardDesign>("3-fold");
  const hydratedRef = useRef(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);

  const persist = useCallback(
    async (values: CoreValuesData) => {
      setSaving(true);
      try {
        const { error } = await supabase.from("sms_report_card_core_values").upsert(
          {
            student_id: Number(studentId),
            school_id: schoolId,
            school_year: schoolYear,
            core_values: values,
            card_design: cardDesignRef.current,
          },
          { onConflict: "student_id,school_year" },
        );
        if (error) throw error;
        setLastSaved(new Date());
      } catch (err) {
        console.error("CoreValuesEntryModal save:", err);
        toast.error("Could not save core values");
      } finally {
        setSaving(false);
      }
    },
    [studentId, schoolId, schoolYear],
  );

  useEffect(() => {
    if (!isOpen) {
      hydratedRef.current = false;
      return;
    }

    let cancelled = false;
    hydratedRef.current = false;
    setLoading(true);

    void supabase
      .from("sms_report_card_core_values")
      .select("core_values, card_design")
      .eq("student_id", studentId)
      .eq("school_year", schoolYear)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.core_values) {
          setCoreValues(data.core_values as CoreValuesData);
        } else {
          setCoreValues({ ...DEFAULT_CORE_VALUES });
        }
        cardDesignRef.current = (data?.card_design as ReportCardDesign) ?? "3-fold";
        setLoading(false);
        hydratedRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, studentId, schoolYear]);

  useEffect(() => {
    if (!isOpen || loading || !hydratedRef.current) return;

    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
    }
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      void persist(coreValues);
    }, AUTOSAVE_MS);

    return () => {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, [coreValues, isOpen, loading, persist]);

  const handleClose = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    try {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      if (hydratedRef.current) {
        await persist(coreValues);
      }
      onClose();
    } finally {
      closingRef.current = false;
    }
  }, [coreValues, onClose, persist]);

  const handleRatingChange = (
    key: keyof CoreValuesData,
    quarter: number,
    value: CoreValueRating,
  ) => {
    setCoreValues((prev) => {
      const updated = { ...prev };
      const tuple = [...prev[key]] as [
        CoreValueRating,
        CoreValueRating,
        CoreValueRating,
        CoreValueRating,
      ];
      tuple[quarter] = value;
      updated[key] = tuple;
      return updated;
    });
  };

  let lastCoreValue = "";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void handleClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Core Values Entry</DialogTitle>
          <DialogDescription>
            {studentName} · School year {schoolYear}. Ratings save automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            AO = Always Observed, SO = Sometimes Observed, RO = Rarely Observed,
            NO = Not Observed
          </span>
          <span className="shrink-0 tabular-nums">
            {saving
              ? "Saving…"
              : lastSaved
                ? `Saved ${lastSaved.toLocaleTimeString()}`
                : ""}
          </span>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Observed Values</Label>
          <div className="rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-2 py-1.5 text-left font-medium">
                    Core Value
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">
                    Behavior Statement
                  </th>
                  <th className="px-2 py-1.5 text-center font-medium w-16">Q1</th>
                  <th className="px-2 py-1.5 text-center font-medium w-16">Q2</th>
                  <th className="px-2 py-1.5 text-center font-medium w-16">Q3</th>
                  <th className="px-2 py-1.5 text-center font-medium w-16">Q4</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-2 py-4 text-center text-muted-foreground"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : (
                  CORE_VALUE_STATEMENTS.map((item) => {
                    const showCoreValue = item.coreValue !== lastCoreValue;
                    lastCoreValue = item.coreValue;
                    return (
                      <tr key={item.key} className="border-b last:border-b-0">
                        <td className="px-2 py-1.5 font-medium text-xs align-top">
                          {showCoreValue ? item.coreValue : ""}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">
                          {item.statement}
                        </td>
                        {[0, 1, 2, 3].map((q) => (
                          <td key={q} className="px-1 py-1 text-center">
                            <select
                              className="h-7 w-14 rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                              value={coreValues[item.key][q]}
                              onChange={(e) =>
                                handleRatingChange(
                                  item.key,
                                  q,
                                  e.target.value as CoreValueRating,
                                )
                              }
                            >
                              {RATING_OPTIONS.map((opt, optIdx) => (
                                <option key={optIdx} value={opt}>
                                  {opt || "—"}
                                </option>
                              ))}
                            </select>
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleClose()}
            disabled={loading}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
