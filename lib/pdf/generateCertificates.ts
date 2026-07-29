/**
 * Printable: Certificate of Enrollment and Certificate of Good Moral Character.
 *
 * One portrait page per learner. Both certificates share the same DepEd header,
 * body layout and signatory block — only the title and the certifying paragraph
 * differ, so they are built from one template.
 */

import { getGradeLevelLabel } from "@/lib/constants";
import { esc, fetchReportSchool, ReportSchool } from "@/lib/pdf/reportShell";
import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "@/lib/pdf/utils";

export type CertificateType = "enrollment" | "good_moral";

export const CERTIFICATE_TITLES: Record<CertificateType, string> = {
  enrollment: "Certificate of Enrollment",
  good_moral: "Certificate of Good Moral Character",
};

export interface CertificateLearner {
  studentId: string;
  /** Rendered as-is on the certificate, e.g. "JUAN P. DELA CRUZ". */
  fullName: string;
  lrn: string;
  gradeLevel: number;
  sectionName: string;
}

export interface CertificatePrintParams {
  schoolId: string | number;
  type: CertificateType;
  schoolYear: string;
  learners: CertificateLearner[];
  /** Staff member issuing the certificate (registrar / school head office). */
  preparedBy: string;
  preparedByTitle?: string | null;
  principalName: string | null;
  principalTitle: string | null;
}

const CERTIFICATE_STYLES = `
@page { size: 8.5in 11in; margin: 0.75in; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Times New Roman", serif;
  font-size: 12pt;
  line-height: 1.5;
  color: #000;
  background: #fff;
}
${DEPED_HEADER_LOGOS_STYLES}
.school-name { font-size: 14pt; font-weight: bold; text-transform: uppercase; }
.school-address { font-size: 10pt; }
.certificate { page-break-after: always; }
.certificate:last-child { page-break-after: auto; }
.cert-title {
  text-align: center;
  font-size: 16pt;
  font-weight: bold;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin: 40px 0 30px;
}
.salutation { font-weight: bold; margin-bottom: 18px; }
.body-text { text-align: justify; text-indent: 0.5in; margin-bottom: 16px; }
.learner-name { font-weight: bold; text-transform: uppercase; }
.detail { font-weight: bold; }
.signatories { margin-top: 60px; display: flex; justify-content: space-between; gap: 40px; }
.sig-block { width: 45%; font-size: 11pt; }
.sig-label { margin-bottom: 34px; }
.sig-name { border-top: 1px solid #000; padding-top: 3px; font-weight: bold; text-transform: uppercase; text-align: center; }
.sig-title { text-align: center; font-size: 10pt; }
.footnote { margin-top: 40px; font-size: 9pt; font-style: italic; }
@media print {
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .certificate { break-inside: avoid; }
}
`;

/** "29th day of July, 2026" — the wording DepEd certifications use. */
function formatIssuedDate(date: Date): string {
  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const month = date.toLocaleDateString("en-US", { month: "long" });
  return `${day}${suffix} day of ${month}, ${date.getFullYear()}`;
}

function buildCertificateBody(
  type: CertificateType,
  learner: CertificateLearner,
  school: ReportSchool,
  schoolYear: string,
): string {
  const name = `<span class="learner-name">${esc(learner.fullName)}</span>`;
  const grade = esc(getGradeLevelLabel(learner.gradeLevel));
  const section = esc(learner.sectionName);
  const lrn = esc(learner.lrn);
  const schoolName = esc(school.name);

  if (type === "enrollment") {
    return `
<p class="body-text">
  This is to certify that ${name}, with Learner Reference Number (LRN)
  <span class="detail">${lrn}</span>, is officially enrolled in
  <span class="detail">${grade} &mdash; ${section}</span> at
  <span class="detail">${schoolName}</span> for School Year
  <span class="detail">${esc(schoolYear)}</span>.
</p>
<p class="body-text">
  This certification is issued upon the request of the above-named learner
  for whatever legal purpose it may serve.
</p>`;
  }

  return `
<p class="body-text">
  This is to certify that ${name}, with Learner Reference Number (LRN)
  <span class="detail">${lrn}</span>, is a bona fide learner of
  <span class="detail">${schoolName}</span>, enrolled in
  <span class="detail">${grade} &mdash; ${section}</span> during School Year
  <span class="detail">${esc(schoolYear)}</span>.
</p>
<p class="body-text">
  This further certifies that the above-named learner is of good moral
  character and has not been subjected to any disciplinary action by this
  school as of the date of this certification.
</p>
<p class="body-text">
  This certification is issued upon the request of the above-named learner
  for whatever legal purpose it may serve.
</p>`;
}

function buildCertificatePage(
  params: CertificatePrintParams,
  learner: CertificateLearner,
  school: ReportSchool,
  issuedDate: string,
): string {
  const { type, schoolYear, preparedBy, preparedByTitle } = params;

  const header = buildDepEdHeaderWithLogos(`
    <div style="font-size:10pt;">Republic of the Philippines</div>
    <div style="font-size:10pt;">Department of Education</div>
    <div style="font-size:10pt;">${esc(school.region || "")}</div>
    <div style="font-size:10pt;">${esc(school.district || "")}</div>
    <div class="school-name">${esc(school.name)}</div>
    <div class="school-address">${esc(school.address || "")}</div>
  `);

  return `<div class="certificate">
${header}
<div class="cert-title">${esc(CERTIFICATE_TITLES[type])}</div>
<p class="salutation">TO WHOM IT MAY CONCERN:</p>
${buildCertificateBody(type, learner, school, schoolYear)}
<p class="body-text">
  Issued this ${esc(issuedDate)}${school.address ? ` at ${esc(school.address)}` : ""}.
</p>
<div class="signatories">
  <div class="sig-block">
    <div class="sig-label">Prepared by:</div>
    <div class="sig-name">${esc(preparedBy)}</div>
    <div class="sig-title">${preparedByTitle ? esc(preparedByTitle) : "&nbsp;"}</div>
  </div>
  <div class="sig-block">
    <div class="sig-label">Certified by:</div>
    <div class="sig-name">${esc(params.principalName || "")}</div>
    <div class="sig-title">${esc(params.principalTitle || "Principal")}</div>
  </div>
</div>
<p class="footnote">Not valid without the official dry seal of the school.</p>
</div>`;
}

export async function generateCertificatesPrint(
  params: CertificatePrintParams,
): Promise<void> {
  const { schoolId, type, learners } = params;

  if (learners.length === 0) {
    throw new Error("No learners selected for this certificate.");
  }

  const school = await fetchReportSchool(schoolId);
  const issuedDate = formatIssuedDate(new Date());

  const pages = learners
    .map((learner) => buildCertificatePage(params, learner, school, issuedDate))
    .join("\n");

  printHTMLContent(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(CERTIFICATE_TITLES[type])}</title>
  <style>${CERTIFICATE_STYLES}</style>
</head>
<body>
${pages}
</body>
</html>`);
}
