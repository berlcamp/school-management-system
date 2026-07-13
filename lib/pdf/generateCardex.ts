/**
 * Printable Learner Cardex sheets for a single learner (class-adviser tool):
 *   - Needs, Progress & Achievement
 *   - Parent/Guardian Communication
 */
import { cardexCommModeLabel } from "@/lib/constants";
import { printHTMLContent } from "@/lib/pdf/utils";
import type { CardexCommunication, CardexNeed, Student } from "@/types";
import {
  buildLearnerRecordDocument,
  esc,
  fetchLearnerPrintContext,
  fmtDate,
} from "@/lib/pdf/learnerRecordPrint";

interface BaseCardexParams {
  student: Student;
  sectionName?: string | null;
  gradeLevel?: number | null;
  schoolId: string | number | null;
  schoolYear: string;
  adviserName?: string | null;
}

export interface CardexNeedsPrintParams extends BaseCardexParams {
  entries: CardexNeed[];
}

export interface CardexCommunicationPrintParams extends BaseCardexParams {
  entries: CardexCommunication[];
}

export async function generateCardexNeedsPrint(
  params: CardexNeedsPrintParams,
): Promise<void> {
  const context = await fetchLearnerPrintContext(params.schoolId);

  const rows = params.entries
    .map(
      (e) => `<tr>
        <td class="date-col">${esc(fmtDate(e.entry_date))}</td>
        <td>${esc(e.need)}</td>
        <td>${esc(e.intervention)}</td>
        <td>${esc(e.progress)}</td>
        <td>${esc(e.remarks)}</td>
      </tr>`,
    )
    .join("");

  const bodyHtml =
    params.entries.length === 0
      ? `<div class="empty-note">No entries recorded.</div>`
      : `<table class="entries-table">
          <thead>
            <tr>
              <th style="width:12%">Date</th>
              <th style="width:26%">Learner's Need</th>
              <th style="width:26%">Intervention / Strategy</th>
              <th style="width:24%">Progress &amp; Achievement</th>
              <th style="width:12%">Remarks</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;

  const html = buildLearnerRecordDocument({
    formTitle: "Learner's Needs, Progress & Achievement",
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

export async function generateCardexCommunicationPrint(
  params: CardexCommunicationPrintParams,
): Promise<void> {
  const context = await fetchLearnerPrintContext(params.schoolId);

  const rows = params.entries
    .map(
      (e) => `<tr>
        <td class="date-col">${esc(fmtDate(e.communication_date))}</td>
        <td>${esc(cardexCommModeLabel(e.mode))}</td>
        <td>${esc(e.person_contacted)}</td>
        <td>${esc(e.purpose)}</td>
        <td>${esc(e.outcome)}</td>
      </tr>`,
    )
    .join("");

  const bodyHtml =
    params.entries.length === 0
      ? `<div class="empty-note">No communication logged.</div>`
      : `<table class="entries-table">
          <thead>
            <tr>
              <th style="width:12%">Date</th>
              <th style="width:14%">Mode</th>
              <th style="width:22%">Person Contacted</th>
              <th style="width:28%">Purpose / Concern</th>
              <th style="width:24%">Agreement / Action Taken</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;

  const html = buildLearnerRecordDocument({
    formTitle: "Parent/Guardian Communication",
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
