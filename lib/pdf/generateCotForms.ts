/**
 * COT printables — the three PMES classroom observation annexes.
 *
 *   generateCotRatingSheet     Annex E-2  COT Rating Sheet
 *   generateCotAgreementForm   Annex E-3  COT Inter-Observer Agreement Form
 *   generateCotObservationNotes Annex E-4 COT Observation Notes Form
 *
 * All three reproduce the DepEd documents closely enough to be filed as-is:
 * same header block, same directions, same indicator wording, same signatory
 * lines, same "S.Y. YYYY-YYYY | <career stage>" footer.
 *
 * Two rules the layout depends on:
 *
 *   * The rating columns are the career stage's levels (2-6 / 3-7 / 4-8 / 5-9)
 *     followed by a NO column. They are NOT a fixed 1-5.
 *   * The indicator rows come from the form's own school-year cycle, taken from
 *     the stored `form_cycle_sy`, so reprinting an old form yields the set that
 *     was actually rated rather than this year's set.
 *
 * A form may be printed BLANK (to carry into the classroom) or FILLED (from a
 * saved observation). Passing no ratings yields the blank form, which is why
 * every value below tolerates null.
 */
import {
  CAREER_STAGES,
  cotIndicators,
  type CareerStage,
} from "@/lib/constants/supervision";
import {
  buildDepEdHeaderWithLogos,
  DEPED_BASE_STYLES,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "@/lib/pdf/utils";
import { esc } from "@/lib/pdf/learnerRecordPrint";

/** A rated indicator as saved on an observation. */
export interface CotRatingValue {
  indicator_code: string;
  rating: number | null;
  not_observed: boolean;
  not_applicable: boolean;
}

interface CotFormBase {
  /** Career stage — selects the rating scale and the footer label. */
  careerStage: CareerStage;
  /** School year whose indicator set the form carries, e.g. "2026-2027". */
  formCycleSy: string;
  teacherObserved: string;
  classLabel?: string | null;
  /** Printed verbatim, e.g. "July 13, 2026". */
  date?: string | null;
  quarter?: number | string | null;
  observationRound?: number | null;
  schoolName?: string | null;
  schoolAddress?: string | null;
}

export interface CotRatingSheetParams extends CotFormBase {
  observerName?: string | null;
  ratings?: CotRatingValue[];
  comments?: string | null;
}

export interface CotAgreementFormParams extends CotFormBase {
  /** Up to three observers, in signature-line order. */
  observerNames: (string | null | undefined)[];
  ratings?: CotRatingValue[];
  comments?: string | null;
}

export interface CotObservationNotesParams extends CotFormBase {
  observerName?: string | null;
  timeStarted?: string | null;
  timeEnded?: string | null;
  notes?: string | null;
}

const RITQ_CREDIT =
  "This tool was developed through the Research Institute for Teacher Quality (RITQ)—formerly Research Center for Teacher Quality—with support from the Australian Government.";

const COT_STYLES = `
.pmes-head { text-align: center; margin: 10px 0 4px; }
.pmes-head .system { font-size: 12pt; font-weight: bold; text-transform: uppercase; }
.pmes-head .sy { font-size: 12pt; font-weight: bold; }
.pmes-stage {
  text-align: center;
  font-size: 12pt;
  font-weight: bold;
  text-transform: uppercase;
  margin: 14px 0;
}
.pmes-title {
  text-align: center;
  font-size: 12pt;
  font-weight: bold;
  text-transform: uppercase;
  margin: 10px 0 16px;
  line-height: 1.3;
}
.meta { font-size: 10.5pt; margin-bottom: 10px; }
.meta-row { display: flex; gap: 24px; margin-bottom: 6px; }
.meta-field { display: flex; align-items: flex-end; gap: 5px; flex: 1; }
.meta-field.wide { flex: 2; }
.meta-label { font-weight: bold; white-space: nowrap; text-transform: uppercase; }
.meta-value { flex: 1; border-bottom: 1px solid #000; min-height: 15px; padding: 0 3px 1px; }
.round-line { display: flex; gap: 10px; align-items: center; margin-top: 2px; }
.round-box { display: inline-block; width: 11px; height: 11px; border: 1px solid #000; position: relative; }
.round-box.checked::after {
  content: "\\2713";
  position: absolute;
  top: -4px;
  left: 0;
  font-size: 12pt;
  line-height: 1;
}
.directions { margin: 12px 0 10px; font-size: 10.5pt; }
.directions .dir-head { font-weight: bold; text-transform: uppercase; }
.directions ul { margin: 4px 0 0 0.3in; }
.directions li { margin-bottom: 3px; text-align: justify; }
.note-block { font-size: 10pt; font-style: italic; text-align: justify; margin: 8px 0 10px; }
table.cot { width: 100%; border-collapse: collapse; font-size: 10pt; }
table.cot th, table.cot td { border: 1px solid #000; padding: 4px 5px; vertical-align: middle; }
table.cot th { text-align: center; font-weight: bold; background: #f0f0f0; }
table.cot th.ind, table.cot td.ind { text-align: left; }
table.cot td.ind { line-height: 1.25; }
table.cot col.scale { width: 34px; }
table.cot col.final { width: 90px; }
table.cot td.mark { text-align: center; font-weight: bold; font-size: 12pt; }
table.cot td.final { text-align: center; font-weight: bold; font-size: 12pt; }
table.cot tr.na td { color: #555; }
.footnote { font-size: 9.5pt; margin-top: 6px; }
.comments { margin-top: 12px; }
.comments .label { font-weight: bold; text-transform: uppercase; font-size: 10.5pt; }
.comments .box { border: 1px solid #000; min-height: 70px; padding: 6px; margin-top: 4px; font-size: 10.5pt; white-space: pre-wrap; }
.notes-box { border: 1px solid #000; min-height: 6.2in; padding: 8px; margin-top: 6px; font-size: 11pt; white-space: pre-wrap; }
.sign-single { margin-top: 34px; }
.sign-single .line { border-top: 1px solid #000; width: 3.2in; padding-top: 2px; font-size: 10pt; }
.sign-single .name {
  height: 16px;
  width: 3.2in;
  text-align: center;
  font-weight: bold;
  text-transform: uppercase;
  font-size: 10.5pt;
}
.sign-row { display: flex; justify-content: space-between; gap: 16px; margin-top: 40px; }
.sign-row .cell { flex: 1; }
.sign-row .line { border-top: 1px solid #000; padding-top: 2px; font-size: 9pt; text-align: center; }
.sign-row .name {
  height: 16px;
  text-align: center;
  font-weight: bold;
  text-transform: uppercase;
  font-size: 10.5pt;
}
.form-footer { margin-top: 26px; font-size: 10pt; }
.form-footer .stage-line { font-weight: bold; }
.credit { margin-top: 10px; font-size: 8.5pt; font-style: italic; text-align: justify; }
`;

function header(params: CotFormBase): string {
  return buildDepEdHeaderWithLogos(`
    <div class="republic" style="font-size:11pt;">Republic of the Philippines</div>
    <div style="font-size:14pt;font-weight:bold;">Department of Education</div>
    ${params.schoolName ? `<div style="font-size:12pt;text-transform:uppercase;">${esc(params.schoolName)}</div>` : ""}
    ${params.schoolAddress ? `<div style="font-size:10pt;">${esc(params.schoolAddress)}</div>` : ""}
  `);
}

function pmesHead(params: CotFormBase): string {
  const stage = CAREER_STAGES[params.careerStage];
  return `
<div class="pmes-head">
  <div class="system">Performance Management and Evaluation System (PMES)</div>
  <div class="system">for Teachers</div>
  <div class="sy">(S.Y. ${esc(params.formCycleSy)})</div>
</div>
<div class="pmes-stage">${esc(stage.positionLabel)}</div>`;
}

function roundLine(round: number | null | undefined): string {
  const first = round === 1 ? " checked" : "";
  const second = round === 2 ? " checked" : "";
  return `<div class="round-line">
  <span class="meta-label">Observation:</span>
  <span>1st <span class="round-box${first}"></span></span>
  <span>2nd <span class="round-box${second}"></span></span>
</div>`;
}

function metaBlock(params: CotFormBase, observerRows: string): string {
  return `<div class="meta">
${observerRows}
  <div class="meta-row">
    <div class="meta-field wide">
      <span class="meta-label">Teacher Observed:</span>
      <span class="meta-value">${esc(params.teacherObserved)}</span>
    </div>
    <div class="meta-field">
      <span class="meta-label">Quarter:</span>
      <span class="meta-value">${params.quarter != null && params.quarter !== "" ? esc(String(params.quarter)) : "&nbsp;"}</span>
    </div>
  </div>
  <div class="meta-row">
    <div class="meta-field">
      <span class="meta-label">Subject &amp; Grade Level Taught:</span>
      <span class="meta-value">${esc(params.classLabel) || "&nbsp;"}</span>
    </div>
  </div>
  ${roundLine(params.observationRound)}
</div>`;
}

function formFooter(params: CotFormBase): string {
  const stage = CAREER_STAGES[params.careerStage];
  return `<div class="form-footer">
  <div class="stage-line">S.Y. ${esc(params.formCycleSy)} | ${esc(stage.formLabel)}</div>
  <div class="stage-line">(${esc(stage.positionShort)})</div>
  <div class="credit">${RITQ_CREDIT}</div>
</div>`;
}

function ratingIndex(ratings: CotRatingValue[] | undefined): Map<string, CotRatingValue> {
  return new Map((ratings ?? []).map((r) => [r.indicator_code, r]));
}

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
${COT_STYLES}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Annex E-2 — COT Rating Sheet.
 *
 * One column per level of the career stage plus a NO column; a ✓ lands in the
 * scored column, or in NO. An indicator marked N/A prints "N/A" spanning the
 * scale, per the directions ("For indicators not applicable for the classroom
 * observation period, place 'N/A'").
 */
export function generateCotRatingSheet(params: CotRatingSheetParams): void {
  const stage = CAREER_STAGES[params.careerStage];
  const indicators = cotIndicators(params.formCycleSy);
  const levels: number[] = [];
  for (let n = stage.minRating; n <= stage.maxRating; n++) levels.push(n);
  const byCode = ratingIndex(params.ratings);

  const observerRows = `  <div class="meta-row">
    <div class="meta-field wide">
      <span class="meta-label">Observer:</span>
      <span class="meta-value">${esc(params.observerName) || "&nbsp;"}</span>
    </div>
    <div class="meta-field">
      <span class="meta-label">Date:</span>
      <span class="meta-value">${esc(params.date) || "&nbsp;"}</span>
    </div>
  </div>`;

  const rows = indicators
    .map((ind) => {
      const value = byCode.get(ind.code);
      const label = `${esc(ind.text)} (${esc(ind.code)})`;

      if (value?.not_applicable) {
        return `<tr class="na">
  <td class="ind">${label}</td>
  <td class="mark" colspan="${levels.length + 1}">N/A</td>
</tr>`;
      }

      const cells = levels
        .map(
          (level) =>
            `<td class="mark">${!value?.not_observed && value?.rating === level ? "&#10003;" : "&nbsp;"}</td>`,
        )
        .join("");
      const noCell = `<td class="mark">${value?.not_observed ? "&#10003;" : "&nbsp;"}</td>`;
      return `<tr>
  <td class="ind">${label}</td>
  ${cells}
  ${noCell}
</tr>`;
    })
    .join("\n");

  const body = `${header(params)}
${pmesHead(params)}
<div class="pmes-title">Classroom Observation Tool (COT) &ndash;<br>Rating Sheet</div>
${metaBlock(params, observerRows)}

<div class="directions">
  <div class="dir-head">Directions for the observers:</div>
  <ul>
    <li>Rate each item on the checklist according to how well the teacher performed during the classroom observation. Mark the appropriate column with a (&#10003;) symbol.</li>
    <li>For indicators not applicable for the classroom observation period, place &lsquo;N/A&rsquo;.</li>
    <li>Each indicator is assessed on an individual basis, regardless of its relationship to other indicators.</li>
    <li>For schools with only one observer, this form will serve as the final rating sheet.</li>
  </ul>
</div>

<table class="cot">
  <colgroup>
    <col>
    ${levels.map(() => `<col class="scale">`).join("")}
    <col class="scale">
  </colgroup>
  <thead>
    <tr>
      <th class="ind">Indicators</th>
      ${levels.map((l) => `<th>${l}</th>`).join("")}
      <th>NO*</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>

<div class="footnote">* NO stands for Not Observed which automatically gets a rating of ${stage.notObserved}.</div>

<div class="comments">
  <div class="label">Other comments:</div>
  <div class="box">${esc(params.comments) || "&nbsp;"}</div>
</div>

<div class="sign-row">
  <div class="cell">
    <div class="name">${esc(params.observerName) || "&nbsp;"}</div>
    <div class="line">Signature over Printed Name of the Observer</div>
  </div>
  <div class="cell">
    <div class="name">${esc(params.teacherObserved) || "&nbsp;"}</div>
    <div class="line">Signature over Printed Name of the Teacher</div>
  </div>
</div>

${formFooter(params)}`;

  printHTMLContent(shell(`COT Rating Sheet - ${params.teacherObserved}`, body));
}

/**
 * Annex E-3 — COT Inter-Observer Agreement Form.
 *
 * A single FINAL RATING column, not one column per level: the observers discuss
 * and record one consensual number per indicator. The directions on the form
 * are explicit that this is "NOT an average", so nothing here computes one.
 */
export function generateCotAgreementForm(params: CotAgreementFormParams): void {
  const stage = CAREER_STAGES[params.careerStage];
  const indicators = cotIndicators(params.formCycleSy);
  const byCode = ratingIndex(params.ratings);
  const observers = [0, 1, 2].map((i) => params.observerNames[i] ?? "");

  const observerRows = `  <div class="meta-row">
    <div class="meta-field wide">
      <span class="meta-label">Observer 1:</span>
      <span class="meta-value">${esc(observers[0]) || "&nbsp;"}</span>
    </div>
    <div class="meta-field">
      <span class="meta-label">Date:</span>
      <span class="meta-value">${esc(params.date) || "&nbsp;"}</span>
    </div>
  </div>
  <div class="meta-row">
    <div class="meta-field wide">
      <span class="meta-label">Observer 2:</span>
      <span class="meta-value">${esc(observers[1]) || "&nbsp;"}</span>
    </div>
    <div class="meta-field"></div>
  </div>
  <div class="meta-row">
    <div class="meta-field wide">
      <span class="meta-label">Observer 3:</span>
      <span class="meta-value">${esc(observers[2]) || "&nbsp;"}</span>
    </div>
    <div class="meta-field"></div>
  </div>`;

  const rows = indicators
    .map((ind) => {
      const value = byCode.get(ind.code);
      let mark = "&nbsp;";
      if (value?.not_applicable) mark = "N/A";
      else if (value?.rating != null) mark = String(value.rating);
      return `<tr>
  <td class="ind">${esc(ind.text)} (${esc(ind.code)})</td>
  <td class="final">${mark}</td>
</tr>`;
    })
    .join("\n");

  const body = `${header(params)}
${pmesHead(params)}
<div class="pmes-title">Classroom Observation Tool (COT) &ndash;<br>Inter-Observer Agreement Form</div>
${metaBlock(params, observerRows)}

<div class="directions">
  <div class="dir-head">Directions for the observers:</div>
  <p style="text-align:justify;margin-top:4px;">Discuss with the other observers your reason/s for rating in each indicator. In case of different ratings, come up with a final rating. The final rating is NOT an average; it is a rating based on a reasoned and consensual judgment. Indicate this rating on the column for Final Rating.</p>
</div>

<div class="note-block">
  (Note that the language used in the COT indicators is taken from the Proficient Teacher Career Stage of the PPST. Each indicator has 5 levels. The rubrics for Teacher I, Teacher II and Teacher III use levels 2 to 6; the rubrics for Teacher IV, Teacher V, Teacher VI, and Teacher VII use levels 3 to 7; the rubrics for Master Teacher I and Master Teacher II use levels 4 to 8; and the rubrics for Master Teacher III, Master Teacher IV, and Master Teacher V use levels 5 to 9.)
</div>

<table class="cot">
  <colgroup><col><col class="final"></colgroup>
  <thead>
    <tr>
      <th class="ind">Indicators</th>
      <th>Final Rating</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>

<div class="footnote">* NO stands for Not Observed which automatically gets a rating of ${stage.notObserved}.</div>

<div class="comments">
  <div class="label">Other comments:</div>
  <div class="box">${esc(params.comments) || "&nbsp;"}</div>
</div>

<div class="sign-single">
  <div class="name">${esc(params.teacherObserved) || "&nbsp;"}</div>
  <div class="line">Signature over Printed Name of the Teacher</div>
</div>

<div class="sign-row">
  ${observers
    .map(
      (name, i) => `<div class="cell">
    <div class="name">${esc(name) || "&nbsp;"}</div>
    <div class="line">Signature over Printed Name of the Observer ${i + 1}</div>
  </div>`,
    )
    .join("\n  ")}
</div>

${formFooter(params)}`;

  printHTMLContent(
    shell(`COT Inter-Observer Agreement - ${params.teacherObserved}`, body),
  );
}

/**
 * Annex E-4 — COT Observation Notes Form.
 *
 * Career-stage independent in the source document (no scale, no indicator list),
 * so the footer omits the stage line the rated forms carry.
 */
export function generateCotObservationNotes(
  params: CotObservationNotesParams,
): void {
  const body = `${header(params)}
<div class="pmes-head">
  <div class="system">Performance Management and Evaluation System (PMES)</div>
  <div class="system">for Teachers</div>
</div>
<div class="pmes-title">Classroom Observation Tool (COT) &ndash;<br>Observation Notes Form</div>

<div class="meta">
  <div class="meta-row">
    <div class="meta-field wide">
      <span class="meta-label">Observer:</span>
      <span class="meta-value">${esc(params.observerName) || "&nbsp;"}</span>
    </div>
    <div class="meta-field">
      <span class="meta-label">Date:</span>
      <span class="meta-value">${esc(params.date) || "&nbsp;"}</span>
    </div>
  </div>
  <div class="meta-row">
    <div class="meta-field wide">
      <span class="meta-label">Teacher Observed:</span>
      <span class="meta-value">${esc(params.teacherObserved)}</span>
    </div>
    <div class="meta-field">
      <span class="meta-label">Time Started:</span>
      <span class="meta-value">${esc(params.timeStarted) || "&nbsp;"}</span>
    </div>
  </div>
  <div class="meta-row">
    <div class="meta-field wide">
      <span class="meta-label">Subject &amp; Grade Level Taught:</span>
      <span class="meta-value">${esc(params.classLabel) || "&nbsp;"}</span>
    </div>
    <div class="meta-field">
      <span class="meta-label">Time Ended:</span>
      <span class="meta-value">${esc(params.timeEnded) || "&nbsp;"}</span>
    </div>
  </div>
  ${roundLine(params.observationRound)}
</div>

<div class="directions">
  <div class="dir-head">Directions for the observers:</div>
  <p style="margin-top:4px;">Write your observations on the teacher&rsquo;s classroom performance on the space provided. Use additional sheets whenever necessary.</p>
</div>

<div class="notes-box">${esc(params.notes) || "&nbsp;"}</div>

<div class="sign-single">
  <div class="name">${esc(params.observerName) || "&nbsp;"}</div>
  <div class="line">Signature over Printed Name of the Observer</div>
</div>

<div class="form-footer">
  <div class="credit">${RITQ_CREDIT}</div>
</div>`;

  printHTMLContent(
    shell(`COT Observation Notes - ${params.teacherObserved}`, body),
  );
}
