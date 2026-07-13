/**
 * Printable Anecdotal Record for a single learner (class-adviser tool).
 */
import { printHTMLContent } from "@/lib/pdf/utils";
import type { AnecdotalRecord, Student } from "@/types";
import {
  buildLearnerRecordDocument,
  esc,
  fetchLearnerPrintContext,
  fmtDate,
} from "@/lib/pdf/learnerRecordPrint";

export interface AnecdotalPrintParams {
  student: Student;
  sectionName?: string | null;
  gradeLevel?: number | null;
  schoolId: string | number | null;
  schoolYear: string;
  records: AnecdotalRecord[];
  adviserName?: string | null;
}

export async function generateAnecdotalRecordPrint(
  params: AnecdotalPrintParams,
): Promise<void> {
  const context = await fetchLearnerPrintContext(params.schoolId);

  const rows = params.records
    .map(
      (r) => `<tr>
        <td class="date-col">${esc(fmtDate(r.observation_date))}</td>
        <td>${esc(r.setting)}</td>
        <td>${esc(r.incident)}</td>
        <td>${esc(r.interpretation)}</td>
        <td>${esc(r.action_taken)}</td>
      </tr>`,
    )
    .join("");

  const bodyHtml =
    params.records.length === 0
      ? `<div class="empty-note">No anecdotal observations recorded.</div>`
      : `<table class="entries-table">
          <thead>
            <tr>
              <th style="width:12%">Date</th>
              <th style="width:13%">Setting</th>
              <th style="width:33%">Anecdote / Observed Behavior</th>
              <th style="width:22%">Interpretation</th>
              <th style="width:20%">Action Taken</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;

  const html = buildLearnerRecordDocument({
    formTitle: "Anecdotal Record",
    learner: {
      student: params.student,
      sectionName: params.sectionName,
      gradeLevel: params.gradeLevel,
    },
    schoolYear: params.schoolYear,
    context,
    bodyHtml,
    adviserName: params.adviserName,
  });

  printHTMLContent(html);
}
