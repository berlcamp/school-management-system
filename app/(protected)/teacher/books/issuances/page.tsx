"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { getEffectiveSchoolId } from "@/lib/utils/books";
import { useSections, useIssuances, type IssuanceRow } from "@/hooks/useBooks";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BookSectionFilter } from "@/app/(protected)/books/_components/BookSectionFilter";
import { IssuanceTable } from "@/app/(protected)/books/_components/IssuanceTable";
import { ReturnModal } from "@/app/(protected)/books/_components/ReturnModal";

export default function TeacherIssuancesPage() {
  const user = useAppSelector((state) => state.user.user);
  const effectiveSchoolId = getEffectiveSchoolId(user);
  const teacherId = user?.system_user_id;

  const [sectionId, setSectionId] = useState<string>("");
  const [schoolYear, setSchoolYear] = useState<string>(getCurrentSchoolYear());
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [selectedIssuance, setSelectedIssuance] = useState<IssuanceRow | null>(null);

  const { data: sections } = useSections(
    effectiveSchoolId,
    schoolYear,
    teacherId,
    true,
  );

  const {
    data: issuances,
    loading,
    refetch: refetchIssuances,
  } = useIssuances(sectionId, schoolYear);

  const handleReturnClick = (row: IssuanceRow) => {
    if (row.date_returned) return;
    setSelectedIssuance(row);
    setReturnModalOpen(true);
  };

  const handleReturnSuccess = () => {
    refetchIssuances();
    setReturnModalOpen(false);
    setSelectedIssuance(null);
  };

  const selectedSection = sections.find((s) => s.id === sectionId);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Books Issued / Returned
        </h1>
        <div className="app__title_actions">
          <Button variant="outline" size="sm" asChild>
            <Link href="/teacher/books">Back to Books</Link>
          </Button>
        </div>
      </div>

      <div className="app__content space-y-6">
        <BookSectionFilter
          description="Select a section you advise and school year to view book issuances."
          sections={sections}
          sectionId={sectionId}
          onSectionChange={setSectionId}
          schoolYear={schoolYear}
          onSchoolYearChange={(sy) => {
            setSchoolYear(sy);
            setSectionId("");
          }}
        />

        <IssuanceTable
          issuances={issuances}
          loading={loading}
          sectionId={sectionId}
          schoolYear={schoolYear}
          selectedSection={selectedSection}
          isTeacher={true}
          currentUserId={user?.system_user_id}
          onReturnClick={handleReturnClick}
        />
      </div>

      <ReturnModal
        isOpen={returnModalOpen}
        onClose={() => {
          setReturnModalOpen(false);
          setSelectedIssuance(null);
        }}
        issuance={selectedIssuance}
        onSuccess={handleReturnSuccess}
      />
    </div>
  );
}
