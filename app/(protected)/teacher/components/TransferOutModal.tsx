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
import { Textarea } from "@/components/ui/textarea";
import { getGradeLevelLabel } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { Student } from "@/types";
import { ArrowLeftRight, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface School {
  id: string;
  name: string;
}

interface TransferOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  enrollmentId: string;
  gradeLevel: number;
  schoolYear: string;
  schoolId: string | null;
  onUpdated: () => void;
}

export function TransferOutModal({
  isOpen,
  onClose,
  student,
  enrollmentId,
  gradeLevel,
  schoolYear,
  schoolId,
  onUpdated,
}: TransferOutModalProps) {
  const [transferDate, setTransferDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  // Destination school search
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [searchingSchools, setSearchingSchools] = useState(false);

  const studentName = `${student.last_name}, ${student.first_name}${student.middle_name ? ` ${student.middle_name}` : ""}`;

  const resetForm = () => {
    setTransferDate(new Date().toISOString().split("T")[0]);
    setRemarks("");
    setSchoolSearch("");
    setSchools([]);
    setSelectedSchool(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Search schools
  const searchSchools = useCallback(
    async (query: string) => {
      if (query.trim().length < 2) {
        setSchools([]);
        return;
      }

      setSearchingSchools(true);
      try {
        let q = supabase
          .from("sms_schools")
          .select("id, name")
          .ilike("name", `%${query.trim()}%`)
          .order("name")
          .limit(10);

        // Exclude current school
        if (schoolId) {
          q = q.neq("id", schoolId);
        }

        const { data } = await q;
        setSchools(data || []);
      } catch {
        setSchools([]);
      } finally {
        setSearchingSchools(false);
      }
    },
    [schoolId]
  );

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (schoolSearch.trim().length >= 2 && !selectedSchool) {
        searchSchools(schoolSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [schoolSearch, isOpen, searchSchools, selectedSchool]);

  const canSubmit = transferDate && remarks.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSaving(true);
    try {
      // Update enrollment status to transferred_out
      const { error: enrollmentError } = await supabase
        .from("sms_enrollments")
        .update({
          enrollment_status: "transferred_out",
          date_dropped: transferDate,
          remarks: `Transfer Out: ${remarks.trim()}${selectedSchool ? ` (Destination: ${selectedSchool.name})` : ""}`,
          ...(selectedSchool && {
            transfer_destination_school_id: selectedSchool.id,
          }),
          transfer_date: transferDate,
        })
        .eq("id", enrollmentId);

      if (enrollmentError) throw enrollmentError;

      // Update student record
      const { error: studentError } = await supabase
        .from("sms_students")
        .update({
          enrollment_status: "transferred",
          current_section_id: null,
        })
        .eq("id", student.id);

      if (studentError) throw studentError;

      toast.success(
        `${student.first_name} ${student.last_name} marked as transferred out`
      );
      handleClose();
      onUpdated();
    } catch (error) {
      console.error("Error processing transfer out:", error);
      toast.error("Failed to process transfer out");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <ArrowLeftRight className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <DialogTitle>Transfer Out</DialogTitle>
              <DialogDescription>
                {studentName} &mdash; {getGradeLevelLabel(gradeLevel)},{" "}
                {schoolYear}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Destination School (optional) */}
          <div className="space-y-2">
            <Label htmlFor="destination-school">
              Destination School{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            {selectedSchool ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
                <span className="flex-1 font-medium">
                  {selectedSchool.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    setSelectedSchool(null);
                    setSchoolSearch("");
                    setSchools([]);
                  }}
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="destination-school"
                  type="text"
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="Search for a school..."
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                />
                {searchingSchools && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {schools.length > 0 && !selectedSchool && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                    {schools.map((school) => (
                      <button
                        key={school.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                        onClick={() => {
                          setSelectedSchool(school);
                          setSchoolSearch(school.name);
                          setSchools([]);
                        }}
                      >
                        {school.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Transfer Date */}
          <div className="space-y-2">
            <Label htmlFor="transfer-date">Transfer Date</Label>
            <input
              id="transfer-date"
              type="date"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
            />
          </div>

          {/* Remarks */}
          <div className="space-y-2">
            <Label htmlFor="transfer-remarks">Remarks</Label>
            <Textarea
              id="transfer-remarks"
              placeholder="Reason for transfer..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
            />
          </div>

          {/* Info box */}
          <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            <p>
              This will mark the student as <strong>Transferred Out</strong>.
              The student will be removed from the active section roster. When
              the destination school enrolls this student via LRN lookup, no
              record request will be needed.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Transfer Out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
