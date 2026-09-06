import {
  blockColSpan,
  blockPS,
  blockWS,
  blocksOf,
  descriptor,
  groupBlocks,
  hasNestedBlocks,
  initialGrade,
  isWeightedBlock,
  itemWS,
  itemsOfBlock,
  maxTotalOf,
  rawTotalOf,
  schemeOf,
  termGrade,
} from "@/app/(protected)/teacher/class-record/components/classRecordUtils";
import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";
import {
  ClassRecord,
  ClassRecordBlockRow,
  ClassRecordItem,
  Student,
} from "@/types";

export interface ClassRecordPrintParams {
  schoolId: number | null;
  subjectName: string;
  sectionName: string;
  schoolYear: string;
  termLabel: string;
  teacherName: string;
  record: ClassRecord;
  /** Empty on a standard record — its three weight columns are the blocks. */
  blockRows: ClassRecordBlockRow[];
  items: ClassRecordItem[];
  students: Student[];
  scores: Record<string, Record<string, number | null>>; // studentId -> itemId -> score
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function generateClassRecordPrint(
  params: ClassRecordPrintParams
): Promise<void> {
  const {
    schoolId,
    subjectName,
    sectionName,
    schoolYear,
    termLabel,
    teacherName,
    record,
    blockRows,
    items,
    students,
    scores,
  } = params;

  // School header + principal signatory.
  let schoolName = "";
  let schoolAddress = "";
  let principalName = "";
  let principalTitle = "Principal";
  if (schoolId) {
    const { data: school } = await supabase
      .from("sms_schools")
      .select("name, address, district")
      .eq("id", schoolId)
      .maybeSingle();
    if (school) {
      schoolName = school.name ?? "";
      schoolAddress = [school.address, school.district].filter(Boolean).join(", ");
    }
    const { data: settings } = await supabase
      .from("sms_school_settings")
      .select("principal_name, principal_title")
      .eq("school_id", String(schoolId))
      .maybeSingle();
    if (settings) {
      principalName = settings.principal_name ?? "";
      principalTitle = settings.principal_title ?? "Principal";
    }
  }

  // Column headings and the descriptor band both follow the scheme the record
  // was graded under, so reprinting an old term reproduces the old form; the
  // blocks follow its layout, so a GMRC record prints its six domains.
  const scheme = schemeOf(record);
  const blocks = blocksOf(record, blockRows);
  const nested = hasNestedBlocks(blocks);
  const headerRows = nested ? 4 : 3;
  const spanOf = (b: (typeof blocks)[number]) => blockColSpan(items, b);

  const males = students.filter((s) => s.gender === "male");
  const females = students.filter((s) => s.gender === "female");
  const totalCols = 1 + blocks.reduce((n, b) => n + spanOf(b), 0) + 3;

  // ----- header rows --------------------------------------------------------
  // Only a nested form needs the component row above its blocks.
  const componentHeader = nested
    ? groupBlocks(blocks, scheme)
        .map(
          (g) =>
            `<th colspan="${g.blocks.reduce((n, b) => n + spanOf(b), 0)}">${esc(g.title)}</th>`
        )
        .join("")
    : "";

  const groupHeader = blocks
    .map((b) => `<th colspan="${spanOf(b)}">${esc(b.label)} (${b.weight}%)</th>`)
    .join("");

  // The Examinations block prints one weighted score per exam where a pooled
  // block prints a TOTAL, and carries each exam's weight in the HPS row —
  // the DepEd form's own layout.
  const numberHeader = blocks
    .map((b) => {
      const colItems = itemsOfBlock(items, b);
      const cols = colItems.map((_, i) => `<th>${i + 1}</th>`).join("");
      const summary = isWeightedBlock(b)
        ? colItems.map((it) => `<th>WS ${esc(it.label ?? "")}</th>`).join("")
        : "<th>TOTAL</th>";
      return `${cols}${summary}<th>PS</th><th>WS</th>`;
    })
    .join("");

  const titleHeader = blocks
    .map((b) => {
      const colItems = itemsOfBlock(items, b);
      const cols = colItems
        .map((it) => `<th class="title">${esc(it.label ?? "")}</th>`)
        .join("");
      const blanks = isWeightedBlock(b) ? colItems.length + 2 : 3;
      return `${cols}${"<th></th>".repeat(blanks)}`;
    })
    .join("");

  const hpsHeader = blocks
    .map((b) => {
      const colItems = itemsOfBlock(items, b);
      const cols = colItems
        .map((it) => `<th>${Number(it.max_score)}</th>`)
        .join("");
      const summary = isWeightedBlock(b)
        ? colItems.map((it) => `<th>${Number(it.weight ?? 0)}</th>`).join("")
        : `<th>${maxTotalOf(colItems)}</th>`;
      return `${cols}${summary}<th>100</th><th>${b.weight}%</th>`;
    })
    .join("");

  // ----- learner rows -------------------------------------------------------
  const renderLearner = (s: Student, index: number): string => {
    const sc = scores[s.id] || {};
    const hasAny = items.some((i) => sc[i.id] !== undefined && sc[i.id] !== null);
    const body = blocks
      .map((b) => {
        const colItems = itemsOfBlock(items, b);
        const cells = colItems
          .map((it) => {
            const v = sc[it.id];
            return `<td>${v === undefined || v === null ? "" : v}</td>`;
          })
          .join("");
        const ps = blockPS(items, b, sc);
        const ws = blockWS(items, b, sc);
        const summary = isWeightedBlock(b)
          ? colItems
              .map((it) => {
                const w = itemWS(it, sc);
                return `<td>${w === null ? "" : w.toFixed(2)}</td>`;
              })
              .join("")
          : `<td>${colItems.length ? rawTotalOf(colItems, sc) : ""}</td>`;
        return `${cells}${summary}<td>${ps === null ? "" : ps.toFixed(0)}</td><td>${ws === null ? "" : ws.toFixed(2)}</td>`;
      })
      .join("");

    const initial = hasAny ? initialGrade(blocks, items, sc).toFixed(2) : "";
    const term = hasAny ? termGrade(record, blocks, items, sc) : "";
    const desc = hasAny
      ? descriptor(termGrade(record, blocks, items, sc), scheme)
      : "";

    return `<tr>
      <td class="name">${index}. ${esc(s.last_name)}, ${esc(s.first_name)}</td>
      ${body}
      <td>${initial}</td><td class="term">${term}</td><td class="desc">${esc(String(desc))}</td>
    </tr>`;
  };

  const groupRow = (label: string) =>
    `<tr class="group"><td colspan="${totalCols}">${label}</td></tr>`;

  const maleRows = males.map((s, i) => renderLearner(s, i + 1)).join("");
  const femaleRows = females.map((s, i) => renderLearner(s, i + 1)).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Class Record — ${esc(subjectName)} — ${esc(sectionName)}</title>
<style>
@page { size: A4 landscape; margin: 0.4in; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #000; }
${DEPED_HEADER_LOGOS_STYLES}
.deped-header-center .l1 { font-size: 12pt; font-weight: bold; text-transform: uppercase; }
.deped-header-center .l2 { font-size: 9pt; }
.deped-header-center .l3 { font-size: 11pt; font-weight: bold; margin-top: 6px; text-transform: uppercase; letter-spacing: 1px; }
.meta { display: flex; justify-content: space-between; font-size: 9pt; margin: 6px 0; }
.meta b { font-weight: bold; }
table.cr { width: 100%; border-collapse: collapse; }
table.cr th, table.cr td { border: 1px solid #000; padding: 2px 3px; text-align: center; }
table.cr td.name, table.cr th.name { text-align: left; white-space: nowrap; }
table.cr th.title { font-weight: normal; font-size: 7pt; }
table.cr tr.group td { text-align: left; font-weight: bold; background: #eee; }
table.cr td.term { font-weight: bold; }
table.cr td.desc { font-size: 7pt; }
.sign { display: flex; justify-content: space-between; margin-top: 28px; font-size: 9pt; }
.sign .box { text-align: center; width: 45%; }
.sign .line { border-top: 1px solid #000; margin-top: 18px; padding-top: 2px; font-weight: bold; text-transform: uppercase; }
@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
${buildDepEdHeaderWithLogos(
    `<div class="l1">${esc(schoolName || "")}</div>
     <div class="l2">${esc(schoolAddress || "")}</div>
     <div class="l3">Class Record — ${esc(termLabel)}</div>`
  )}
<div class="meta">
  <div><b>Subject:</b> ${esc(subjectName)} &nbsp;&nbsp; <b>Section:</b> ${esc(sectionName)}</div>
  <div><b>School Year:</b> ${esc(schoolYear)} &nbsp;&nbsp; <b>Teacher:</b> ${esc(teacherName)}</div>
</div>
<table class="cr">
  <thead>
    ${nested ? `<tr><th rowspan="${headerRows}" class="name">Learners' Names</th>${componentHeader}<th rowspan="${headerRows}">Initial<br/>Grade</th><th rowspan="${headerRows}">Term<br/>Grade</th><th rowspan="${headerRows}">Descriptor</th></tr><tr>${groupHeader}</tr>` : `<tr><th rowspan="${headerRows}" class="name">Learners' Names</th>${groupHeader}<th rowspan="${headerRows}">Initial<br/>Grade</th><th rowspan="${headerRows}">Term<br/>Grade</th><th rowspan="${headerRows}">Descriptor</th></tr>`}
    <tr>${numberHeader}</tr>
    <tr>${titleHeader}</tr>
    <tr><th class="name">Highest Possible Score</th>${hpsHeader}<th>100</th><th>100</th><th></th></tr>
  </thead>
  <tbody>
    ${groupRow("MALE")}
    ${maleRows || `<tr><td colspan="${totalCols}"></td></tr>`}
    ${groupRow("FEMALE")}
    ${femaleRows || `<tr><td colspan="${totalCols}"></td></tr>`}
  </tbody>
</table>
<div class="sign">
  <div class="box"><div class="line">${esc(teacherName)}</div>Teacher</div>
  <div class="box"><div class="line">${esc(principalName)}</div>${esc(principalTitle)}</div>
</div>
</body>
</html>`;

  printHTMLContent(html);
}
