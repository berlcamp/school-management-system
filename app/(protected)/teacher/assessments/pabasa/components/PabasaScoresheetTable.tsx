"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import {
  getGradeLevelLabel,
  PABASA_LANGUAGES,
  PABASA_LEVELS,
  PABASA_PHASES,
  pabasaLevelColor,
  pabasaPhaseLabel,
} from "@/lib/constants";
import { generatePabasaScoresheet } from "@/lib/pdf/generatePabasaScoresheet";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import { exportCsv } from "@/lib/utils/exportCsv";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { Student } from "@/types";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  Download,
  Info,
  Loader2,
  Printer,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { AdviserSection } from "../page";
import {
  groupByGender,
  PabasaEntryMap,
  summaryByGender,
} from "../pabasaUtils";

type SaveState = "idle" | "saving" | "saved" | "error";

interface Props {
  sections: AdviserSection[];
  selectedSection: string;
  setSelectedSection: (value: string) => void;
  schoolYear: string;
  setSchoolYear: (value: string) => void;
  schoolYearOptions: string[];
  teacherId: number;
  teacherName: string;
  schoolId: number | null;
  focusStudentId?: string;
}

const REMARKS_DEBOUNCE_MS = 600;

const emptyEntry = () => ({ reading_level: null, remarks: null });

export function PabasaScoresheetTable({
  sections,
  selectedSection,
  setSelectedSection,
  schoolYear,
  setSchoolYear,
  schoolYearOptions,
  teacherId,
  teacherName,
  schoolId,
  focusStudentId,
}: Props) {
  const [language, setLanguage] = useState<string>(PABASA_LANGUAGES[0]);
  const [phase, setPhase] = useState<string>(PABASA_PHASES[0].value);
  const [students, setStudents] = useState<Student[]>([]);
  const [entries, setEntries] = useState<PabasaEntryMap>({});
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [sortAsc, setSortAsc] = useState<{ male: boolean; female: boolean }>({
    male: true,
    female: true,
  });

  const entriesRef = useRef<PabasaEntryMap>({});
  const savedEntriesRef = useRef<PabasaEntryMap>({});
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);
  const remarksTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );
  const pendingRef = useRef(0);
  const errorFlagRef = useRef(false);

  const fullUser = useAppSelector((state) => state.user.user);
  const { settings } = useSchoolSettings(true, fullUser?.school_id);
  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const locked = isPreviousYear && !settings.allow_edit_previous_school_year;

  const section = sections.find((s) => s.id === selectedSection) || null;
  const columnCount = PABASA_LEVELS.length + 3; // Name, Sex, levels…, Remarks

  const clearRemarksTimers = () => {
    Object.values(remarksTimersRef.current).forEach(clearTimeout);
    remarksTimersRef.current = {};
  };

  const load = useCallback(async () => {
    clearRemarksTimers();
    pendingRef.current = 0;
    errorFlagRef.current = false;
    setSaveState("idle");

    if (!section) {
      setStudents([]);
      setEntries({});
      entriesRef.current = {};
      savedEntriesRef.current = {};
      return;
    }
    setLoading(true);

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

    const nextEntries: PabasaEntryMap = {};
    studentRows.forEach((s) => {
      nextEntries[s.id] = emptyEntry();
    });

    if (studentIds.length > 0) {
      const { data: records } = await supabase
        .from("sms_pabasa_records")
        .select("student_id, reading_level, remarks")
        .eq("language", language)
        .eq("phase", phase)
        .eq("school_year", schoolYear)
        .in("student_id", studentIds);
      (records || []).forEach((r) => {
        const sid = String(r.student_id);
        nextEntries[sid] = {
          reading_level: (r.reading_level as string | null) ?? null,
          remarks: (r.remarks as string | null) ?? null,
        };
      });
    }

    setEntries(nextEntries);
    entriesRef.current = nextEntries;
    savedEntriesRef.current = JSON.parse(JSON.stringify(nextEntries));
    setLoading(false);
  }, [section, language, phase, schoolYear]);

  useEffect(() => {
    load();
  }, [load]);

  // Flush any pending remarks timers on unmount.
  useEffect(() => () => clearRemarksTimers(), []);

  // Scroll the deep-linked learner into view once the roster renders.
  useEffect(() => {
    if (focusStudentId && !loading && focusRowRef.current) {
      focusRowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusStudentId, students, loading, language, phase]);

  // Persist the whole entry row for a learner (natural-key upsert; both
  // reading_level and remarks are sent so neither clobbers the other).
  const persistEntry = async (studentId: string) => {
    if (locked || !section) return;
    // Scope the record to the section's own school (matters for super admins,
    // who may be recording against another school's section).
    const recordSchoolId = Number(section.school_id) || schoolId;
    if (!recordSchoolId) {
      toast.error("This section has no school assigned.");
      return;
    }
    const entry = entriesRef.current[studentId] || emptyEntry();
    pendingRef.current += 1;
    setSaveState("saving");
    try {
      const { error } = await supabase.from("sms_pabasa_records").upsert(
        {
          school_id: recordSchoolId,
          section_id: Number(section.id),
          student_id: Number(studentId),
          teacher_id: teacherId,
          grade_level: section.grade_level,
          language,
          phase,
          school_year: schoolYear,
          reading_level: entry.reading_level,
          remarks: entry.remarks,
        },
        { onConflict: "student_id,language,phase,school_year" },
      );
      if (error) throw new Error(error.message);
      savedEntriesRef.current[studentId] = { ...entry };
    } catch {
      errorFlagRef.current = true;
      // Roll the row back to its last-saved value.
      const saved = savedEntriesRef.current[studentId] ?? emptyEntry();
      const next = { ...entriesRef.current, [studentId]: { ...saved } };
      entriesRef.current = next;
      setEntries(next);
      toast.error("Failed to save. Reverted.");
    } finally {
      pendingRef.current -= 1;
      if (pendingRef.current <= 0) {
        pendingRef.current = 0;
        setSaveState(errorFlagRef.current ? "error" : "saved");
        errorFlagRef.current = false;
      }
    }
  };

  const setLevel = (studentId: string, level: string) => {
    if (locked) return;
    const current = entriesRef.current[studentId] || emptyEntry();
    // Radio semantics with toggle-off: clicking the selected level clears it.
    const nextLevel = current.reading_level === level ? null : level;
    const next = {
      ...entriesRef.current,
      [studentId]: { ...current, reading_level: nextLevel },
    };
    entriesRef.current = next;
    setEntries(next);
    persistEntry(studentId);
  };

  const setLocalRemarks = (studentId: string, value: string) => {
    const current = entriesRef.current[studentId] || emptyEntry();
    const next = {
      ...entriesRef.current,
      [studentId]: { ...current, remarks: value === "" ? null : value },
    };
    entriesRef.current = next;
    setEntries(next);
  };

  const scheduleRemarksSave = (studentId: string) => {
    if (locked) return;
    if (remarksTimersRef.current[studentId])
      clearTimeout(remarksTimersRef.current[studentId]);
    remarksTimersRef.current[studentId] = setTimeout(() => {
      delete remarksTimersRef.current[studentId];
      persistEntry(studentId);
    }, REMARKS_DEBOUNCE_MS);
  };

  const flushRemarksSave = (studentId: string) => {
    if (remarksTimersRef.current[studentId]) {
      clearTimeout(remarksTimersRef.current[studentId]);
      delete remarksTimersRef.current[studentId];
      persistEntry(studentId);
    }
  };

  const downloadCsv = () => {
    if (!section) return;
    const headers = ["Name of Learner", "Sex", "Reading Level", "Remarks"];
    const male = groupByGender(students, sortAsc.male).male;
    const female = groupByGender(students, sortAsc.female).female;
    const rows = [...male, ...female].map((s) => {
      const e = entries[s.id] || emptyEntry();
      return {
        "Name of Learner": `${s.last_name}, ${s.first_name}`,
        Sex: s.gender === "female" ? "Female" : "Male",
        "Reading Level": e.reading_level ?? "",
        Remarks: e.remarks ?? "",
      };
    });
    exportCsv(
      rows,
      headers,
      `PABASA_${section.name}_${language}_${pabasaPhaseLabel(phase)}_${schoolYear}`.replace(
        /\s+/g,
        "-",
      ),
    );
  };

  const printScoresheet = () => {
    if (!section) return;
    generatePabasaScoresheet({
      schoolId: Number(section.school_id),
      language,
      students,
      entries: entriesRef.current,
      sectionName: section.name,
      gradeLevel: section.grade_level,
      teacherName,
      phase,
      schoolYear,
      sortAscMale: sortAsc.male,
      sortAscFemale: sortAsc.female,
    }).catch(() => toast.error("Failed to generate scoresheet."));
  };

  const summary =
    students.length > 0 ? summaryByGender(students, entries) : null;

  const renderStudentRow = (s: Student, displayIdx: number) => {
    const entry = entries[s.id] || emptyEntry();
    return (
      <tr
        key={s.id}
        ref={s.id === focusStudentId ? focusRowRef : undefined}
        className={`hover:bg-muted/30 ${s.id === focusStudentId ? "bg-primary/5 ring-2 ring-inset ring-primary" : ""}`}
      >
        <td className="border px-3 py-1.5 sticky left-0 bg-background z-10 whitespace-nowrap">
          <span className="text-muted-foreground mr-1">{displayIdx}.</span>
          {s.last_name}, {s.first_name}
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
            {formatLrn(s.lrn)}
          </span>
        </td>
        <td className="border px-2 py-1 text-center text-xs">
          {s.gender === "female" ? "F" : "M"}
        </td>
        {PABASA_LEVELS.map((lvl) => {
          const selected = entry.reading_level === lvl;
          return (
            <td key={lvl} className="border p-0 text-center">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={lvl}
                disabled={locked}
                onClick={() => setLevel(s.id, lvl)}
                className="flex h-8 w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                    selected
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/50"
                  }`}
                >
                  {selected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  )}
                </span>
              </button>
            </td>
          );
        })}
        <td className="border p-0">
          <Input
            className="h-8 w-40 rounded-none border-0 px-2 text-xs"
            value={entry.remarks ?? ""}
            disabled={locked}
            placeholder="—"
            onChange={(e) => {
              setLocalRemarks(s.id, e.target.value);
              scheduleRemarksSave(s.id);
            }}
            onBlur={() => flushRemarksSave(s.id)}
          />
        </td>
      </tr>
    );
  };

  const genderHeaderRow = (
    label: string,
    group: "male" | "female",
    count: number,
  ) => (
    <tr className="bg-muted/40">
      <td
        colSpan={columnCount}
        className="border px-3 py-1.5 sticky left-0 z-10 bg-muted/40"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide">
            {label} ({count})
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() =>
              setSortAsc((prev) => ({ ...prev, [group]: !prev[group] }))
            }
          >
            {sortAsc[group] ? (
              <ArrowDownAZ className="h-3.5 w-3.5 mr-1" />
            ) : (
              <ArrowUpAZ className="h-3.5 w-3.5 mr-1" />
            )}
            Sort A–Z
          </Button>
        </div>
      </td>
    </tr>
  );

  const maleGroup = groupByGender(students, sortAsc.male).male;
  const femaleGroup = groupByGender(students, sortAsc.female).female;

  return (
    <div className="space-y-4">
      {/* Reading-readiness guide */}
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
        <div className="flex items-center gap-2 font-semibold">
          <Info className="h-4 w-4 shrink-0" />
          Reading Readiness Levels
        </div>
        <p className="mt-1 text-xs opacity-90">
          Mark one level per learner while they read. Select the same level again
          to clear it.
        </p>
        <div className="mt-2 flex flex-wrap gap-4">
          {PABASA_LEVELS.map((lvl) => (
            <span key={lvl} className={`font-semibold ${pabasaLevelColor(lvl)}`}>
              {lvl}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36">
          <label className="text-sm font-medium mb-1.5 block">School Year</label>
          <Select value={schoolYear} onValueChange={setSchoolYear}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {schoolYearOptions.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-52">
          <label className="text-sm font-medium mb-1.5 block">Section</label>
          <Select value={selectedSection} onValueChange={setSelectedSection}>
            <SelectTrigger>
              <SelectValue placeholder="Select advisory section" />
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
        <div className="min-w-44">
          <label className="text-sm font-medium mb-1.5 block">Language</label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PABASA_LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Pretest / Midtest / Posttest toggle */}
      <Tabs value={phase} onValueChange={setPhase}>
        <TabsList>
          {PABASA_PHASES.map((p) => (
            <TabsTrigger key={p.value} value={p.value}>
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground py-6">
          You have no Grade 11–12 advisory section for {schoolYear}.
        </p>
      )}

      {section && loading && (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {section && !loading && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="text-sm flex items-center gap-3">
              <span className="text-muted-foreground">
                {language} · {pabasaPhaseLabel(phase)}
              </span>
              {saveState === "saving" && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                </span>
              )}
              {saveState === "saved" && (
                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                  <Check className="h-3.5 w-3.5" /> Autosaved
                </span>
              )}
              {saveState === "error" && (
                <span className="text-xs text-red-600">Save failed</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={downloadCsv}>
                <Download className="h-4 w-4 mr-1" /> Download CSV
              </Button>
              <Button size="sm" variant="outline" onClick={printScoresheet}>
                <Printer className="h-4 w-4 mr-1" /> Print A4
              </Button>
            </div>
          </div>

          {locked && (
            <p className="text-xs text-amber-600">
              Editing previous school-year records is disabled in Settings.
            </p>
          )}

          <div className="overflow-x-auto border rounded-md">
            <table className="text-sm border-collapse min-w-full">
              <thead>
                <tr className="bg-muted/60">
                  <th className="border px-3 py-2 text-left min-w-52 sticky left-0 bg-muted/60 z-10">
                    Name of Learner
                  </th>
                  <th className="border px-2 py-2 text-center w-12">Sex</th>
                  {PABASA_LEVELS.map((lvl) => (
                    <th
                      key={lvl}
                      className="border px-2 py-2 text-center w-24"
                    >
                      {lvl}
                    </th>
                  ))}
                  <th className="border px-2 py-2 text-center w-40">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 && (
                  <tr>
                    <td
                      colSpan={columnCount}
                      className="border px-3 py-6 text-center text-muted-foreground"
                    >
                      No learners yet — add students to this section first.
                    </td>
                  </tr>
                )}
                {maleGroup.length > 0 && (
                  <>
                    {genderHeaderRow("MALE", "male", maleGroup.length)}
                    {maleGroup.map((s, i) => renderStudentRow(s, i + 1))}
                  </>
                )}
                {femaleGroup.length > 0 && (
                  <>
                    {genderHeaderRow("FEMALE", "female", femaleGroup.length)}
                    {femaleGroup.map((s, i) => renderStudentRow(s, i + 1))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* PABASA Readiness Summary */}
          {summary && (
            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-sm font-semibold">
                PABASA Readiness Summary ({language} · {pabasaPhaseLabel(phase)})
              </div>
              <div className="overflow-x-auto">
                <table className="text-sm border-collapse w-full">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="border px-3 py-1.5 text-left">Indicator</th>
                      <th className="border px-3 py-1.5 text-center w-24">Male</th>
                      <th className="border px-3 py-1.5 text-center w-24">
                        Female
                      </th>
                      <th className="border px-3 py-1.5 text-center w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["Enrolment", "enrolment"],
                        ["Learners Assessed", "assessed"],
                        ["Average", "average"],
                        ["Fast", "fast"],
                        ["Spontaneous", "spontaneous"],
                      ] as const
                    ).map(([label, key]) => (
                      <tr key={key} className="hover:bg-muted/20">
                        <td className="border px-3 py-1.5">{label}</td>
                        <td className="border px-3 py-1.5 text-center">
                          {summary.male[key]}
                        </td>
                        <td className="border px-3 py-1.5 text-center">
                          {summary.female[key]}
                        </td>
                        <td className="border px-3 py-1.5 text-center font-semibold">
                          {summary.total[key]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
