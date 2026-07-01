import {
  COMPONENTS,
  componentMaxTotal,
  componentPS,
  componentRawTotal,
  componentWS,
  descriptor,
  initialGrade,
  itemsOf,
  termGrade,
  weightOf,
} from "@/app/(protected)/teacher/class-record/components/classRecordUtils";
import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";
import { ClassRecord, ClassRecordItem, Student } from "@/types";

export interface ClassRecordPrintParams {
  schoolId: number | null;
  subjectName: string;
  sectionName: string;
  schoolYear: string;
  termLabel: string;
  teacherName: string;
  record: ClassRecord;
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

  const males = students.filter((s) => s.gender === "male");
  const females = students.filter((s) => s.gender === "female");
  const totalCols =
    1 + COMPONENTS.reduce((n, c) => n + itemsOf(items, c.key).length + 3, 0) + 3;

  // ----- header rows --------------------------------------------------------
  const groupHeader = COMPONENTS.map((c) => {
    const span = itemsOf(items, c.key).length + 3;
    return `<th colspan="${span}">${esc(c.title)} (${weightOf(record, c.key)}%)</th>`;
  }).join("");

  const numberHeader = COMPONENTS.map((c) => {
    const cols = itemsOf(items, c.key)
      .map((_, i) => `<th>${i + 1}</th>`)
      .join("");
    return `${cols}<th>TOTAL</th><th>PS</th><th>WS</th>`;
  }).join("");

  const titleHeader = COMPONENTS.map((c) => {
    const cols = itemsOf(items, c.key)
      .map((it) => `<th class="title">${esc(it.label ?? "")}</th>`)
      .join("");
    return `${cols}<th></th><th></th><th></th>`;
  }).join("");

  const hpsHeader = COMPONENTS.map((c) => {
    const cols = itemsOf(items, c.key)
      .map((it) => `<th>${Number(it.max_score)}</th>`)
      .join("");
    return `${cols}<th>${componentMaxTotal(items, c.key)}</th><th>100</th><th>${weightOf(record, c.key)}%</th>`;
  }).join("");

  // ----- learner rows -------------------------------------------------------
  const renderLearner = (s: Student, index: number): string => {
    const sc = scores[s.id] || {};
    const hasAny = items.some((i) => sc[i.id] !== undefined && sc[i.id] !== null);
    const body = COMPONENTS.map((c) => {
      const cells = itemsOf(items, c.key)
        .map((it) => {
          const v = sc[it.id];
          return `<td>${v === undefined || v === null ? "" : v}</td>`;
        })
        .join("");
      const ps = componentPS(items, c.key, sc);
      const ws = componentWS(record, items, c.key, sc);
      const raw = itemsOf(items, c.key).length
        ? componentRawTotal(items, c.key, sc)
        : null;
      return `${cells}<td>${raw ?? ""}</td><td>${ps === null ? "" : ps.toFixed(0)}</td><td>${ws === null ? "" : ws.toFixed(2)}</td>`;
    }).join("");

    const initial = hasAny ? initialGrade(record, items, sc).toFixed(2) : "";
    const term = hasAny ? termGrade(record, items, sc) : "";
    const desc = hasAny ? descriptor(termGrade(record, items, sc)) : "";

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
    <tr><th rowspan="3" class="name">Learners' Names</th>${groupHeader}<th rowspan="3">Initial<br/>Grade</th><th rowspan="3">Term<br/>Grade</th><th rowspan="3">Descriptor</th></tr>
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
