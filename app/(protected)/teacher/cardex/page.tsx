"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CARDEX_COMM_MODES,
  cardexCommModeLabel,
  getGradeLevelLabel,
} from "@/lib/constants";
import {
  generateCardexCommunicationPrint,
  generateCardexNeedsPrint,
} from "@/lib/pdf/generateCardex";
import { useAppSelector } from "@/lib/redux/hook";
import { formatLrn } from "@/lib/utils";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import type { CardexCommunication, CardexNeed } from "@/types";
import { IdCard } from "lucide-react";
import { useEffect, useState } from "react";
import { type RecordFieldDef } from "../components/RecordEntryModal";
import {
  advisoryLearnerName,
  useAdvisoryLearners,
} from "../useAdvisoryLearners";
import { CardexLogPanel } from "./components/CardexLogPanel";

const NEEDS_FIELDS: RecordFieldDef[] = [
  { key: "entry_date", label: "Date", type: "date", required: true },
  { key: "need", label: "Learner's Need", type: "textarea", required: true, placeholder: "Identified need or area of concern." },
  { key: "intervention", label: "Intervention / Strategy Applied", type: "textarea" },
  { key: "progress", label: "Progress & Achievement", type: "textarea" },
  { key: "remarks", label: "Remarks", type: "text" },
];

const COMM_FIELDS: RecordFieldDef[] = [
  { key: "communication_date", label: "Date", type: "date", required: true },
  { key: "mode", label: "Mode of Communication", type: "select", required: true, options: CARDEX_COMM_MODES },
  { key: "person_contacted", label: "Person Contacted", type: "text", placeholder: "Parent/guardian name & relationship" },
  { key: "purpose", label: "Purpose / Concern", type: "textarea", required: true },
  { key: "outcome", label: "Agreement / Action Taken", type: "textarea" },
];

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const { rows: learners, loading: learnersLoading, schoolId } =
    useAdvisoryLearners(schoolYear);

  const [studentId, setStudentId] = useState<string>("");
  const selectedLearner = learners.find((l) => String(l.id) === studentId);

  useEffect(() => {
    if (learners.length === 0) {
      setStudentId("");
    } else if (!learners.some((l) => String(l.id) === studentId)) {
      setStudentId(String(learners[0].id));
    }
  }, [learners, studentId]);

  const learnerMeta = selectedLearner
    ? {
        sectionName: selectedLearner.section_name,
        gradeLevel: selectedLearner.section_grade_level,
      }
    : { sectionName: null, gradeLevel: null };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <IdCard className="h-5 w-5" />
          Learner Cardex
        </h1>
        <p className="text-sm text-muted-foreground">
          Cumulative record of learner needs, progress, and parent/guardian
          communication for your advisory section.
        </p>
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
        </div>

        {selectedLearner && (
          <p className="text-xs text-muted-foreground">
            LRN{" "}
            <span className="font-mono">{formatLrn(selectedLearner.lrn)}</span>
            {selectedLearner.section_grade_level != null &&
              ` · ${getGradeLevelLabel(selectedLearner.section_grade_level)}`}
          </p>
        )}

        <Card>
          <CardContent className="pt-6">
            {learnersLoading ? (
              <p className="py-8 text-center text-muted-foreground">Loading…</p>
            ) : !studentId ? (
              <p className="py-8 text-center text-muted-foreground">
                No advisory learners for {schoolYear}.
              </p>
            ) : (
              <Tabs defaultValue="needs">
                <TabsList>
                  <TabsTrigger value="needs">
                    Needs, Progress &amp; Achievement
                  </TabsTrigger>
                  <TabsTrigger value="communication">
                    Parent/Guardian Communication
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="needs" className="mt-4">
                  <CardexLogPanel<CardexNeed>
                    studentId={studentId}
                    schoolId={schoolId}
                    schoolYear={schoolYear}
                    createdBy={user?.system_user_id ?? null}
                    tableName="sms_cardex_needs"
                    dateColumnKey="entry_date"
                    fields={NEEDS_FIELDS}
                    addLabel="Add Entry"
                    emptyLabel="No needs/progress entries recorded yet."
                    columns={[
                      { header: "Date", nowrap: true, value: (r) => r.entry_date },
                      { header: "Learner's Need", preWrap: true, value: (r) => r.need },
                      { header: "Intervention / Strategy", preWrap: true, value: (r) => r.intervention ?? "" },
                      { header: "Progress & Achievement", preWrap: true, value: (r) => r.progress ?? "" },
                      { header: "Remarks", preWrap: true, value: (r) => r.remarks ?? "" },
                    ]}
                    buildPayload={(v) => ({
                      entry_date: v.entry_date,
                      need: v.need.trim(),
                      intervention: v.intervention?.trim() || null,
                      progress: v.progress?.trim() || null,
                      remarks: v.remarks?.trim() || null,
                    })}
                    rowToInitial={(r) => ({
                      entry_date: r.entry_date ?? "",
                      need: r.need ?? "",
                      intervention: r.intervention ?? "",
                      progress: r.progress ?? "",
                      remarks: r.remarks ?? "",
                    })}
                    onPrint={(rows) =>
                      generateCardexNeedsPrint({
                        student: selectedLearner!,
                        sectionName: learnerMeta.sectionName,
                        gradeLevel: learnerMeta.gradeLevel,
                        schoolId,
                        schoolYear,
                        entries: rows,
                        adviserName: user?.name ?? null,
                      })
                    }
                  />
                </TabsContent>

                <TabsContent value="communication" className="mt-4">
                  <CardexLogPanel<CardexCommunication>
                    studentId={studentId}
                    schoolId={schoolId}
                    schoolYear={schoolYear}
                    createdBy={user?.system_user_id ?? null}
                    tableName="sms_cardex_communication"
                    dateColumnKey="communication_date"
                    fields={COMM_FIELDS.map((f) =>
                      f.key === "person_contacted"
                        ? {
                            ...f,
                            placeholder:
                              selectedLearner?.parent_guardian_name ||
                              f.placeholder,
                          }
                        : f,
                    )}
                    addLabel="Log Communication"
                    emptyLabel="No communication logged yet."
                    columns={[
                      { header: "Date", nowrap: true, value: (r) => r.communication_date },
                      { header: "Mode", nowrap: true, value: (r) => cardexCommModeLabel(r.mode) },
                      { header: "Person Contacted", preWrap: true, value: (r) => r.person_contacted ?? "" },
                      { header: "Purpose / Concern", preWrap: true, value: (r) => r.purpose },
                      { header: "Agreement / Action", preWrap: true, value: (r) => r.outcome ?? "" },
                    ]}
                    buildPayload={(v) => ({
                      communication_date: v.communication_date,
                      mode: v.mode,
                      person_contacted:
                        v.person_contacted?.trim() ||
                        selectedLearner?.parent_guardian_name ||
                        null,
                      purpose: v.purpose.trim(),
                      outcome: v.outcome?.trim() || null,
                    })}
                    rowToInitial={(r) => ({
                      communication_date: r.communication_date ?? "",
                      mode: r.mode ?? "",
                      person_contacted: r.person_contacted ?? "",
                      purpose: r.purpose ?? "",
                      outcome: r.outcome ?? "",
                    })}
                    onPrint={(rows) =>
                      generateCardexCommunicationPrint({
                        student: selectedLearner!,
                        sectionName: learnerMeta.sectionName,
                        gradeLevel: learnerMeta.gradeLevel,
                        schoolId,
                        schoolYear,
                        entries: rows,
                        adviserName: user?.name ?? null,
                      })
                    }
                  />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
