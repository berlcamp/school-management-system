"use client";

import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hook";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { supabase } from "@/lib/supabase/client";
import { getEffectiveSchoolId } from "@/lib/utils/books";
import { useSections } from "@/hooks/useBooks";
import { BookSectionFilter } from "@/app/(protected)/books/_components/BookSectionFilter";
import { BookOpen, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { IssueModal } from "@/app/(protected)/books/_components/IssueModal";

interface AllocatedBook {
  id: string;
  title: string;
  subject_area: string;
  grade_level: number;
  available: number;
}

export default function TeacherBooksIssuePage() {
  const user = useAppSelector((state) => state.user.user);
  const [sectionId, setSectionId] = useState<string>("");
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [allocatedBooks, setAllocatedBooks] = useState<AllocatedBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [issueModalOpen, setIssueModalOpen] = useState(false);

  const effectiveSchoolId = getEffectiveSchoolId(user);
  const teacherId = user?.system_user_id;

  const { data: sections } = useSections(
    effectiveSchoolId,
    schoolYear,
    teacherId,
    true,
  );

  const fetchAllocatedBooks = useCallback(async () => {
    if (!teacherId || !effectiveSchoolId || !sectionId) {
      setAllocatedBooks([]);
      return;
    }

    const { data: section } = await supabase
      .from("sms_sections")
      .select("grade_level")
      .eq("id", sectionId)
      .single();

    const gradeLevel = section?.grade_level ?? 1;
    const bookGradeLevel = gradeLevel === 0 ? 1 : gradeLevel;

    const { data: allocations } = await supabase
      .from("sms_book_allocations")
      .select(
        `
        id,
        quantity,
        book:sms_books(id, title, subject_area, grade_level)
      `,
      )
      .eq("teacher_id", teacherId)
      .eq("school_year", schoolYear);

    if (!allocations || allocations.length === 0) {
      setAllocatedBooks([]);
      return;
    }

    const booksWithAvailable: AllocatedBook[] = [];

    for (const alloc of allocations) {
      const book = Array.isArray(alloc.book) ? alloc.book[0] : alloc.book;
      if (
        !book ||
        (book as { grade_level?: number }).grade_level !== bookGradeLevel
      )
        continue;

      const { count } = await supabase
        .from("sms_book_issuances")
        .select("*", { count: "exact", head: true })
        .eq("book_id", (book as { id: string }).id)
        .eq("issued_by", teacherId)
        .eq("school_year", schoolYear)
        .is("date_returned", null);

      const quantity = (alloc as { quantity: number }).quantity;
      const issuedCount = count ?? 0;
      const available = quantity - issuedCount;

      if (available > 0) {
        booksWithAvailable.push({
          id: (book as { id: string }).id,
          title: (book as { title: string }).title,
          subject_area: (book as { subject_area: string }).subject_area,
          grade_level: (book as { grade_level: number }).grade_level,
          available,
        });
      }
    }

    setAllocatedBooks(booksWithAvailable);
  }, [teacherId, effectiveSchoolId, sectionId, schoolYear]);

  useEffect(() => {
    if (sectionId) {
      fetchAllocatedBooks();
    } else {
      setAllocatedBooks([]);
    }
  }, [sectionId, fetchAllocatedBooks]);

  const handleIssueSuccess = () => {
    fetchAllocatedBooks();
    setIssueModalOpen(false);
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Issue Books
        </h1>
        <div className="app__title_actions">
          <Button variant="outline" size="sm" asChild>
            <Link href="/teacher/books">Back to Books</Link>
          </Button>
        </div>
      </div>

      <div className="app__content space-y-6">
        <BookSectionFilter
          title="Select Section"
          description="Choose a section and school year, then issue books from your allocated pool."
          sections={sections}
          sectionId={sectionId}
          onSectionChange={setSectionId}
          schoolYear={schoolYear}
          onSchoolYearChange={setSchoolYear}
        >
          {sectionId && (
            <div className="flex items-end">
              <Button
                variant="green"
                size="sm"
                onClick={() => setIssueModalOpen(true)}
                disabled={allocatedBooks.length === 0}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Issue Books
              </Button>
            </div>
          )}
        </BookSectionFilter>
        {sectionId && allocatedBooks.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">
            No allocated books available for this grade level. Ask the book
            manager to allocate books to you.
          </p>
        )}
      </div>

      <IssueModal
        isOpen={issueModalOpen}
        onClose={() => setIssueModalOpen(false)}
        sectionId={sectionId}
        schoolYear={schoolYear}
        schoolId={effectiveSchoolId}
        onSuccess={handleIssueSuccess}
        allocatedBooks={allocatedBooks}
      />
    </div>
  );
}
