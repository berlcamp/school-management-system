"use client";

import { LrnLookupResult } from "@/types/database";
import { getGradeLevelLabel } from "@/lib/constants";
import { ArrowLeftRight, Info, User } from "lucide-react";

interface Props {
  student: LrnLookupResult;
  isCurrentSchool: boolean;
}

export default function TransfereeInfoCard({
  student,
  isCurrentSchool,
}: Props) {
  const fullName = [
    student.first_name,
    student.middle_name ? `${student.middle_name.charAt(0)}.` : "",
    student.last_name,
    student.suffix,
  ]
    .filter(Boolean)
    .join(" ");

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (isCurrentSchool) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Student Found</h3>
            <p className="text-sm text-muted-foreground">
              This student is already registered at your school.
              Proceed to enroll for a new school year or section.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <InfoRow label="Name" value={fullName} />
          <InfoRow label="LRN" value={student.lrn} />
          <InfoRow
            label="Date of Birth"
            value={formatDate(student.date_of_birth)}
          />
          <InfoRow label="Gender" value={capitalize(student.gender)} />
          {student.current_grade_level != null && (
            <InfoRow
              label="Current Grade"
              value={getGradeLevelLabel(student.current_grade_level)}
            />
          )}
          {student.current_school_year && (
            <InfoRow label="School Year" value={student.current_school_year} />
          )}
        </div>
      </div>
    );
  }

  const isAlreadyReleased =
    student.enrollment_status === "transferred_out" ||
    student.enrollment_status === "transferred";

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <ArrowLeftRight className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Transferee Detected</h3>
            <p className="text-sm text-muted-foreground">
              {isAlreadyReleased
                ? "This student has been released by their previous school."
                : "This student is currently enrolled at another school."}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <InfoRow label="Name" value={fullName} />
          <InfoRow label="LRN" value={student.lrn} />
          <InfoRow
            label="Date of Birth"
            value={formatDate(student.date_of_birth)}
          />
          <InfoRow label="Gender" value={capitalize(student.gender)} />
          {student.current_grade_level != null && (
            <InfoRow
              label="Last Grade Level"
              value={getGradeLevelLabel(student.current_grade_level)}
            />
          )}
          {student.current_school_name && (
            <InfoRow
              label="Previous School"
              value={student.current_school_name}
            />
          )}
          {student.current_school_year && (
            <InfoRow
              label="Last School Year"
              value={student.current_school_year}
            />
          )}
          {student.enrollment_status && (
            <InfoRow
              label="Enrollment Status"
              value={capitalize(student.enrollment_status.replace(/_/g, " "))}
            />
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border px-4 py-3 text-sm bg-muted/50 text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Completing enrollment will send a record request to the student&apos;s
          previous school. Once they approve, you&apos;ll be able to{" "}
          <span className="font-medium text-foreground">review the student&apos;s records</span>{" "}
          before finalizing enrollment.
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col py-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
