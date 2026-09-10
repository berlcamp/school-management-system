/**
 * RMA scoresheet → printed A4.
 *
 * This is the same document as the Excel download, on paper: the division
 * issues `RMA2_G2Scoresheet_v5b.xlsx`, and a school that prints the sheet to
 * fill in by hand — or to file beside the workbook — needs the two to carry the
 * same header block, the same columns in the same order and the same levelling.
 * `lib/excel/generateRmaScoresheetWorkbook.ts` fills the issued file; this
 * reproduces its layout for the printer.
 *
 * Everything either of them formats or bands comes from
 * `lib/assessments/rmaFormat.ts`, so the paper and the workbook cannot drift
 * apart the way the report card and SF9 did before migration 153.
 *
 * The one deliberate difference is the task columns. The workbook's row 8
 * carries the task name *and* its full question, which is fine in a cell that
 * can be widened but would leave 22 columns unreadable across a landscape A4.
 * The column header therefore shows the task name over its maximum score — the
 * workbook's rows 8 and 9 stacked — and the questions are printed in full in a
 * legend beneath the table, where nothing is lost.
 */

import {
  learnerName,
  masteryForScore,
  percentage,
  taskName,
} from "@/lib/assessments/rmaFormat";
import { supabase } from "@/lib/supabase/client";
import { RmaBand, RmaItem, RmaMaterial, Student } from "@/types";
import {
  buildDepEdHeaderWithLogos,
  DEPED_BASE_STYLES,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "./utils";

interface RecordMeta {
  recordId?: string;
  date_assessed: string | null;
  remarks: string | null;
}

export interface RmaScoresheetParams {
  schoolId: number | null;
  material: RmaMaterial;
  items: RmaItem[];
  bands: RmaBand[];
  /** Male group then female group, each already in the table's display order. */
  students: Student[];
  scores: Record<string, Record<string, number | null>>;
  meta: Record<string, RecordMeta>;
  sectionName: string;
  gradeLevel: number;
  teacherName: string;
  /** BoSY | MoSY | EoSY — the issued C4 dropdown's own values. */
  phase: string;
  schoolYear: string;
  maxTotal: number;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function levelClass(label: string): string {
  if (label === "Intervention") return "lvl-red";
  if (label === "Consolidation") return "lvl-amber";
  if (label === "Enhancement") return "lvl-green";
  return "";
}

/** "2015-06-15" → "06/15/2015", the form's own date style. Blank stays blank. */
function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return m ? `${m[2]}/${m[3]}/${m[1]}` : String(value);
}

/**
 * The table body. Learners are listed male group first then female, numbered
 * straight through, exactly as the workbook fills rows 10 onward — the Sex
 * column and the header's Male/Female counts are how the issued form separates
 * the two, so no group banner is printed that the workbook does not have.
 */
function buildRows(params: RmaScoresheetParams): string {
  const { items, bands, students, scores, meta, maxTotal } = params;
  return students
    .map((s, index) => {
      const studentScores = scores[s.id] || {};
      const entered = items.some((it) => {
        const v = studentScores[it.id];
        return v !== undefined && v !== null;
      });
      const total = items.reduce(
        (sum, it) => sum + (Number(studentScores[it.id] ?? 0) || 0),
        0,
      );
      const pct = percentage(total, maxTotal);
      const level = entered ? (masteryForScore(bands, total, maxTotal) ?? "") : "";
      const taskCells = items
        .map((it) => {
          const v = studentScores[it.id];
          return `<td class="c">${v === undefined || v === null ? "" : v}</td>`;
        })
        .join("");
      return `<tr>
      <td class="c">${index + 1}</td>
      <td class="c lrn">${escapeHtml(s.lrn ?? "")}</td>
      <td class="nm">${escapeHtml(learnerName(s))}</td>
      <td class="c">${s.gender === "female" ? "Female" : "Male"}</td>
      <td class="c">${escapeHtml(formatDate(s.date_of_birth))}</td>
      <td class="c">${escapeHtml(formatDate(meta[s.id]?.date_assessed))}</td>
      <td>${escapeHtml(s.mother_tongue ?? "")}</td>
      ${taskCells}
      <td class="c b">${entered ? total : ""}</td>
      <td class="c">${entered ? `${pct.toFixed(2)}%` : ""}</td>
      <td class="c ${levelClass(level)}">${escapeHtml(level)}</td>
      <td>${escapeHtml(meta[s.id]?.remarks ?? "")}</td>
    </tr>`;
    })
    .join("");
}

/** The whole sheet as HTML. Exported so the tests can read it without a printer. */
export function buildRmaScoresheetHtml(
  params: RmaScoresheetParams & {
    schoolName: string;
    schoolCode: string | null;
    region: string | null;
  },
): string {
  const {
    material,
    items,
    bands,
    students,
    sectionName,
    gradeLevel,
    teacherName,
    phase,
    schoolYear,
    maxTotal,
    schoolName,
    schoolCode,
    region,
  } = params;

  const males = students.filter((s) => s.gender !== "female").length;
  const females = students.filter((s) => s.gender === "female").length;

  const bandsLegend = bands
    .map(
      (b) =>
        `<span class="chip">${Number(b.min_score)}–${Number(b.max_score)}% · ${escapeHtml(b.label)}</span>`,
    )
    .join("");

  // Only tasks whose question adds something the column header does not say.
  const taskLegend = items
    .map((it, i) => {
      const q = it.question_text?.trim();
      const name = taskName(it, i);
      return q && q !== name
        ? `<div><strong>${escapeHtml(name)}</strong> — ${escapeHtml(q)}</div>`
        : "";
    })
    .filter(Boolean)
    .join("");

  const taskHeaders = items
    .map((it, i) => `<th class="task">${escapeHtml(taskName(it, i))}</th>`)
    .join("");
  const taskMaxes = items
    .map((it) => `<th class="task mx">${Number(it.max_score)}</th>`)
    .join("");

  const field = (label: string, value: string) =>
    `<div class="fld"><span class="lbl">${label}</span><span class="val">${escapeHtml(value)}</span></div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
@page { size: A4 landscape; margin: 8mm; }
.sub-title { text-align:center; font-weight:bold; font-size:11pt; margin: 4px 0 8px; }
.hdr { display:grid; grid-template-columns:repeat(3, 1fr); gap:2px 18px; font-size:9pt; margin-bottom:8px; }
.fld { display:flex; gap:6px; align-items:baseline; }
.fld .lbl { font-weight:bold; white-space:nowrap; }
.fld .val { border-bottom:1px solid #000; flex:1; min-height:12px; }
.legend { display:flex; gap:8px; flex-wrap:wrap; font-size:8.5pt; margin-bottom:6px; align-items:center; }
.legend .chip { border:1px solid #333; border-radius:10px; padding:1px 7px; background:#f6f6f6; }
table.sheet { width:100%; border-collapse:collapse; table-layout:fixed; }
table.sheet th, table.sheet td { border:1px solid #000; padding:2px 3px; font-size:8pt; }
table.sheet th { background:#eee; text-align:center; vertical-align:middle; }
th.task { width:22px; font-size:7pt; }
th.task.mx { font-weight:normal; background:#f7f7f7; }
th.sn { width:20px; } th.lrn { width:70px; } th.nm { width:130px; }
th.sx { width:34px; } th.dt { width:52px; } th.mt { width:56px; }
th.tot { width:34px; } th.pct { width:40px; } th.lvl { width:66px; } th.rmk { width:80px; }
td.c { text-align:center; } td.b { font-weight:bold; }
td.lrn { font-family:monospace; font-size:7pt; }
td.nm { font-size:7.5pt; }
.lvl-red { color:#b91c1c; font-weight:bold; }
.lvl-amber { color:#b45309; font-weight:bold; }
.lvl-green { color:#15803d; font-weight:bold; }
thead { display:table-header-group; }
tr { break-inside:avoid; }
.tasks { margin-top:8px; font-size:8pt; }
.tasks .ttl { font-weight:bold; margin-bottom:2px; }
</style></head><body>
${buildDepEdHeaderWithLogos(
  `<div class="school-name">${escapeHtml(schoolName || "Department of Education")}</div>
   <div class="form-title">Rapid Mathematics Assessment (RMA)</div>`,
)}
<div class="sub-title">${escapeHtml(material.title)}</div>
<div class="hdr">
  ${field("Assessment Type:", phase)}
  ${field("Region:", region ?? "")}
  ${field("School ID:", schoolCode ?? "")}
  ${field("School Name:", schoolName)}
  ${field("Grade:", `Grade ${gradeLevel}`)}
  ${field("Teacher:", teacherName || "")}
  ${field("Section:", sectionName || "")}
  ${field("School Year:", schoolYear)}
  ${field("No. of Male / Female:", `${males} / ${females}`)}
</div>
<div class="legend"><strong>Levelling of Learners</strong> ${bandsLegend}</div>
<table class="sheet">
  <thead>
    <tr>
      <th class="sn" rowspan="2">S/N</th>
      <th class="lrn" rowspan="2">LRN</th>
      <th class="nm" rowspan="2">Name of Learner</th>
      <th class="sx" rowspan="2">Sex</th>
      <th class="dt" rowspan="2">Birthdate</th>
      <th class="dt" rowspan="2">Date of Assessment</th>
      <th class="mt" rowspan="2">Mother Tongue</th>
      ${taskHeaders}
      <th class="tot" rowspan="2">TOTAL SCORE (${maxTotal})</th>
      <th class="pct" rowspan="2">% of Correct Answer</th>
      <th class="lvl" rowspan="2">Levelling of Learners</th>
      <th class="rmk" rowspan="2">Remarks</th>
    </tr>
    <tr>${taskMaxes}</tr>
  </thead>
  <tbody>${buildRows(params)}</tbody>
</table>
${taskLegend ? `<div class="tasks"><div class="ttl">Tasks</div>${taskLegend}</div>` : ""}
</body></html>`;
}

export async function generateRmaScoresheet(
  params: RmaScoresheetParams,
): Promise<void> {
  let schoolName = "";
  let schoolCode: string | null = null;
  let region: string | null = null;

  if (params.schoolId) {
    const { data } = await supabase
      .from("sms_schools")
      .select("school_id, name, region")
      .eq("id", params.schoolId)
      .single();
    schoolName = data?.name ?? "";
    schoolCode = data?.school_id ?? null;
    region = data?.region ?? null;
  }

  printHTMLContent(
    buildRmaScoresheetHtml({ ...params, schoolName, schoolCode, region }),
  );
}
