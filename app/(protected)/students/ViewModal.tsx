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
import { supabase } from "@/lib/supabase/client";
import { Section, Student } from "@/types";
import { useEffect, useState } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
}

export const ViewModal = ({ isOpen, onClose, student }: ModalProps) => {
  const [section, setSection] = useState<Section | null>(null);

  useEffect(() => {
    if (student?.current_section_id) {
      const fetchSection = async () => {
        const { data } = await supabase
          .from("sms_sections")
          .select("*")
          .eq("id", student.current_section_id)
          .single();

        if (data) {
          setSection(data);
        }
      };

      fetchSection();
    } else {
      setSection(null);
    }
  }, [student?.current_section_id]);

  if (!student) return null;

  const getFullName = () => {
    return `${student.last_name}, ${student.first_name}${
      student.middle_name ? ` ${student.middle_name}` : ""
    }${student.suffix ? ` ${student.suffix}` : ""}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Student Information
          </DialogTitle>
          <DialogDescription>
            View complete student profile and details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">LRN</label>
                <p className="text-sm font-medium font-mono">{student.lrn}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Full Name
                </label>
                <p className="text-sm font-medium">{getFullName()}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Date of Birth
                </label>
                <p className="text-sm font-medium">
                  {new Date(student.date_of_birth).toLocaleDateString()}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Gender</label>
                <p className="text-sm font-medium capitalize">
                  {student.gender}
                </p>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Address</label>
                <p className="text-sm font-medium">{student.address}</p>
              </div>
              {student.contact_number && (
                <div>
                  <label className="text-xs text-muted-foreground">
                    Contact Number
                  </label>
                  <p className="text-sm font-medium">
                    {student.contact_number}
                  </p>
                </div>
              )}
              {student.email && (
                <div>
                  <label className="text-xs text-muted-foreground">Email</label>
                  <p className="text-sm font-medium">{student.email}</p>
                </div>
              )}
            </div>
          </div>

          {/* Parent/Guardian Information */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">
              Parent/Guardian Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <p className="text-sm font-medium">
                  {student.parent_guardian_name}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Contact</label>
                <p className="text-sm font-medium">
                  {student.parent_guardian_contact}
                </p>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">
                  Relationship
                </label>
                <p className="text-sm font-medium">
                  {student.parent_guardian_relationship}
                </p>
              </div>
            </div>
          </div>

          {/* Enrollment Information */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">
              Enrollment Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <p className="text-sm font-medium capitalize">
                  {student.enrollment_status}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Current Section
                </label>
                <p className="text-sm font-medium">
                  {section ? section.name : "No section assigned"}
                </p>
              </div>
              {student.enrolled_at && (
                <div>
                  <label className="text-xs text-muted-foreground">
                    Enrolled At
                  </label>
                  <p className="text-sm font-medium">
                    {new Date(student.enrolled_at).toLocaleDateString()}
                  </p>
                </div>
              )}
              {student.previous_school && (
                <div>
                  <label className="text-xs text-muted-foreground">
                    Previous School
                  </label>
                  <p className="text-sm font-medium">
                    {student.previous_school}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
