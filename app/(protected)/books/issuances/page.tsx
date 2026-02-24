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
import { BookOpen, Loader2, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { IssueModal } from "./IssueModal";
import { ReturnModal } from "./ReturnModal";
interface SectionOption {
  id: string;
  name: string;
  grade_level: number;
  school_id: string | null;
}

interface IssuanceRow {
  id: string;
  student_id: string;
  book_id: string;
  section_id: string;
  school_year: string;
  date_issued: string;
  date_returned?: string | null;
  condition_on_return?: string | null;
  return_code?: string | null;
  remarks?: string | null;
  book?: { id: string; title: string; subject_area: string };
  student?: {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    gender: string;
  };
  section?: { id: string; name: string; grade_level: number };
}

export default function IssuancesPage() {
  const user = useAppSelector((state) => state.user.user);

  const [sections, setSections] = useState<SectionOption[]>([]);
  const [sectionId, setSectionId] = useState<string>("");
  const [schoolYear, setSchoolYear] = useState<string>(getCurrentSchoolYear());
  const [issuances, setIssuances] = useState<IssuanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [selectedIssuance, setSelectedIssuance] = useState<IssuanceRow | null>(
    null,
  );

  const effectiveSchoolId = (user?.school_id as string | undefined) ?? "";

  const fetchSections = useCallback(async () => {
    if (!effectiveSchoolId) {
      setSections([]);
      return;
    }
    const { data } = await supabase
      .from("sms_sections")
      .select("id, name, grade_level, school_id")
      .eq("school_id", effectiveSchoolId)
      .eq("school_year", schoolYear)
      .eq("is_active", true)
      .order("grade_level")
      .order("name");
    setSections(data || []);
  }, [effectiveSchoolId, schoolYear]);

  const fetchIssuances = useCallback(async () => {
    if (!sectionId) {
      setIssuances([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("sms_book_issuances")
      .select(
        `
        *,
        book:sms_books(id, title, subject_area),
        student:sms_students!sms_book_issuances_student_id_fkey(id, first_name, middle_name, last_name, suffix, gender),
        section:sms_sections!sms_book_issuances_section_id_fkey(id, name, grade_level)
      `,
      )
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .order("date_issued", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      toast.error("Failed to load issuances");
      setIssuances([]);
    } else {
      setIssuances(data || []);
    }
    setLoading(false);
  }, [sectionId, schoolYear]);

  useEffect(() => {
    if (effectiveSchoolId) {
      fetchSections();
    } else {
      setSections([]);
    }
  }, [effectiveSchoolId, schoolYear, fetchSections]);

  useEffect(() => {
    if (sectionId) {
      fetchIssuances();
    } else {
      setIssuances([]);
      setLoading(false);
    }
  }, [sectionId, schoolYear, fetchIssuances]);

  const getStudentName = (row: IssuanceRow) => {
    const s = row.student;
    if (!s) return "—";
    return `${s.last_name}, ${s.first_name}${s.middle_name ? ` ${s.middle_name}` : ""}${s.suffix ? ` ${s.suffix}` : ""}`.trim();
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleReturnClick = (row: IssuanceRow) => {
    if (row.date_returned) return;
    setSelectedIssuance(row);
    setReturnModalOpen(true);
  };

  const handleIssueSuccess = () => {
    fetchIssuances();
    setIssueModalOpen(false);
  };

  const handleReturnSuccess = () => {
    fetchIssuances();
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
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Select section and school year to view and manage book issuances
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
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Issue Books
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Issuance Records</CardTitle>
            <CardDescription>
              {sectionId
                ? `Books issued and returned for ${selectedSection ? `${getGradeLevelLabel(selectedSection.grade_level)} - ${selectedSection.name}` : ""} (${schoolYear})`
                : "Select a section to view issuance records"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!sectionId ? (
              <div className="py-12 text-center text-muted-foreground">
                Select a section and school year to view book issuances.
              </div>
            ) : loading ? (
              <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading...
              </div>
            ) : issuances.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No book issuances yet. Click &quot;Issue Books&quot; to record
                book issuance for this section.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="app__table">
                  <thead className="app__table_thead">
                    <tr>
                      <th className="app__table_th">No.</th>
                      <th className="app__table_th">Learner Name</th>
                      <th className="app__table_th">Grade</th>
                      <th className="app__table_th">Section</th>
                      <th className="app__table_th">Book Title</th>
                      <th className="app__table_th">Date Issued</th>
                      <th className="app__table_th">Date Returned</th>
                      <th className="app__table_th">Condition</th>
                      <th className="app__table_th">Return Code</th>
                      <th className="app__table_th_right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="app__table_tbody">
                    {issuances.map((row, idx) => (
                      <tr key={row.id} className="app__table_tr">
                        <td className="app__table_td">{idx + 1}</td>
                        <td className="app__table_td">
                          <div className="app__table_cell_text">
                            <div className="app__table_cell_title">
                              {getStudentName(row)}
                            </div>
                          </div>
                        </td>
                        <td className="app__table_td">
                          {row.section
                            ? getGradeLevelLabel(row.section.grade_level)
                            : "—"}
                        </td>
                        <td className="app__table_td">
                          {row.section?.name ?? "—"}
                        </td>
                        <td className="app__table_td">
                          <div className="app__table_cell_text">
                            <div className="app__table_cell_title">
                              {row.book?.title ?? "—"}
                            </div>
                            {row.book?.subject_area && (
                              <div className="app__table_cell_subtitle">
                                {row.book.subject_area}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="app__table_td">
                          {formatDate(row.date_issued)}
                        </td>
                        <td className="app__table_td">
                          {row.date_returned
                            ? formatDate(row.date_returned)
                            : row.return_code || "—"}
                        </td>
                        <td className="app__table_td">
                          {row.condition_on_return || "—"}
                        </td>
                        <td className="app__table_td">
                          {row.return_code ? (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                              {row.return_code}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="app__table_td_actions">
                          {!row.date_returned && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReturnClick(row)}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Return
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
