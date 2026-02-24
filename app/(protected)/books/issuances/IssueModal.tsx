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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";

interface StudentOption {
  id: string;
  fullName: string;
}

interface BookOption {
  id: string;
  title: string;
  subject_area: string;
  grade_level: number;
}

interface IssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  sectionId: string;
  schoolYear: string;
  schoolId: string;
  onSuccess: () => void;
}

export const IssueModal = ({
  isOpen,
  onClose,
  sectionId,
  schoolYear,
  schoolId,
  onSuccess,
}: IssueModalProps) => {
  const user = useAppSelector((state) => state.user.user);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [books, setBooks] = useState<BookOption[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const [dateIssued, setDateIssued] = useState<string>(() =>
    new Date().toISOString().split("T")[0],
  );

  const fetchStudents = useCallback(async () => {
    if (!sectionId || !schoolId) return;

    const { data: enrollments } = await supabase
      .from("sms_enrollments")
      .select("student_id")
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .eq("status", "approved");

    const ids = [...new Set((enrollments || []).map((e) => e.student_id))];
    if (ids.length === 0) {
      setStudents([]);
      return;
    }

    const { data: section } = await supabase
      .from("sms_sections")
      .select("grade_level")
      .eq("id", sectionId)
      .single();

    const gradeLevel = section?.grade_level ?? 1;

    const { data: studentList } = await supabase
      .from("sms_students")
      .select("id, first_name, middle_name, last_name, suffix")
      .in("id", ids)
      .order("last_name")
      .order("first_name");

    setStudents(
      (studentList || []).map((s) => ({
        id: s.id,
        fullName: `${s.last_name}, ${s.first_name} ${s.middle_name || ""} ${s.suffix || ""}`.trim(),
      })),
    );
  }, [sectionId, schoolYear, schoolId]);

  const fetchBooks = useCallback(async () => {
    if (!sectionId || !schoolId) return;

    const { data: section } = await supabase
      .from("sms_sections")
      .select("grade_level")
      .eq("id", sectionId)
      .single();

    const gradeLevel = section?.grade_level ?? 1;
    const bookGradeLevel = gradeLevel === 0 ? 1 : gradeLevel;

    const { data: bookList } = await supabase
      .from("sms_books")
      .select("id, title, subject_area, grade_level")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .eq("grade_level", bookGradeLevel)
      .order("subject_area")
      .order("title");

    setBooks(
      (bookList || []).map((b) => ({
        id: b.id,
        title: b.title,
        subject_area: b.subject_area,
        grade_level: b.grade_level,
      })),
    );
  }, [sectionId, schoolId]);

  useEffect(() => {
    if (isOpen && sectionId && schoolId) {
      setLoading(true);
      Promise.all([fetchStudents(), fetchBooks()]).finally(() =>
        setLoading(false),
      );
      setSelectedStudentIds(new Set());
      setSelectedBookIds(new Set());
      setDateIssued(new Date().toISOString().split("T")[0]);
    }
  }, [isOpen, sectionId, schoolId, fetchStudents, fetchBooks]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBook = (id: string) => {
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllStudents = () => {
    if (selectedStudentIds.size === students.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(students.map((s) => s.id)));
    }
  };

  const selectAllBooks = () => {
    if (selectedBookIds.size === books.length) {
      setSelectedBookIds(new Set());
    } else {
      setSelectedBookIds(new Set(books.map((b) => b.id)));
    }
  };

  const handleSubmit = async () => {
    if (selectedStudentIds.size === 0 || selectedBookIds.size === 0) {
      toast.error("Select at least one student and one book");
      return;
    }
    if (!user?.system_user_id) {
      toast.error("User not found");
      return;
    }

    setSubmitting(true);
    try {
      const rows: {
        student_id: string;
        book_id: string;
        section_id: string;
        school_id: string;
        school_year: string;
        date_issued: string;
        issued_by: number;
      }[] = [];

      for (const studentId of selectedStudentIds) {
        for (const bookId of selectedBookIds) {
          rows.push({
            student_id: studentId,
            book_id: bookId,
            section_id: sectionId,
            school_id: schoolId,
            school_year: schoolYear,
            date_issued: dateIssued,
            issued_by: user.system_user_id,
          });
        }
      }

      const { error } = await supabase
        .from("sms_book_issuances")
        .upsert(rows, {
          onConflict: "student_id,book_id,section_id,school_year",
          ignoreDuplicates: true,
        });

      if (error) {
        if (error.code === "23505") {
          toast.error("Some books are already issued to selected students");
        } else {
          throw error;
        }
      } else {
        toast.success(
          `Successfully issued ${rows.length} book(s) to ${selectedStudentIds.size} student(s)`,
        );
        onSuccess();
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to issue books");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Issue Books</DialogTitle>
          <DialogDescription>
            Select students and books, then choose the issuance date.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Date Issued</Label>
            </div>
            <input
              type="date"
              value={dateIssued}
              onChange={(e) => setDateIssued(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Students</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={selectAllStudents}
                >
                  {selectedStudentIds.size === students.length
                    ? "Deselect all"
                    : "Select all"}
                </Button>
              </div>
              <div className="border rounded-md max-h-[200px] overflow-y-auto divide-y">
                {loading ? (
                  <div className="p-4 flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                ) : students.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No enrolled students in this section
                  </div>
                ) : (
                  students.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 p-2 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedStudentIds.has(s.id)}
                        onChange={() => toggleStudent(s.id)}
                      />
                      <span className="text-sm">{s.fullName}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Books</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={selectAllBooks}
                >
                  {selectedBookIds.size === books.length
                    ? "Deselect all"
                    : "Select all"}
                </Button>
              </div>
              <div className="border rounded-md max-h-[200px] overflow-y-auto divide-y">
                {loading ? (
                  <div className="p-4 flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                ) : books.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No books for this grade level. Add books in the Books catalog.
                  </div>
                ) : (
                  books.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 p-2 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedBookIds.has(b.id)}
                        onChange={() => toggleBook(b.id)}
                      />
                      <div>
                        <span className="text-sm font-medium">{b.title}</span>
                        <span className="text-xs text-muted-foreground ml-1">
                          ({b.subject_area})
                        </span>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Issuing...
              </>
            ) : (
              "Issue Books"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
