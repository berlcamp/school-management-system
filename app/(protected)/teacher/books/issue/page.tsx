"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/lib/redux/hook";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { supabase } from "@/lib/supabase/client";
import { getGradeLevelLabel } from "@/lib/constants";
import { BookOpen, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { IssueModal } from "@/app/(protected)/books/issuances/IssueModal";

interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
}

interface AllocatedBook {
  id: string;
  title: string;
  subject_area: string;
  grade_level: number;
  available: number;
}

export default function TeacherBooksIssuePage() {
  const user = useAppSelector((state) => state.user.user);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [sectionId, setSectionId] = useState<string>("");
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [allocatedBooks, setAllocatedBooks] = useState<AllocatedBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [issueModalOpen, setIssueModalOpen] = useState(false);

  const effectiveSchoolId =
    user?.school_id != null ? String(user.school_id) : "";
  const teacherId = user?.system_user_id;

  const fetchSections = useCallback(async () => {
    if (!teacherId || !effectiveSchoolId) {
      setSections([]);
      return;
    }

    const { data: adviserSections } = await supabase
      .from("sms_sections")
      .select("id, name, grade_level")
      .eq("section_adviser_id", teacherId)
      .eq("school_id", effectiveSchoolId)
      .eq("school_year", schoolYear)
      .eq("is_active", true)
      .order("grade_level")
      .order("name");

    const { data: scheduleSections } = await supabase
      .from("sms_subject_schedules")
      .select("section_id")
      .eq("teacher_id", teacherId)
      .eq("school_year", schoolYear);

    const sectionIds = new Set<string>();
    (adviserSections || []).forEach((s) => sectionIds.add(s.id));
    (scheduleSections || []).forEach((s) => sectionIds.add(String(s.section_id)));

    if (sectionIds.size === 0) {
      setSections([]);
      return;
    }

    const { data: sectionList } = await supabase
      .from("sms_sections")
      .select("id, name, grade_level")
      .in("id", Array.from(sectionIds))
      .eq("school_year", schoolYear)
      .eq("is_active", true)
      .order("grade_level")
      .order("name");

    setSections((sectionList || []) as SectionOption[]);
  }, [teacherId, effectiveSchoolId, schoolYear]);

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
      if (!book || (book as { grade_level?: number }).grade_level !== bookGradeLevel) continue;

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
  }, [teacherId, sectionId, schoolYear]);

  useEffect(() => {
    if (effectiveSchoolId && teacherId) {
      setLoading(true);
      fetchSections().finally(() => setLoading(false));
    } else {
      setSections([]);
      setLoading(false);
    }
  }, [effectiveSchoolId, teacherId, schoolYear, fetchSections]);

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
        <Card>
          <CardHeader>
            <CardTitle>Select Section</CardTitle>
            <CardDescription>
              Choose a section and school year, then issue books from your
              allocated pool.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">School Year</label>
                <Select value={schoolYear} onValueChange={setSchoolYear}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getSchoolYearOptions().map((sy) => (
                      <SelectItem key={sy} value={sy}>
                        {sy}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Section</label>
                <Select value={sectionId} onValueChange={setSectionId}>
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {getGradeLevelLabel(s.grade_level)} - {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            </div>
            {sectionId && allocatedBooks.length === 0 && !loading && (
              <p className="mt-2 text-sm text-muted-foreground">
                No allocated books available for this grade level. Ask the book
                manager to allocate books to you.
              </p>
            )}
          </CardContent>
        </Card>
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
