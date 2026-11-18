"use client";

/**
 * Division office and super admin: Form 1A, the midline master list and Form
 * 1B for every school's programme in one list, with a School column. Printed
 * or downloaded as Excel. Each school's rows and attendance are computed
 * exactly as that school's own Forms tab computes them — the midline list
 * counts attendance up to that school's own midline weighing date.
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SBFP_FORMS } from "@/lib/constants/sbfp";
import {
  downloadSbfpForm1Excel,
  type SbfpForm1Kind,
} from "@/lib/excel/generateSbfpForm1Workbook";
import { printSbfpForm1Division, type SbfpHeaderInfo } from "@/lib/pdf/generateSbfpForms";
import {
  fetchBeneficiaryViews,
  fetchDivisionPrograms,
  fetchFeedingDays,
  fetchFeedingRecords,
  type SbfpProgram,
} from "@/lib/sbfp/queries";
import {
  feedingAttendance,
  type FeedingAttendance,
  type SbfpBeneficiaryView,
} from "@/lib/utils/sbfp";
import { FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

const FORM1_KEYS: SbfpForm1Kind[] = ["1A", "1M", "1B"];

/** Schools fetched at once — each is several requests. */
const CONCURRENCY = 4;

interface DivisionData {
  info: SbfpHeaderInfo;
  rows: SbfpBeneficiaryView[];
  attendance: Map<string, FeedingAttendance>;
  schoolOf: (row: SbfpBeneficiaryView) => string;
}

async function attendanceFor(
  program: SbfpProgram,
  rows: SbfpBeneficiaryView[],
  through: string | null,
): Promise<[string, FeedingAttendance][]> {
  const [allDays, records] = await Promise.all([
    fetchFeedingDays(program.id),
    fetchFeedingRecords(rows.map((r) => r.id)),
  ]);
  const days = through ? allDays.filter((d) => d <= through) : allDays;
  return rows.map((r) => [r.id, feedingAttendance(records.get(r.id) ?? new Map(), days)]);
}

async function loadDivision(kind: SbfpForm1Kind, schoolYear: string): Promise<DivisionData> {
  const programs = await fetchDivisionPrograms(schoolYear);
  const perSchool: { rows: SbfpBeneficiaryView[]; att: [string, FeedingAttendance][] }[] =
    new Array(programs.length);

  let next = 0;
  const worker = async () => {
    while (next < programs.length) {
      const i = next++;
      const { program } = programs[i];
      const rows = await fetchBeneficiaryViews(program);
      const att =
        kind === "1A" || rows.length === 0
          ? []
          : await attendanceFor(
              program,
              rows,
              kind === "1M" ? program.midline_weighing_date : null,
            );
      perSchool[i] = { rows, att };
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const schoolByRow = new Map<string, string>();
  const rows: SbfpBeneficiaryView[] = [];
  const attendance = new Map<string, FeedingAttendance>();
  programs.forEach(({ schoolName }, i) => {
    for (const r of perSchool[i].rows) {
      rows.push(r);
      schoolByRow.set(r.id, schoolName);
    }
    for (const [id, a] of perSchool[i].att) attendance.set(id, a);
  });

  const first = programs[0]?.program;
  const info: SbfpHeaderInfo = {
    schoolName: "All Schools",
    depedSchoolId: "",
    region: first?.region ?? "",
    division: first?.division_name ?? "",
    district: "",
    municipalityBarangay: "",
    schoolYear,
    principalName: "",
    principalTitle: "",
    focalPersonName: "",
    feedingStartDate: null,
    feedingEndDate: null,
    midlineWeighingDate: null,
    isLastMileSchool: null,
  };

  return { info, rows, attendance, schoolOf: (r) => schoolByRow.get(r.id) ?? "" };
}

export function DivisionFormsCard({ schoolYear }: { schoolYear: string }) {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (kind: SbfpForm1Kind, as: "print" | "xlsx") => {
    setBusy(`${kind}-${as}`);
    try {
      const d = await loadDivision(kind, schoolYear);
      if (d.rows.length === 0) {
        toast.error(`No beneficiaries in any school for SY ${schoolYear}`);
        return;
      }
      if (as === "print") {
        printSbfpForm1Division(kind, d.info, d.rows, d.attendance, d.schoolOf);
      } else {
        downloadSbfpForm1Excel(kind, d.info, d.rows, d.attendance, { schoolOf: d.schoolOf });
      }
    } catch (err) {
      console.error(`Error generating division SBFP Form ${kind}:`, err);
      toast.error("Failed to generate the consolidated form");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">All schools — consolidated master lists</CardTitle>
        <CardDescription>
          Form 1A, the midline master list and Form 1B for every school&apos;s
          programme in SY {schoolYear}, in one list with a School column.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {FORM1_KEYS.map((key) => {
          const f = SBFP_FORMS.find((x) => x.key === key)!;
          return (
            <div
              key={key}
              className="flex flex-wrap items-center justify-between gap-2 border-b last:border-b-0 pb-2"
            >
              <div className="text-sm">
                <span className="font-medium">{f.code}</span> — {f.title}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => run(key, "print")}
                  disabled={busy !== null}
                >
                  {busy === `${key}-print` ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4 mr-2" />
                  )}
                  Print
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => run(key, "xlsx")}
                  disabled={busy !== null}
                >
                  {busy === `${key}-xlsx` ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                  )}
                  Excel
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
