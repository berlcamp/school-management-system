"use client";

import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hook";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { getEffectiveSchoolId } from "@/lib/utils/books";
import { useSections, useIssuances, type IssuanceRow } from "@/hooks/useBooks";
import { BookOpen, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BookSectionFilter } from "../_components/BookSectionFilter";
import { IssuanceTable } from "../_components/IssuanceTable";
import { IssueModal } from "../_components/IssueModal";
import { ReturnModal } from "../_components/ReturnModal";

export default function IssuancesPage() {
  const user = useAppSelector((state) => state.user.user);
  const isTeacher = user?.type === "teacher";
  const effectiveSchoolId = getEffectiveSchoolId(user);

  const [sectionId, setSectionId] = useState<string>("");
  const [schoolYear, setSchoolYear] = useState<string>(getCurrentSchoolYear());
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [selectedIssuance, setSelectedIssuance] = useState<IssuanceRow | null>(
    null,
  );

  const { data: sections } = useSections(effectiveSchoolId, schoolYear);
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

  const handleIssueSuccess = () => {
    refetchIssuances();
    setIssueModalOpen(false);
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
            <Link href="/books">Back to Books</Link>
          </Button>
        </div>
      </div>

      <div className="app__content space-y-6">
        <BookSectionFilter
          sections={sections}
          sectionId={sectionId}
          onSectionChange={setSectionId}
          schoolYear={schoolYear}
          onSchoolYearChange={setSchoolYear}
        >
          {sectionId && !isTeacher && (
            <div className="flex items-end">
              <Button
                variant="green"
                size="sm"
                onClick={() => setIssueModalOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Issue Books
              </Button>
            </div>
          )}
        </BookSectionFilter>

        <IssuanceTable
          issuances={issuances}
          loading={loading}
          sectionId={sectionId}
          schoolYear={schoolYear}
          selectedSection={selectedSection}
          isTeacher={isTeacher}
          currentUserId={user?.system_user_id}
          onReturnClick={handleReturnClick}
        />
      </div>

      <IssueModal
        isOpen={issueModalOpen}
        onClose={() => setIssueModalOpen(false)}
        sectionId={sectionId}
        schoolYear={schoolYear}
        schoolId={effectiveSchoolId}
        onSuccess={handleIssueSuccess}
      />

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
