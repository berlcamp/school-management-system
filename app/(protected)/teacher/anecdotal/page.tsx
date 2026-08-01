"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getGradeLevelLabel } from "@/lib/constants";
import { generateAnecdotalRecordPrint } from "@/lib/pdf/generateAnecdotalRecord";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import type { AnecdotalRecord } from "@/types";
import {
  ChevronRight,
  Loader2,
  NotebookText,
  Pencil,
  Plus,
  Printer,
  Tags,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  RecordEntryModal,
  type RecordFieldDef,
} from "../components/RecordEntryModal";
import {
  advisoryLearnerName,
  useAdvisoryLearners,
} from "../useAdvisoryLearners";

const FIELDS: RecordFieldDef[] = [
  { key: "observation_date", label: "Date of Observation", type: "date", required: true },
  { key: "setting", label: "Setting / Place", type: "text", placeholder: "e.g. Classroom, Playground" },
  {
    key: "incident",
    label: "Anecdote / Observed Behavior",
    type: "textarea",
    required: true,
    placeholder: "Describe objectively what happened.",
  },
  { key: "interpretation", label: "Interpretation", type: "textarea", placeholder: "Your analysis of the behavior." },
  { key: "action_taken", label: "Action Taken / Recommendation", type: "textarea" },
];

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const { rows: learners, loading: learnersLoading, schoolId } =
    useAdvisoryLearners(schoolYear);

  const [studentId, setStudentId] = useState<string>("");
  const [records, setRecords] = useState<AnecdotalRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AnecdotalRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [printing, setPrinting] = useState(false);

  const selectedLearner = learners.find((l) => String(l.id) === studentId);

  // Keep a valid selection as the roster changes.
  useEffect(() => {
    if (learners.length === 0) {
      setStudentId("");
    } else if (!learners.some((l) => String(l.id) === studentId)) {
      setStudentId(String(learners[0].id));
    }
  }, [learners, studentId]);

  const loadRecords = useCallback(async () => {
    if (!studentId) {
      setRecords([]);
      return;
    }
    setRecordsLoading(true);
    const { data, error } = await supabase
      .from("sms_anecdotal_records")
      .select("*")
      .eq("student_id", Number(studentId))
      .eq("school_year", schoolYear)
      .order("observation_date", { ascending: false });
    if (error) {
      toast.error("Failed to load anecdotal records.");
      setRecords([]);
    } else {
      setRecords((data || []) as AnecdotalRecord[]);
    }
    setRecordsLoading(false);
  }, [studentId, schoolYear]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (r: AnecdotalRecord) => {
    setEditing(r);
    setModalOpen(true);
  };

  const handleSubmit = async (values: Record<string, string>) => {
    if (!studentId || schoolId == null) return;
    setSubmitting(true);
    const payload = {
      observation_date: values.observation_date,
      setting: values.setting?.trim() || null,
      incident: values.incident.trim(),
      interpretation: values.interpretation?.trim() || null,
      action_taken: values.action_taken?.trim() || null,
    };
    let error;
    if (editing) {
      ({ error } = await supabase
        .from("sms_anecdotal_records")
        .update(payload)
        .eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("sms_anecdotal_records").insert({
        ...payload,
        student_id: Number(studentId),
        school_id: Number(schoolId),
        school_year: schoolYear,
        created_by: user?.system_user_id ?? null,
      }));
    }
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Observation updated." : "Observation added.");
    setModalOpen(false);
    setEditing(null);
    loadRecords();
  };

  const handleDelete = async (r: AnecdotalRecord) => {
    if (!window.confirm("Delete this observation?")) return;
    const { error } = await supabase
      .from("sms_anecdotal_records")
      .delete()
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Observation deleted.");
    loadRecords();
  };

  const handlePrint = async () => {
    if (!selectedLearner) return;
    setPrinting(true);
    try {
      await generateAnecdotalRecordPrint({
        student: selectedLearner,
        sectionName: selectedLearner.section_name,
        gradeLevel: selectedLearner.section_grade_level,
        schoolId,
        schoolYear,
        records,
        adviserName: user?.name ?? null,
      });
    } catch {
      toast.error("Failed to generate printable.");
    } finally {
      setPrinting(false);
    }
  };

  const initialValues: Record<string, string> | undefined = editing
    ? {
        observation_date: editing.observation_date ?? "",
        setting: editing.setting ?? "",
        incident: editing.incident ?? "",
        interpretation: editing.interpretation ?? "",
        action_taken: editing.action_taken ?? "",
      }
    : undefined;

  return (
    <div>
      <div className="app__title">
        <div className="flex-1">
          <h1 className="app__title_text flex items-center gap-2">
            <NotebookText className="h-5 w-5" />
            Anecdotal Record
          </h1>
          <p className="text-sm text-muted-foreground">
            Dated behavior observations for the learners in your advisory
            section.
          </p>
        </div>
        <Link href="/teacher/anecdotal/manifestation" className="shrink-0">
          <Button variant="outline" className="gap-2">
            <Tags className="h-4 w-4" />
            Manifestation Tagging
            <ChevronRight className="h-4 w-4 opacity-60" />
          </Button>
        </Link>
      </div>

      <div className="app__content space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <label className="text-sm font-medium mb-1.5 block">
              School Year
            </label>
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
          <div className="min-w-64 flex-1 max-w-md">
            <label className="text-sm font-medium mb-1.5 block">Learner</label>
            <Select
              value={studentId || undefined}
              onValueChange={setStudentId}
              disabled={learnersLoading || learners.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    learnersLoading ? "Loading…" : "No advisory learners"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {learners.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {advisoryLearnerName(l)}
                    {l.section_name ? ` — ${l.section_name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={openAdd} disabled={!studentId}>
              <Plus className="mr-1 h-4 w-4" /> Add Observation
            </Button>
            <Button
              variant="outline"
              onClick={handlePrint}
              disabled={!selectedLearner || printing}
            >
              {printing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-1 h-4 w-4" />
              )}
              Print
            </Button>
          </div>
        </div>

        {selectedLearner && (
          <p className="text-xs text-muted-foreground">
            LRN{" "}
            <span className="font-mono">
              {formatLrn(selectedLearner.lrn)}
            </span>
            {selectedLearner.section_grade_level != null &&
              ` · ${getGradeLevelLabel(selectedLearner.section_grade_level)}`}
          </p>
        )}

        <Card>
          <CardContent className="pt-6">
            {learnersLoading || recordsLoading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : !studentId ? (
              <p className="py-8 text-center text-muted-foreground">
                No advisory learners for {schoolYear}.
              </p>
            ) : records.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No observations recorded yet for this learner.
              </p>
            ) : (
              <div className="overflow-x-auto border rounded-md">
                <table className="text-sm border-collapse min-w-full">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="border px-3 py-2 text-left whitespace-nowrap">
                        Date
                      </th>
                      <th className="border px-3 py-2 text-left">Setting</th>
                      <th className="border px-3 py-2 text-left">
                        Anecdote / Observed Behavior
                      </th>
                      <th className="border px-3 py-2 text-left">
                        Interpretation
                      </th>
                      <th className="border px-3 py-2 text-left">
                        Action Taken
                      </th>
                      <th className="border px-3 py-2 text-center w-20">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="align-top hover:bg-muted/30">
                        <td className="border px-3 py-2 whitespace-nowrap">
                          {r.observation_date}
                        </td>
                        <td className="border px-3 py-2">{r.setting || "—"}</td>
                        <td className="border px-3 py-2 whitespace-pre-wrap">
                          {r.incident}
                        </td>
                        <td className="border px-3 py-2 whitespace-pre-wrap">
                          {r.interpretation || "—"}
                        </td>
                        <td className="border px-3 py-2 whitespace-pre-wrap">
                          {r.action_taken || "—"}
                        </td>
                        <td className="border px-2 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEdit(r)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-600"
                              onClick={() => handleDelete(r)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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

      <RecordEntryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? "Edit Observation" : "Add Observation"}
        fields={FIELDS}
        initial={initialValues}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
