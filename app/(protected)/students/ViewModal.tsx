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
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  onStudentUpdated?: (updates: Partial<Student>) => void;
}

const ACCEPTED_DIPLOMA_TYPES = [".pdf", ".jpg", ".jpeg", ".png"];
const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
];

function getFileExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "pdf";
  return ACCEPTED_DIPLOMA_TYPES.includes(`.${ext}`) ? ext : "pdf";
}

export const ViewModal = ({
  isOpen,
  onClose,
  student,
  onStudentUpdated,
}: ModalProps) => {
  const [section, setSection] = useState<Section | null>(null);
  const [encoderName, setEncoderName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (student?.encoded_by) {
      supabase
        .from("sms_users")
        .select("name")
        .eq("id", student.encoded_by)
        .single()
        .then(({ data }) => setEncoderName(data?.name ?? null));
    } else {
      setEncoderName(null);
    }
  }, [student?.encoded_by]);

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
          {encoderName && (
            <p className="text-xs text-muted-foreground mt-1">
              Encoded by {encoderName}
            </p>
          )}
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
                <p className="text-sm font-medium">
                  {student.purok}, {student.barangay},{" "}
                  {student.municipality_city}, {student.province}
                </p>
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

          {/* Diploma */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">Diploma</h3>
            {student.diploma_file_path ? (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Diploma uploaded
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const { data } = await supabase.storage
                        .from("diplomas")
                        .createSignedUrl(student.diploma_file_path!, 3600);
                      if (data?.signedUrl) {
                        window.open(data.signedUrl, "_blank");
                      } else {
                        toast.error("Failed to open diploma");
                      }
                    }}
                  >
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={removing}
                    onClick={async () => {
                      if (!confirm("Remove diploma from this student?")) return;
                      setRemoving(true);
                      try {
                        const { error: delErr } = await supabase.storage
                          .from("diplomas")
                          .remove([student.diploma_file_path!]);
                        if (delErr) throw delErr;
                        const { error: updErr } = await supabase
                          .from("sms_students")
                          .update({ diploma_file_path: null })
                          .eq("id", student.id);
                        if (updErr) throw updErr;
                        toast.success("Diploma removed");
                        onStudentUpdated?.({ diploma_file_path: null });
                      } catch (err) {
                        toast.error("Failed to remove diploma");
                      } finally {
                        setRemoving(false);
                      }
                    }}
                  >
                    {removing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_MIME.join(",")}
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !student) return;
                    const ext = getFileExtension(file.name);
                    const path = `${student.school_id ?? "default"}/${student.id}/diploma.${ext}`;
                    setUploading(true);
                    try {
                      const { error: uploadErr } = await supabase.storage
                        .from("diplomas")
                        .upload(path, file, {
                          upsert: true,
                          contentType: file.type,
                        });
                      if (uploadErr) throw uploadErr;
                      const { error: updErr } = await supabase
                        .from("sms_students")
                        .update({ diploma_file_path: path })
                        .eq("id", student.id);
                      if (updErr) throw updErr;
                      toast.success("Diploma uploaded");
                      onStudentUpdated?.({ diploma_file_path: path });
                    } catch (err) {
                      toast.error("Failed to upload diploma");
                    } finally {
                      setUploading(false);
                      e.target.value = "";
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploading ? " Uploading..." : " Upload Diploma (PDF or Image)"}
                </Button>
              </div>
            )}
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
