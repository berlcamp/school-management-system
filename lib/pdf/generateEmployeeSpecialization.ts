/**
 * Printable: Employee Specialization — three count tables (college major,
 * graduate major, DepEd specialization) by sex, optionally with the roster.
 */

import {
  buildReportDocument,
  esc,
  fetchDivisionHeader,
  fetchReportSchool,
} from "@/lib/pdf/reportShell";
import { printHTMLContent } from "@/lib/pdf/utils";
import {
  SPECIALIZATION_PARTS,
  SpecializationStaff,
  buildSpecializationCounts,
  partLabel,
} from "@/lib/utils/employeeSpecialization";
import { format } from "date-fns";

export interface EmployeeSpecializationPrintParams {
  /** null = division-wide. */
  schoolId: string | number | null;
  staff: SpecializationStaff[];
  withRoster: boolean;
  preparedBy: string;
  principalName: string | null;
  principalTitle: string | null;
}

export async function generateEmployeeSpecializationPrint(
  params: EmployeeSpecializationPrintParams,
): Promise<void> {
  const { schoolId, staff, withRoster, preparedBy, principalName, principalTitle } = params;
  const divisionWide = schoolId === null;
  const school = divisionWide ? await fetchDivisionHeader() : await fetchReportSchool(schoolId);

  const tables = SPECIALIZATION_PARTS.map((part) => {
    const rows = buildSpecializationCounts(staff, part.key);
    return `<h3 style="font-size:10pt; margin:10px 0 4px;">${esc(part.title)}</h3>
<table class="report" style="width:80%; margin:0 auto 8px;">
  <thead><tr><th>Major / Specialization</th><th style="width:10%">Male</th>
  <th style="width:10%">Female</th><th style="width:10%">Total</th></tr></thead>
  <tbody>
    ${rows
      .map(
        (r) => `<tr><td>${esc(r.label)}</td><td class="ctr">${r.male}</td>
<td class="ctr">${r.female}</td><td class="ctr"><b>${r.total}</b></td></tr>`,
      )
      .join("\n")}
    <tr class="subtotal"><td>TOTAL</td>
      <td class="ctr">${rows.reduce((s, r) => s + r.male, 0)}</td>
      <td class="ctr">${rows.reduce((s, r) => s + r.female, 0)}</td>
      <td class="ctr">${staff.length}</td></tr>
  </tbody>
</table>`;
  }).join("\n");

  const roster = withRoster
    ? `<h3 style="font-size:10pt; margin:14px 0 4px;">Employees</h3>
<table class="report" style="width:100%;">
  <thead><tr><th style="width:4%">#</th>${divisionWide ? "<th>School</th>" : ""}
  <th>Name</th><th style="width:5%">Sex</th><th>College Major</th>
  <th>Graduate Major</th><th>DepEd Specialization</th></tr></thead>
  <tbody>
    ${staff
      .map(
        (p, i) => `<tr><td class="ctr">${i + 1}</td>${
          divisionWide ? `<td>${esc(p.school_name)}</td>` : ""
        }<td>${esc(p.name)}</td><td class="ctr">${
          p.gender === "male" ? "M" : p.gender === "female" ? "F" : "—"
        }</td><td>${esc(partLabel("undergrad", p))}</td><td>${esc(
          partLabel("graduate", p),
        )}</td><td>${esc(partLabel("work", p))}</td></tr>`,
      )
      .join("\n")}
  </tbody>
</table>`
    : "";

  const body =
    staff.length > 0
      ? `${tables}${roster}
<p style="font-size:8pt; font-style:italic;">Active staff records only. Answers are
entered by each employee on My Profile. Division office accounts are not counted.</p>`
      : `<p class="empty">No active staff records.</p>`;

  printHTMLContent(
    buildReportDocument({
      school,
      title: "Employee Specialization",
      subtitle: `As of ${format(new Date(), "MMMM d, yyyy")}${divisionWide ? " — All Schools" : ""}`,
      body,
      preparedBy,
      principalName,
      principalTitle,
    }),
  );
}
