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
import { supabase } from "@/lib/supabase/client";
import { Section, SectionSubject, Subject } from "@/types";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: Section | null;
}

export const ManageSubjectsModal = ({
  isOpen,
  onClose,
  section,
}: ModalProps) => {
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sectionSubjects, setSectionSubjects] = useState<SectionSubject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    if (isOpen && section) {
      fetchSubjects();
      fetchSectionSubjects();
    }
  }, [isOpen, section]);

  const fetchSubjects = async () => {
    if (!section) return;

    const { data, error } = await supabase
      .from("sms_subjects")
      .select("*")
      .eq("grade_level", section.grade_level)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("code")
      .order("name");

    if (!error && data) {
      setSubjects(data);
    }
  };

  const fetchSectionSubjects = async () => {
    if (!section) return;

    const { data, error } = await supabase
      .from("sms_section_subjects")
      .select("*")
      .eq("section_id", section.id)
      .eq("school_year", section.school_year);

    if (!error && data) {
      setSectionSubjects(data);
    }
  };

  useEffect(() => {
    if (subjects.length > 0 && sectionSubjects.length > 0) {
      const assignedSubjectIds = new Set(
        sectionSubjects.map((ss) => ss.subject_id),
      );
      const available = subjects.filter((s) => !assignedSubjectIds.has(s.id));
      setAvailableSubjects(available);
    } else if (subjects.length > 0) {
      setAvailableSubjects(subjects);
    }
  }, [subjects, sectionSubjects]);

  const handleAddSubject = async () => {
    if (!selectedSubjectId || !section) return;

    setLoading(true);
    try {
      // Check if subject is already assigned to this section
      const existing = sectionSubjects.find(
        (ss) => ss.subject_id === selectedSubjectId,
      );

      if (existing) {
        toast.error("Subject is already assigned to this section");
        setLoading(false);
        return;
      }

      // Add subject to section
      const { error } = await supabase.from("sms_section_subjects").insert({
        section_id: section.id,
        subject_id: selectedSubjectId,
        school_year: section.school_year,
      });

      if (error) throw error;

      toast.success("Subject added to section successfully!");
      setSelectedSubjectId("");
      fetchSectionSubjects();
    } catch (err) {
      console.error("Error adding subject:", err);
      toast.error("Failed to add subject to section");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSubject = async (sectionSubjectId: string) => {
    if (!section) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("sms_section_subjects")
        .delete()
        .eq("id", sectionSubjectId);

      if (error) throw error;

      toast.success("Subject removed from section successfully!");
      fetchSectionSubjects();
    } catch (err) {
      console.error("Error removing subject:", err);
      toast.error("Failed to remove subject from section");
    } finally {
      setLoading(false);
    }
  };

  const getSubjectName = (subjectId: string) => {
    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject) return "-";
    return `${subject.code} - ${subject.name}`;
  };

  const getSubjectDescription = (subjectId: string) => {
    const subject = subjects.find((s) => s.id === subjectId);
    return subject?.description || "-";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Manage Subjects - {section?.name}
          </DialogTitle>
          <DialogDescription>
            Add or remove subjects from this section. Only subjects matching the
            section's grade level are available.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Add Subject */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Add Subject</label>
            <div className="flex gap-2">
              <Select
                value={selectedSubjectId}
                onValueChange={setSelectedSubjectId}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select subject to add" />
                </SelectTrigger>
                <SelectContent>
                  {availableSubjects.length === 0 ? (
                    <SelectItem value="no-options" disabled>
                      No available subjects
                    </SelectItem>
                  ) : (
                    availableSubjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.code} - {subject.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddSubject}
                disabled={!selectedSubjectId || loading}
                size="sm"
              >
                Add
              </Button>
            </div>
          </div>

          {/* Subjects List */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Subjects in Section ({sectionSubjects.length})
            </label>
            <div className="border rounded-md">
              {sectionSubjects.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No subjects assigned to this section
                </div>
              ) : (
                <div className="divide-y">
                  {sectionSubjects.map((ss) => (
                    <div
                      key={ss.id}
                      className="p-3 flex items-center justify-between hover:bg-muted/50"
                    >
                      <div className="flex-1">
                        <div className="font-medium">
                          {getSubjectName(ss.subject_id)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {getSubjectDescription(ss.subject_id)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSubject(ss.id)}
                        disabled={loading}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
