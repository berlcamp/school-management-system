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
  generateReportCardPrint,
  type CoreValueRating,
  type CoreValuesData,
  type ReportCardDesign,
} from "@/lib/pdf/generateReportCard";
import { supabase } from "@/lib/supabase/client";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";

interface PrintCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  schoolId: string;
  sectionId: string;
  schoolYear: string;
}

const CORE_VALUE_STATEMENTS = [
  { key: "makaDiyos1" as const, coreValue: "Maka-Diyos", statement: "Expresses one's spiritual beliefs while respecting the spiritual beliefs of others" },
  { key: "makaDiyos2" as const, coreValue: "Maka-Diyos", statement: "Shows adherence to ethical principles by upholding truth" },
  { key: "makatao1" as const, coreValue: "Makatao", statement: "Is sensitive to individual, social and cultural differences" },
  { key: "makatao2" as const, coreValue: "Makatao", statement: "Demonstrates contributions toward solidarity" },
  { key: "makakalikasan1" as const, coreValue: "Maka-kalikasan", statement: "Cares for the environment and utilizes resources wisely" },
  { key: "makabansa1" as const, coreValue: "Makabansa", statement: "Demonstrates pride in being a Filipino; exercises the rights and responsibilities of a Filipino citizen" },
  { key: "makabansa2" as const, coreValue: "Makabansa", statement: "Demonstrates appropriate behavior in carrying out activities in the school, community and country" },
] as const;

const RATING_OPTIONS: CoreValueRating[] = ["", "AO", "SO", "RO", "NO"];

const DEFAULT_CORE_VALUES: CoreValuesData = {
  makaDiyos1: ["", "", "", ""],
  makaDiyos2: ["", "", "", ""],
  makatao1: ["", "", "", ""],
  makatao2: ["", "", "", ""],
  makakalikasan1: ["", "", "", ""],
  makabansa1: ["", "", "", ""],
  makabansa2: ["", "", "", ""],
};

export function PrintCardModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  schoolId,
  sectionId,
  schoolYear,
}: PrintCardModalProps) {
  const [design, setDesign] = useState<ReportCardDesign>("3-fold");
  const [coreValues, setCoreValues] = useState<CoreValuesData>({ ...DEFAULT_CORE_VALUES });
  const [printing, setPrinting] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load saved values from DB when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoading(true);
    supabase
      .from("sms_report_card_core_values")
      .select("core_values, card_design")
      .eq("student_id", studentId)
      .eq("school_year", schoolYear)
      .maybeSingle()
      .then(({ data }) => {
        if (!isMounted) return;
        if (data) {
          setCoreValues((data.core_values as CoreValuesData) ?? { ...DEFAULT_CORE_VALUES });
          setDesign((data.card_design as ReportCardDesign) ?? "3-fold");
        } else {
          setCoreValues({ ...DEFAULT_CORE_VALUES });
          setDesign("3-fold");
        }
        setLoading(false);
      });
    return () => { isMounted = false; };
  }, [isOpen, studentId, schoolYear]);

  const handleRatingChange = (key: keyof CoreValuesData, quarter: number, value: CoreValueRating) => {
    setCoreValues((prev) => {
      const updated = { ...prev };
      const tuple = [...prev[key]] as [CoreValueRating, CoreValueRating, CoreValueRating, CoreValueRating];
      tuple[quarter] = value;
      updated[key] = tuple;
      return updated;
    });
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      // Upsert core values and design to DB
      await supabase
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
    } finally {
      setPrinting(false);
      onClose();
    }
  };

  // Group statements by core value for display
  let lastCoreValue = "";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Print Report Card</DialogTitle>
          <DialogDescription>{studentName}</DialogDescription>
        </DialogHeader>

        {/* Design Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Card Design</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={design === "3-fold" ? "default" : "outline"}
              size="sm"
              onClick={() => setDesign("3-fold")}
            >
              3 Fold
            </Button>
            <Button
              type="button"
              variant={design === "2-fold" ? "default" : "outline"}
              size="sm"
              onClick={() => setDesign("2-fold")}
            >
              2 Fold
            </Button>
          </div>
        </div>

        {/* Core Values */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Core Values (Observed Values)</Label>
          <p className="text-xs text-muted-foreground">
            AO = Always Observed, SO = Sometimes Observed, RO = Rarely Observed, NO = Not Observed
          </p>
          <div className="rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-2 py-1.5 text-left font-medium">Core Value</th>
                  <th className="px-2 py-1.5 text-left font-medium">Behavior Statement</th>
                  <th className="px-2 py-1.5 text-center font-medium w-16">Q1</th>
                  <th className="px-2 py-1.5 text-center font-medium w-16">Q2</th>
                  <th className="px-2 py-1.5 text-center font-medium w-16">Q3</th>
                  <th className="px-2 py-1.5 text-center font-medium w-16">Q4</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">
                      Loading...
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
                              onChange={(e) => handleRatingChange(item.key, q, e.target.value as CoreValueRating)}
                            >
                              {RATING_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
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
          <Button type="button" variant="outline" onClick={onClose} disabled={printing || loading}>
            Cancel
          </Button>
          <Button type="button" onClick={handlePrint} disabled={printing || loading}>
            <Printer className="mr-2 h-4 w-4" />
            {printing ? "Printing..." : "Print"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
