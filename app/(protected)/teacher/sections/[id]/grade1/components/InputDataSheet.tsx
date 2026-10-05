"use client";

import { formatLrn } from "@/lib/utils";
import { groupLearnersBySex } from "@/lib/utils/learnerSex";
import type { WorkbookInfo, WorkbookLearner } from "../useGrade1Workbook";
import { formatDob } from "./format";

/**
 * The workbook's INPUT DATA sheet. Read-only here: every value on it already
 * lives in the system — the school record, School Settings (school head), the
 * section and its enrolment — so it is shown for checking, and corrected where
 * it is kept rather than typed a second time.
 */
export function InputDataSheet({ info, learners }: { info: WorkbookInfo; learners: WorkbookLearner[] }) {
  const school: [string, string][] = [
    ["Region", info.region],
    ["Division", info.division],
    ["City / Municipality", info.city],
    ["District", info.district],
    ["School ID", info.schoolCode],
    ["School Name", info.schoolName],
    ["School Year", info.schoolYear],
    ["School Head", info.schoolHead],
  ];
  const teacher: [string, string][] = [
    ["Teacher / Adviser", info.adviserName],
    ["Grade Level", "Grade 1"],
    ["Section", info.sectionName],
  ];
  const groups = groupLearnersBySex(learners, (l) => l.gender);

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto">
      <p className="text-xs text-muted-foreground">
        Filled in from the system. Correct the school record in School Settings / Division Office, and
        learners through Enrollment or Students.
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-4">
          <InfoTable title="School Information" rows={school} />
          <InfoTable title="Teacher, Grade Level, Section Information" rows={teacher} />
        </div>
        <div className="grid content-start gap-4 2xl:grid-cols-2">
          {groups.map((g) => (
            <div key={g.key} className="overflow-x-auto rounded-md border">
              <div className="border-b bg-muted px-3 py-2 text-sm font-semibold">
                {g.label} ({g.rows.length})
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="w-8 px-2 py-1.5 text-right">#</th>
                    <th className="px-2 py-1.5 text-left">Name</th>
                    <th className="px-2 py-1.5 text-left">LRN</th>
                    <th className="px-2 py-1.5 text-left">Birthdate</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {g.rows.map((l, i) => (
                    <tr key={l.id}>
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="whitespace-nowrap px-2 py-1">{l.name}</td>
                      <td className="whitespace-nowrap px-2 py-1 tabular-nums">{formatLrn(l.lrn)}</td>
                      <td className="whitespace-nowrap px-2 py-1 tabular-nums">{formatDob(l.dateOfBirth)}</td>
                    </tr>
                  ))}
                  {g.rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">
                        None
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoTable({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-md border">
      <div className="border-b bg-muted px-3 py-2 text-sm font-semibold">{title}</div>
      <dl className="divide-y text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[9.5rem_1fr] gap-2 px-3 py-1.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={value ? "" : "text-muted-foreground"}>{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
