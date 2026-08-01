/**
 * SNED Parent/Guardian Consent Form — printable for a tagged learner.
 *
 * Reproduces the DepEd SNED consent form issued after manifestation tagging:
 * the two things the school asks permission for (LIS tagging, medical
 * diagnosis), the three response options, and the Adviser / SNED Coordinator /
 * Principal signatories.
 *
 * The form is printed to be SIGNED ON PAPER, so the response checkboxes and the
 * parent signature line are always blank — the returned form is then recorded
 * back in the app. The only fields filled in are the ones the school already
 * knows: learner, grade level, school year and the adviser's observation.
 */
import {
  buildDepEdHeaderWithLogos,
  DEPED_BASE_STYLES,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "@/lib/pdf/utils";
import { esc, type LearnerPrintContext } from "@/lib/pdf/learnerRecordPrint";
import { getGradeLevelLabel } from "@/lib/constants";
import type { Student } from "@/types";

export interface SnedConsentPrintParams {
  student: Student;
  gradeLevel?: number | null;
  sectionName?: string | null;
  schoolYear: string;
  /** Adviser's observation — the OBSERVATION line on the form. */
  observation?: string | null;
  context: LearnerPrintContext;
  /** SNED School Coordinator from school settings; blank line when unset. */
  snedCoordinatorName?: string | null;
  adviserName?: string | null;
}

function fullName(student: Student): string {
  const mid = student.middle_name ? ` ${student.middle_name}` : "";
  const suffix = student.suffix ? ` ${student.suffix}` : "";
  return `${student.first_name}${mid} ${student.last_name}${suffix}`
    .replace(/\s+/g, " ")
    .trim();
}

export function generateSnedConsentForm(params: SnedConsentPrintParams): void {
  const {
    student,
    gradeLevel,
    schoolYear,
    observation,
    context,
    snedCoordinatorName,
    adviserName,
  } = params;

  const header = buildDepEdHeaderWithLogos(`
    <div class="republic">Republic of the Philippines</div>
    <div class="dept">Department of Education</div>
    <div class="school-name">${esc(context.schoolName) || "&nbsp;"}</div>
    ${context.schoolAddress ? `<div class="school-address">${esc(context.schoolAddress)}</div>` : ""}
  `);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SNED Consent Form - ${esc(fullName(student))}</title>
<style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
.republic { font-size: 11pt; }
.dept { font-size: 15pt; font-weight: bold; margin-bottom: 2px; }
.school-name { font-size: 12pt; }
.consent-title {
  text-align: center;
  font-size: 13pt;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 22px 0 18px;
}
.salutation { margin-bottom: 8px; }
p.body-text { text-align: justify; text-indent: 0.4in; margin-bottom: 10px; }
ol.asks { margin: 0 0 12px 0.6in; }
ol.asks li { margin-bottom: 8px; text-align: justify; }
ol.asks li .ask-head { font-weight: bold; text-transform: uppercase; }
.fields { margin: 18px 0 14px; }
.field-row { display: flex; gap: 18px; margin-bottom: 12px; }
.field { flex: 1; display: flex; align-items: flex-end; gap: 6px; }
.field-label { font-weight: bold; white-space: nowrap; }
.field-value {
  flex: 1;
  border-bottom: 1px solid #000;
  min-height: 18px;
  padding: 0 4px 1px;
}
.options { margin: 14px 0 10px; }
.option { display: flex; gap: 8px; margin-bottom: 12px; align-items: flex-start; }
.option .box { flex-shrink: 0; width: 14px; height: 14px; border: 1px solid #000; margin-top: 3px; }
.option .option-text { flex: 1; text-align: justify; }
.reason-line { border-bottom: 1px solid #000; display: block; height: 16px; margin-top: 6px; }
.parent-sign { margin: 26px 0 8px; text-align: center; }
.parent-sign .line { border-top: 1px solid #000; width: 62%; margin: 34px auto 3px; }
.parent-sign .caption { font-size: 10pt; font-weight: bold; text-transform: uppercase; }
.closing { margin-top: 18px; }
.sign-grid { display: flex; justify-content: space-between; gap: 24px; margin-top: 30px; }
.sign-block { width: 46%; text-align: center; }
.sign-name {
  border-top: 1px solid #000;
  margin-top: 26px;
  padding-top: 3px;
  font-weight: bold;
  text-transform: uppercase;
}
.sign-role { font-size: 10pt; }
.noted { margin-top: 26px; }
</style>
</head>
<body>
${header}

<div class="consent-title">SNED Parent / Guardian Consent Form</div>

<div class="salutation">Dear Parent/Guardian,</div>

<p class="body-text">
  We are committed to ensuring the well-being and academic success of all
  learners in our school. As part of this effort, your child has been identified
  as needing additional support and may require:
</p>

<ol class="asks">
  <li>
    <span class="ask-head">Tagging in the Learner Information System.</span>
    This will reflect your child&rsquo;s need for specific educational support.
  </li>
  <li>
    <span class="ask-head">Medical Diagnosis.</span>
    This will involve a formal evaluation by qualified medical professionals to
    understand better and address your child&rsquo;s learning needs.
  </li>
</ol>

<p class="body-text">
  We assure you that all information gathered will remain confidential and will
  be used solely to provide the best possible support for your child.
</p>

<div class="fields">
  <div class="field-row">
    <div class="field" style="flex: 2;">
      <span class="field-label">CHILD&rsquo;S NAME:</span>
      <span class="field-value">${esc(fullName(student))}</span>
    </div>
    <div class="field">
      <span class="field-label">GRADE LEVEL:</span>
      <span class="field-value">${gradeLevel != null ? esc(getGradeLevelLabel(gradeLevel)) : "&nbsp;"}</span>
    </div>
  </div>
  <div class="field-row">
    <div class="field" style="flex: 2;">
      <span class="field-label">OBSERVATION:</span>
      <span class="field-value">${esc(observation) || "&nbsp;"}</span>
    </div>
    <div class="field">
      <span class="field-label">SCHOOL YEAR:</span>
      <span class="field-value">${esc(schoolYear)}</span>
    </div>
  </div>
</div>

<div class="options">
  <div class="option">
    <span class="box"></span>
    <span class="option-text">
      I <strong>AGREE</strong> to have my child tagged in the Learner Information
      System (LIS) and to undergo Medical Assessment.
    </span>
  </div>
  <div class="option">
    <span class="box"></span>
    <span class="option-text">
      I <strong>AGREE</strong> to have my child tagged in the Learner Information
      System (LIS) <strong>ONLY</strong> but not to undergo Medical Assessment.
    </span>
  </div>
  <div class="option">
    <span class="box"></span>
    <span class="option-text">
      I <strong>DO NOT AGREE</strong> to have my child tagged in the Learner
      Information System (LIS) or undergo Medical Assessment because
      <span class="reason-line"></span>
      <span class="reason-line"></span>
    </span>
  </div>
</div>

<div class="parent-sign">
  <div class="line"></div>
  <div class="caption">Signature over Printed Name of Parent/Guardian</div>
</div>

<div class="closing">Sincerely,</div>

<div class="sign-grid">
  <div class="sign-block">
    <div class="sign-name">${esc(adviserName) || "&nbsp;"}</div>
    <div class="sign-role">Class Adviser</div>
  </div>
  <div class="sign-block">
    <div class="sign-name">${esc(snedCoordinatorName) || "&nbsp;"}</div>
    <div class="sign-role">SNED School Coordinator</div>
  </div>
</div>

<div class="noted">Noted by,</div>

<div class="sign-grid">
  <div class="sign-block" style="margin: 0 auto;">
    <div class="sign-name">${esc(context.principalName) || "&nbsp;"}</div>
    <div class="sign-role">${esc(context.principalTitle) || "Principal"}</div>
  </div>
</div>

</body>
</html>`;

  printHTMLContent(html);
}
