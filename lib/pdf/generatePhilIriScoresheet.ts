import { supabase } from "@/lib/supabase/client";
import {
  philIriGstConfig,
  philIriGstLabels,
  philIriPhaseLabel,
  philIriScreeningRemark,
} from "@/lib/constants";
import { PhilIriMaterial, Student } from "@/types";
import {
  buildDepEdHeaderWithLogos,
  DEPED_BASE_STYLES,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "./utils";

interface ScoreRow {
  test_taken: boolean;
  literal: number | null;
  inferential: number | null;
  critical: number | null;
}

interface RecordMeta {
  recordId?: string;
  date_assessed: string | null;
  remarks: string | null;
}

export interface PhilIriScoresheetParams {
  schoolId: number | null;
  material: PhilIriMaterial;
  students: Student[];
  scores: Record<string, ScoreRow>;
  meta: Record<string, RecordMeta>;
  sectionName: string;
  teacherName: string;
  phase: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function generatePhilIriScoresheet(
  params: PhilIriScoresheetParams,
): Promise<void> {
  const {
    schoolId,
    material,
    students,
    scores,
    meta,
    sectionName,
    teacherName,
    phase,
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

  const gstConfig = philIriGstConfig(material.grade_level);
  const labels = philIriGstLabels(material.language, material.grade_level);
  let belowCount = 0;
  let atOrAboveCount = 0;
  let takenCount = 0;

  const cell = (v: number | null, max: number): string =>
    v === null ? "" : `${v}/${max}`;

  const rows = students
    .map((s, idx) => {
      const row = scores[s.id] || {
        test_taken: false,
        literal: null,
        inferential: null,
        critical: null,
      };
      const hasScore =
        row.literal !== null || row.inferential !== null || row.critical !== null;
      const total = hasScore
        ? (row.literal ?? 0) + (row.inferential ?? 0) + (row.critical ?? 0)
        : null;
      if (row.test_taken) takenCount += 1;
      if (total !== null) {
        if (total >= gstConfig.passThreshold) atOrAboveCount += 1;
        else belowCount += 1;
      }
      const m = meta[s.id];
      const below = total !== null && total < gstConfig.passThreshold ? "✓" : "";
      const atOrAbove =
        total !== null && total >= gstConfig.passThreshold ? "✓" : "";
      // Remarks are derived from the score (matches the on-screen table).
      const remark = philIriScreeningRemark(total, material.grade_level) ?? "";
      return `<tr>
        <td class="c">${idx + 1}</td>
        <td>${escapeHtml(`${s.last_name}, ${s.first_name}`)}</td>
        <td class="c">${row.test_taken ? "✓" : "✗"}</td>
        <td class="c">${cell(row.literal, gstConfig.literalMax)}</td>
        <td class="c">${cell(row.inferential, gstConfig.inferentialMax)}</td>
        <td class="c">${cell(row.critical, gstConfig.criticalMax)}</td>
        <td class="c">${total === null ? "" : `${total}/${gstConfig.totalMax}`}</td>
        <td class="c">${below}</td>
        <td class="c">${atOrAbove}</td>
        <td class="c">${m?.date_assessed ?? ""}</td>
        <td>${escapeHtml(remark)}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
.form-code { text-align:right; font-weight:bold; font-size:10pt; margin: 2px 0; }
.sub-title { text-align:center; font-weight:bold; font-size:12pt; margin: 2px 0 10px; }
.meta-line { display:flex; gap:24px; font-size:10pt; margin-bottom:10px; flex-wrap:wrap; }
table.sheet { width:100%; border-collapse:collapse; }
table.sheet th, table.sheet td { border:1px solid #000; padding:4px 6px; font-size:9.5pt; }
table.sheet th { background:#eee; text-align:center; }
td.c { text-align:center; }
tfoot td { font-weight:bold; }
.note { font-size:9pt; margin-top:10px; font-style:italic; }
</style></head><body>
${buildDepEdHeaderWithLogos(
  `<div class="school-name">${escapeHtml(schoolName || "Department of Education")}</div>
   <div class="form-title">${escapeHtml(labels.formTitle)}</div>`,
)}
<div class="form-code">${escapeHtml(labels.formCode)}</div>
<div class="sub-title">${escapeHtml(material.title)} · ${escapeHtml(philIriPhaseLabel(phase))}</div>
<div class="meta-line">
  <div><strong>Teacher:</strong> ${escapeHtml(teacherName || "")}</div>
  <div><strong>Section:</strong> ${escapeHtml(sectionName || "")}</div>
  <div><strong>School:</strong> ${escapeHtml(schoolName || "")}</div>
  <div><strong>Words:</strong> ${material.word_count}</div>
</div>
<table class="sheet">
  <thead>
    <tr>
      <th rowspan="2">#</th>
      <th rowspan="2">Name</th>
      <th rowspan="2">${escapeHtml(labels.testTaken)}</th>
      <th colspan="3">${escapeHtml(labels.correctResponses)}</th>
      <th rowspan="2">${escapeHtml(labels.total)}</th>
      <th rowspan="2">${escapeHtml(labels.below)}</th>
      <th rowspan="2">${escapeHtml(labels.atOrAbove)}</th>
      <th rowspan="2">Date</th>
      <th rowspan="2">Remarks</th>
    </tr>
    <tr>
      <th>${escapeHtml(labels.literal)} /${gstConfig.literalMax}</th>
      <th>${escapeHtml(labels.inferential)} /${gstConfig.inferentialMax}</th>
      <th>${escapeHtml(labels.critical)} /${gstConfig.criticalMax}</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr>
      <td class="c" colspan="2">Total Number of Students: ${students.length}</td>
      <td class="c">${takenCount}</td>
      <td colspan="3"></td>
      <td></td>
      <td class="c">${belowCount}</td>
      <td class="c">${atOrAboveCount}</td>
      <td colspan="2"></td>
    </tr>
  </tfoot>
</table>
<div class="note">${escapeHtml(labels.note)}</div>
</body></html>`;

  printHTMLContent(html);
}
