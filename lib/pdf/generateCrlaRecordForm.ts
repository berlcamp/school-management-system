import { supabase } from "@/lib/supabase/client";
import {
  CrlaRecordForm,
  CrlaRecordFormLine,
  CrlaRecordFormObservation,
} from "@/types";
import {
  buildDepEdHeaderWithLogos,
  DEPED_BASE_STYLES,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "./utils";

export interface CrlaRecordFormPrintParams {
  schoolId: number | null;
  recordForm: CrlaRecordForm;
  lines: CrlaRecordFormLine[];
  observations: CrlaRecordFormObservation[];
  studentName?: string;
  teacherName?: string;
  scores?: Record<string, { miscues: number | null; answer_status: string | null }>;
  observationLevel?: number | null;
  notes?: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statusMark(status: string | null | undefined): string {
  if (status === "correct") return "✓";
  if (status === "wrong") return "✗";
  if (status === "na") return "N/A";
  return "";
}

export async function generateCrlaRecordForm(
  params: CrlaRecordFormPrintParams,
): Promise<void> {
  const {
    schoolId,
    recordForm,
    lines,
    observations,
    studentName = "",
    teacherName = "",
    scores = {},
    observationLevel = null,
    notes = "",
  } = params;

  let schoolName = "";
  if (schoolId) {
    const { data } = await supabase
      .from("sms_schools")
      .select("name")
      .eq("id", schoolId)
      .single();
    schoolName = data?.name ?? "";
  }

  let totalWords = 0;
  let totalMiscues = 0;
  const rows = lines
    .map((l) => {
      const sc = scores[l.id];
      totalWords += Number(l.word_count) || 0;
      totalMiscues += Number(sc?.miscues ?? 0) || 0;
      return `<tr>
        <td>${escapeHtml(l.line_text)}</td>
        <td class="c">${Number(l.word_count)}</td>
        <td class="c">${sc?.miscues ?? ""}</td>
        <td>${l.question ? escapeHtml(l.question) : ""}</td>
        <td>${l.answer_key ? escapeHtml(l.answer_key) : ""}</td>
        <td class="c">${l.question ? statusMark(sc?.answer_status) : ""}</td>
      </tr>`;
    })
    .join("");

  const obsCols = observations
    .sort((a, b) => a.level_no - b.level_no)
    .map(
      (o) =>
        `<td class="obs ${observationLevel === o.level_no ? "obs-sel" : ""}">
          <div class="obs-title">LEVEL ${o.level_no}</div>
          <div>${escapeHtml(o.description)}</div>
        </td>`,
    )
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
.sub-title { text-align:center; font-weight:bold; font-size:11pt; letter-spacing:1px; margin: 2px 0; }
.story { text-align:center; font-weight:bold; margin: 6px 0 10px; }
.meta-line { display:flex; gap:24px; font-size:10pt; margin-bottom:10px; flex-wrap:wrap; }
table.rf { width:100%; border-collapse:collapse; }
table.rf th, table.rf td { border:1px solid #000; padding:4px 6px; font-size:9.5pt; vertical-align:top; }
table.rf th { background:#eee; text-align:center; }
td.c { text-align:center; }
tr.total td { font-weight:bold; background:#f5f5f5; }
.obs-title-h { text-align:center; font-weight:bold; margin:16px 0 8px; letter-spacing:1px; }
table.obs-table { width:100%; border-collapse:collapse; }
table.obs-table td.obs { border:1px solid #000; padding:8px; font-size:9.5pt; width:25%; vertical-align:top; }
.obs-title { font-weight:bold; text-align:center; margin-bottom:4px; }
td.obs-sel { background:#d9ead3; }
.notes { margin-top:14px; font-size:10pt; }
.notes .ln { border-bottom:1px solid #000; height:20px; margin-top:10px; }
.notes .val { border-bottom:1px solid #000; min-height:20px; padding:2px 0; }
</style></head><body>
${buildDepEdHeaderWithLogos(
  `<div class="school-name" style="font-size:12pt">Modified Comprehensive Rapid Literacy Assessment (CRLA-M) Record Form</div>
   <div class="sub-title">PART 2</div>
   <div class="sub-title" style="font-weight:normal">${escapeHtml(recordForm.title)}</div>`,
)}
${recordForm.story_title ? `<div class="story">${escapeHtml(recordForm.story_title)}</div>` : ""}
<div class="meta-line">
  <div><strong>Child's Name:</strong> ${escapeHtml(studentName)}</div>
  <div><strong>Teacher's Name:</strong> ${escapeHtml(teacherName)}</div>
  <div><strong>School:</strong> ${escapeHtml(schoolName)}</div>
</div>
<table class="rf">
  <thead>
    <tr>
      <th style="width:34%">PASSAGE</th>
      <th># of<br>words</th>
      <th># of<br>miscues</th>
      <th style="width:22%">QUESTIONS</th>
      <th style="width:22%">ANSWERS</th>
      <th>✓ or ✗<br>or N/A</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr class="total">
      <td class="c">TOTAL</td>
      <td class="c">${totalWords}</td>
      <td class="c">${Object.keys(scores).length ? totalMiscues : ""}</td>
      <td></td><td></td><td></td>
    </tr>
  </tbody>
</table>

<div class="obs-title-h">OBSERVATIONS</div>
<table class="obs-table"><tr>${obsCols}</tr></table>
<div class="notes">
  ${notes ? `<div class="val">${escapeHtml(notes)}</div>` : `<div class="ln"></div>`}
  <div class="ln"></div>
</div>
</body></html>`;

  printHTMLContent(html);
}
