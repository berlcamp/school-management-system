"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ES_SUBJECTS_1_3,
  ES_SUBJECTS_4_6,
  JHS_SUBJECTS,
  SubjectDef,
} from "@/lib/pdf/generateSf10";
import { supabase } from "@/lib/supabase/client";
import { HistoricalGradeEntry, HistoricalGrades } from "@/types/database";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface HistoricalGradeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  schoolId: string;
  gradeLevel: number;
  semester: number | null; // null for K-10; 1 or 2 for SHS
  existing: HistoricalGrades | null;
  defaultSchoolInfo: {
    schoolName: string;
    schoolIdCode: string;
    district: string;
    division: string;
    region: string;
  };
  onSaved: () => void;
  encodedBy: string;
}

const SHS_TRACKS = ["Academic", "TVL", "Sports", "Arts & Design"];

function getGradeLevelLabel(gl: number, semester: number | null): string {
  if (gl === 0) return "Kindergarten";
  if (gl <= 10) return `Grade ${gl}`;
  return `Grade ${gl} – Semester ${semester}`;
}

function getSubjectsForLevel(gl: number): SubjectDef[] {
  if (gl >= 1 && gl <= 3) return ES_SUBJECTS_1_3;
  if (gl >= 4 && gl <= 6) return ES_SUBJECTS_4_6;
  if (gl >= 7 && gl <= 10) return JHS_SUBJECTS;
  return []; // SHS uses dynamic subjects
}

function isGradeValid(val: string): boolean {
  if (val === "") return true;
  const num = Number(val);
  return Number.isInteger(num) && num >= 60 && num <= 100;
}

function isSchoolYearValid(val: string): boolean {
  const match = val.match(/^(\d{4})-(\d{4})$/);
  if (!match) return false;
  return Number(match[2]) === Number(match[1]) + 1;
}

interface SHSSubjectRow {
  name: string;
  q1: string;
  q2: string;
}

export default function HistoricalGradeForm({
  open,
  onOpenChange,
  studentId,
  schoolId,
  gradeLevel,
  semester,
  existing,
  defaultSchoolInfo,
  onSaved,
  encodedBy,
}: HistoricalGradeFormProps) {
  const isSHS = gradeLevel >= 11;
  const isKindergarten = gradeLevel === 0;
  const subjects = getSubjectsForLevel(gradeLevel);

  // School info
  const [schoolName, setSchoolName] = useState("");
  const [schoolIdCode, setSchoolIdCode] = useState("");
  const [district, setDistrict] = useState("");
  const [division, setDivision] = useState("");
  const [region, setRegion] = useState("");

  // Record info
  const [schoolYear, setSchoolYear] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [adviserName, setAdviserName] = useState("");
  const [track, setTrack] = useState("");
  const [strand, setStrand] = useState("");

  // Grades — K-10 predefined subjects
  const [gradeValues, setGradeValues] = useState<
    Record<string, { q1: string; q2: string; q3: string; q4: string }>
  >({});

  // SHS dynamic subjects
  const [shsSubjects, setShsSubjects] = useState<SHSSubjectRow[]>([
    { name: "", q1: "", q2: "" },
  ]);

  const [generalAverage, setGeneralAverage] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;

    if (existing) {
      setSchoolName(existing.school_name || "");
      setSchoolIdCode(existing.school_id_code || "");
      setDistrict(existing.district || "");
      setDivision(existing.division || "");
      setRegion(existing.region || "");
      setSchoolYear(existing.school_year || "");
      setSectionName(existing.section_name || "");
      setAdviserName(existing.adviser_name || "");
      setTrack(existing.track || "");
      setStrand(existing.strand || "");
      setGeneralAverage(
        existing.general_average != null
          ? String(existing.general_average)
          : "",
      );

      if (isSHS) {
        const rows: SHSSubjectRow[] = Object.entries(existing.grades).map(
          ([name, entry]) => ({
            name,
            q1: entry.q1 != null ? String(entry.q1) : "",
            q2: entry.q2 != null ? String(entry.q2) : "",
          }),
        );
        setShsSubjects(rows.length > 0 ? rows : [{ name: "", q1: "", q2: "" }]);
      } else {
        const vals: Record<
          string,
          { q1: string; q2: string; q3: string; q4: string }
        > = {};
        Object.entries(existing.grades).forEach(([key, entry]) => {
          vals[key] = {
            q1: entry.q1 != null ? String(entry.q1) : "",
            q2: entry.q2 != null ? String(entry.q2) : "",
            q3: entry.q3 != null ? String(entry.q3) : "",
            q4: entry.q4 != null ? String(entry.q4) : "",
          };
        });
        setGradeValues(vals);
      }
    } else {
      setSchoolName(defaultSchoolInfo.schoolName);
      setSchoolIdCode(defaultSchoolInfo.schoolIdCode);
      setDistrict(defaultSchoolInfo.district);
      setDivision(defaultSchoolInfo.division);
      setRegion(defaultSchoolInfo.region);
      setSchoolYear("");
      setSectionName("");
      setAdviserName("");
      setTrack("");
      setStrand("");
      setGeneralAverage("");
      setGradeValues({});
      setShsSubjects([{ name: "", q1: "", q2: "" }]);
    }
  }, [open, existing, defaultSchoolInfo, isSHS]);

  const updateGrade = (
    subjectKey: string,
    quarter: "q1" | "q2" | "q3" | "q4",
    value: string,
  ) => {
    setGradeValues((prev) => {
      const current = prev[subjectKey] || { q1: "", q2: "", q3: "", q4: "" };
      return {
        ...prev,
        [subjectKey]: { ...current, [quarter]: value },
      };
    });
  };

  const updateShsSubject = (
    index: number,
    field: "name" | "q1" | "q2",
    value: string,
  ) => {
    setShsSubjects((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const addShsSubject = () => {
    setShsSubjects((prev) => [...prev, { name: "", q1: "", q2: "" }]);
  };

  const removeShsSubject = (index: number) => {
    setShsSubjects((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    // Validation
    if (!schoolName.trim()) {
      toast.error("School name is required");
      return;
    }
    if (!sectionName.trim() && !isKindergarten) {
      toast.error("Section name is required");
      return;
    }
    if (!schoolYear.trim() || !isSchoolYearValid(schoolYear)) {
      toast.error("School year must be in YYYY-YYYY format (e.g., 2023-2024)");
      return;
    }

    // Build grades JSONB
    const gradesJson: Record<string, HistoricalGradeEntry> = {};

    if (isKindergarten) {
      // No subject grades for kindergarten
    } else if (isSHS) {
      const validRows = shsSubjects.filter((r) => r.name.trim());
      if (validRows.length === 0) {
        toast.error("At least one subject with a name is required");
        return;
      }
      for (const row of validRows) {
        if (!isGradeValid(row.q1) || !isGradeValid(row.q2)) {
          toast.error(
            `Invalid grade for "${row.name}". Grades must be 60-100 or empty.`,
          );
          return;
        }
        gradesJson[row.name.trim()] = {
          q1: row.q1 ? Number(row.q1) : null,
          q2: row.q2 ? Number(row.q2) : null,
          q3: null,
          q4: null,
        };
      }
    } else {
      // K-10 predefined subjects
      let hasAnyGrade = false;
      for (const subj of subjects) {
        if (subj.isHeader) continue;
        const vals = gradeValues[subj.key];
        if (!vals) continue;
        const q1 = vals.q1 || "";
        const q2 = vals.q2 || "";
        const q3 = vals.q3 || "";
        const q4 = vals.q4 || "";
        if (
          !isGradeValid(q1) ||
          !isGradeValid(q2) ||
          !isGradeValid(q3) ||
          !isGradeValid(q4)
        ) {
          toast.error(
            `Invalid grade for "${subj.label}". Grades must be 60-100 or empty.`,
          );
          return;
        }
        if (q1 || q2 || q3 || q4) {
          hasAnyGrade = true;
          gradesJson[subj.key] = {
            q1: q1 ? Number(q1) : null,
            q2: q2 ? Number(q2) : null,
            q3: q3 ? Number(q3) : null,
            q4: q4 ? Number(q4) : null,
          };
        }
      }
      if (!hasAnyGrade && !isKindergarten) {
        toast.error("At least one subject must have a grade");
        return;
      }
    }

    setSaving(true);
    try {
      const record = {
        student_id: studentId,
        school_id: schoolId,
        grade_level: gradeLevel,
        school_year: schoolYear.trim(),
        section_name: sectionName.trim() || null,
        school_name: schoolName.trim(),
        school_id_code: schoolIdCode.trim() || null,
        district: district.trim() || null,
        division: division.trim() || null,
        region: region.trim() || null,
        adviser_name: adviserName.trim() || null,
        semester: semester,
        track: isSHS ? track || null : null,
        strand: isSHS ? strand || null : null,
        grades: gradesJson,
        general_average: generalAverage ? Number(generalAverage) : null,
        encoded_by: encodedBy,
      };

      if (existing) {
        const { error } = await supabase
          .from("sms_historical_grades")
          .update(record)
          .eq("id", existing.id);
        if (error) throw error;
        toast.success("Historical record updated");
      } else {
        const { error } = await supabase
          .from("sms_historical_grades")
          .insert(record);
        if (error) throw error;
        toast.success("Historical record saved");
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save historical record",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit" : "Encode"} Historical Grades –{" "}
            {getGradeLevelLabel(gradeLevel, semester)}
          </DialogTitle>
          <DialogDescription>
            Enter the student&apos;s academic record for this grade level.
            {isSHS &&
              " Add subjects manually as SHS subjects vary by track/strand."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* School Info Section */}
          <div>
            <h3 className="text-sm font-semibold mb-3">School Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>School Name *</Label>
                <Input
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g., Bayugan Central Elementary School"
                />
              </div>
              <div>
                <Label>School ID Code</Label>
                <Input
                  value={schoolIdCode}
                  onChange={(e) => setSchoolIdCode(e.target.value)}
                  placeholder="DepEd School ID"
                />
              </div>
              <div>
                <Label>District</Label>
                <Input
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                />
              </div>
              <div>
                <Label>Division</Label>
                <Input
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                />
              </div>
              <div>
                <Label>Region</Label>
                <Input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Record Info Section */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Record Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>School Year *</Label>
                <Input
                  value={schoolYear}
                  onChange={(e) => setSchoolYear(e.target.value)}
                  placeholder="e.g., 2023-2024"
                />
              </div>
              {!isKindergarten && (
                <div>
                  <Label>Section Name *</Label>
                  <Input
                    value={sectionName}
                    onChange={(e) => setSectionName(e.target.value)}
                  />
                </div>
              )}
              <div>
                <Label>Adviser Name</Label>
                <Input
                  value={adviserName}
                  onChange={(e) => setAdviserName(e.target.value)}
                />
              </div>
            </div>
            {isSHS && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div>
                  <Label>Track</Label>
                  <Select value={track} onValueChange={setTrack}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select track" />
                    </SelectTrigger>
                    <SelectContent>
                      {SHS_TRACKS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Strand</Label>
                  <Input
                    value={strand}
                    onChange={(e) => setStrand(e.target.value)}
                    placeholder="e.g., STEM, HUMSS, ABM, GAS"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Subject Grades Section */}
          {!isKindergarten && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Subject Grades</h3>
              {isSHS ? (
                /* SHS Dynamic Subject Rows */
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_80px_80px_40px] gap-2 text-xs font-medium text-muted-foreground">
                    <span>Subject Name</span>
                    <span className="text-center">Q1</span>
                    <span className="text-center">Q2</span>
                    <span />
                  </div>
                  {shsSubjects.map((row, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[1fr_80px_80px_40px] gap-2 items-center"
                    >
                      <Input
                        value={row.name}
                        onChange={(e) =>
                          updateShsSubject(idx, "name", e.target.value)
                        }
                        placeholder="Subject name"
                        className="text-sm"
                      />
                      <Input
                        type="number"
                        min={60}
                        max={100}
                        value={row.q1}
                        onChange={(e) =>
                          updateShsSubject(idx, "q1", e.target.value)
                        }
                        className="text-center text-sm"
                      />
                      <Input
                        type="number"
                        min={60}
                        max={100}
                        value={row.q2}
                        onChange={(e) =>
                          updateShsSubject(idx, "q2", e.target.value)
                        }
                        className="text-center text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeShsSubject(idx)}
                        disabled={shsSubjects.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addShsSubject}
                    className="mt-1"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add Subject
                  </Button>
                </div>
              ) : (
                /* K-10 Predefined Subject Table */
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 font-medium">Subject</th>
                        <th className="text-center p-2 font-medium w-[70px]">
                          Q1
                        </th>
                        <th className="text-center p-2 font-medium w-[70px]">
                          Q2
                        </th>
                        <th className="text-center p-2 font-medium w-[70px]">
                          Q3
                        </th>
                        <th className="text-center p-2 font-medium w-[70px]">
                          Q4
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjects.map((subj) => {
                        if (subj.isHeader) {
                          return (
                            <tr key={subj.key} className="bg-muted/30 border-t">
                              <td
                                colSpan={5}
                                className="p-2 font-semibold text-xs"
                              >
                                {subj.label}
                              </td>
                            </tr>
                          );
                        }
                        const vals = gradeValues[subj.key] || {
                          q1: "",
                          q2: "",
                          q3: "",
                          q4: "",
                        };
                        return (
                          <tr key={subj.key} className="border-t">
                            <td
                              className={`p-2 ${subj.isSub ? "pl-6 text-muted-foreground" : ""}`}
                            >
                              {subj.label}
                            </td>
                            {(["q1", "q2", "q3", "q4"] as const).map((q) => (
                              <td key={q} className="p-1">
                                <Input
                                  type="number"
                                  min={60}
                                  max={100}
                                  value={vals[q]}
                                  onChange={(e) =>
                                    updateGrade(subj.key, q, e.target.value)
                                  }
                                  className="text-center text-sm h-8"
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* General Average */}
          <div className="max-w-[200px]">
            <Label>General Average (optional override)</Label>
            <Input
              type="number"
              min={60}
              max={100}
              step="0.01"
              value={generalAverage}
              onChange={(e) => setGeneralAverage(e.target.value)}
              placeholder="Auto-computed if blank"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {existing ? "Update Record" : "Save Record"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
