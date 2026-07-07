"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import {
  ASSESSMENT_PHASES,
  CRLA_LANGUAGES,
  getGradeLevelLabel,
} from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import {
  CrlaRecordForm,
  CrlaRecordFormLine,
  CrlaRecordFormObservation,
  Student,
} from "@/types";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AdviserSection } from "../page";
import { CrlaRecordFormModal } from "./CrlaRecordFormModal";

interface Summary {
  recorded: boolean;
  observation_level: number | null;
}

interface Props {
  teacherId: number;
  teacherName: string;
  schoolId: number | null;
}

export function CrlaRecordFormPanel({ teacherId, teacherName, schoolId }: Props) {
  const user = useAppSelector((state) => state.user.user);
  const [sections, setSections] = useState<AdviserSection[]>([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [language, setLanguage] = useState<string>(CRLA_LANGUAGES[0]);
  const [phase, setPhase] = useState("BoSY");
  const [forms, setForms] = useState<CrlaRecordForm[]>([]);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [lines, setLines] = useState<CrlaRecordFormLine[]>([]);
  const [observations, setObservations] = useState<CrlaRecordFormObservation[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [summary, setSummary] = useState<Record<string, Summary>>({});
  const [loading, setLoading] = useState(false);
  const [modalStudent, setModalStudent] = useState<Student | null>(null);

  const { settings } = useSchoolSettings(true, user?.school_id);
  const locked =
    schoolYear !== getCurrentSchoolYear() &&
    !settings.allow_edit_previous_school_year;

  const section = sections.find((s) => s.id === selectedSection) || null;
  const form = forms.find((f) => String(f.id) === selectedFormId) || null;

  // Adviser (or all, for super admins) Grade 1-3 sections.
  const fetchSections = useCallback(async () => {
    if (!user?.system_user_id || !schoolYear) {
      setSections([]);
      return;
    }
    const isSuperAdmin = user.type === "super admin";
    let query = supabase
      .from("sms_sections")
      .select("id, name, grade_level, school_id")
      .eq("school_year", schoolYear)
      .eq("is_active", true)
      .in("grade_level", [1, 2, 3])
      .order("grade_level")
      .order("name");
    if (!isSuperAdmin) {
      query = query.eq("section_adviser_id", user.system_user_id);
    }
    const { data } = await query;
    let list = (data || []).map((s) => ({
      id: String(s.id),
      name: s.name as string,
      grade_level: s.grade_level as number,
      school_id: String(s.school_id),
    })) as AdviserSection[];
    if (isSuperAdmin && list.length > 0) {
      const schoolIds = [...new Set(list.map((s) => s.school_id))];
      const { data: schools } = await supabase
        .from("sms_schools")
        .select("id, name")
        .in("id", schoolIds);
      const names: Record<string, string> = {};
      (schools || []).forEach((sc) => {
        names[String(sc.id)] = sc.name as string;
      });
      list = list.map((s) => ({ ...s, school_name: names[s.school_id] }));
    }
    setSections(list);
  }, [user, schoolYear]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  // Record forms available for this section grade + language.
  useEffect(() => {
    const run = async () => {
      if (!section) {
        setForms([]);
        setSelectedFormId("");
        return;
      }
      const { data } = await supabase
        .from("sms_crla_record_forms")
        .select("*")
        .eq("grade_level", section.grade_level)
        .eq("language", language)
        .eq("is_active", true)
        .order("story_title");
      const list = (data || []) as CrlaRecordForm[];
      setForms(list);
      setSelectedFormId((prev) =>
        list.some((f) => String(f.id) === prev)
          ? prev
          : list.length > 0
            ? String(list[0].id)
            : "",
      );
    };
    run();
  }, [section, language]);

  const load = useCallback(async () => {
    if (!section || !form) {
      setLines([]);
      setObservations([]);
      setStudents([]);
      setSummary({});
      return;
    }
    setLoading(true);

    const [{ data: lineRows }, { data: obsRows }] = await Promise.all([
      supabase
        .from("sms_crla_record_form_lines")
        .select("*")
        .eq("record_form_id", form.id)
        .order("position"),
      supabase
        .from("sms_crla_record_form_observations")
        .select("*")
        .eq("record_form_id", form.id)
        .order("level_no"),
    ]);
    setLines((lineRows || []) as CrlaRecordFormLine[]);
    setObservations((obsRows || []) as CrlaRecordFormObservation[]);

    const { data: enrollments } = await supabase
      .from("sms_enrollments")
      .select("student_id")
      .eq("section_id", section.id)
      .eq("school_year", schoolYear)
      .eq("status", "approved")
      .in("enrollment_status", [
        "active",
        "promoted",
        "graduated",
        "retained",
        "completed",
      ]);
    const studentIds = (enrollments || []).map((e) => String(e.student_id));
    let studentRows: Student[] = [];
    if (studentIds.length > 0) {
      const { data } = await supabase
        .from("sms_students")
        .select("*")
        .in("id", studentIds)
        .order("last_name")
        .order("first_name");
      studentRows = (data || []) as Student[];
    }
    setStudents(studentRows);

    const nextSummary: Record<string, Summary> = {};
    if (studentIds.length > 0) {
      const { data: records } = await supabase
        .from("sms_crla_record_form_records")
        .select("student_id, observation_level")
        .eq("record_form_id", form.id)
        .eq("phase", phase)
        .eq("school_year", schoolYear)
        .in("student_id", studentIds);
      (records || []).forEach((r) => {
        nextSummary[String(r.student_id)] = {
          recorded: true,
          observation_level: r.observation_level ?? null,
        };
      });
    }
    setSummary(nextSummary);
    setLoading(false);
  }, [section, form, phase, schoolYear]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="w-36">
          <label className="text-sm font-medium mb-1.5 block">School Year</label>
          <Select value={schoolYear} onValueChange={setSchoolYear}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getSchoolYearOptions().map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-56">
          <label className="text-sm font-medium mb-1.5 block">Section</label>
          <Select value={selectedSection} onValueChange={setSelectedSection}>
            <SelectTrigger>
              <SelectValue placeholder="Select section" />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} — {getGradeLevelLabel(s.grade_level)}
                  {s.school_name ? ` · ${s.school_name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <label className="text-sm font-medium mb-1.5 block">Language</label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRLA_LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-36">
          <label className="text-sm font-medium mb-1.5 block">Phase</label>
          <Select value={phase} onValueChange={setPhase}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSESSMENT_PHASES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {forms.length > 0 && (
          <div className="min-w-56">
            <label className="text-sm font-medium mb-1.5 block">Story</label>
            <Select value={selectedFormId} onValueChange={setSelectedFormId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {forms.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.story_title || f.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground py-6">
          No Grade 1–3 section for {schoolYear}.
        </p>
      )}

      {section && loading && (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {section && !loading && !form && (
        <p className="text-sm text-amber-600 py-6">
          No record form is configured for{" "}
          {getGradeLevelLabel(section.grade_level)} {language}. Ask the division
          office to add one.
        </p>
      )}

      {section && !loading && form && (
        <>
          {locked && (
            <p className="text-xs text-amber-600">
              Editing previous school-year records is disabled in Settings.
            </p>
          )}
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left w-10">#</th>
                  <th className="px-3 py-2 text-left">Learner</th>
                  <th className="px-3 py-2 text-left w-40">Status</th>
                  <th className="px-3 py-2 text-center w-40">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {students.map((s, idx) => {
                  const sm = summary[s.id];
                  return (
                    <tr key={s.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2 text-muted-foreground">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2">
                        {s.last_name}, {s.first_name}
                        <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                          {formatLrn(s.lrn)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {sm?.recorded ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                            Recorded
                            {sm.observation_level
                              ? ` · L${sm.observation_level}`
                              : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            Not yet
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setModalStudent(s)}
                        >
                          Record Form
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {students.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No enrolled learners found for this section.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalStudent && section && form && (
        <CrlaRecordFormModal
          isOpen={!!modalStudent}
          onClose={() => setModalStudent(null)}
          recordForm={form}
          lines={lines}
          observations={observations}
          student={modalStudent}
          section={section}
          teacherId={teacherId}
          teacherName={teacherName}
          fallbackSchoolId={schoolId}
          phase={phase}
          schoolYear={schoolYear}
          locked={locked}
          onSaved={load}
        />
      )}
    </div>
  );
}
