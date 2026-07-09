import { supabase } from "@/lib/supabase/client";
import { getGradeLevelLabel, philIriPhaseLabel } from "@/lib/constants";
import { Student } from "@/types";
import {
  buildDepEdHeaderWithLogos,
  DEPED_BASE_STYLES,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "./utils";

export interface PhilIriIndividualSummaryRead {
  grade: number;
  title: string;
  wordReadingScore: number | null;
  wordReadingLevel: string | null;
  comprehensionScore: number | null;
  comprehensionLevel: string | null;
  overallLevel: string | null;
}

export interface PhilIriIndividualSummaryParams {
  schoolId: number | null;
  schoolName?: string;
  student: Student;
  sectionName: string;
  teacherName: string;
  language: string;
  phase: string;
  gstTotal: number | null;
  finalProfileLabel: string;
  reads: PhilIriIndividualSummaryRead[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function generatePhilIriIndividualSummary(
  params: PhilIriIndividualSummaryParams,
): Promise<void> {
  const {
    schoolId,
    student,
    sectionName,
    teacherName,
    language,
    phase,
    gstTotal,
    finalProfileLabel,
    reads,
  } = params;

  let schoolName = params.schoolName ?? "";
  if (!schoolName && schoolId) {
    const { data } = await supabase
      .from("sms_schools")
      .select("name")
      .eq("id", schoolId)
      .single();
    schoolName = data?.name ?? "";
  }

  const sorted = [...reads].sort((a, b) => a.grade - b.grade);
  const rows = sorted
    .map(
      (r) => `<tr>
        <td>${escapeHtml(getGradeLevelLabel(r.grade))}</td>
        <td>${escapeHtml(r.title)}</td>
        <td class="c">${r.wordReadingScore === null ? "" : `${r.wordReadingScore}%`}</td>
        <td class="c">${escapeHtml(r.wordReadingLevel ?? "")}</td>
        <td class="c">${r.comprehensionScore === null ? "" : `${r.comprehensionScore}%`}</td>
        <td class="c">${escapeHtml(r.comprehensionLevel ?? "")}</td>
        <td class="c"><strong>${escapeHtml(r.overallLevel ?? "")}</strong></td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
.sub-title { text-align:center; font-weight:bold; font-size:12pt; margin: 2px 0 10px; }
.meta-line { display:flex; gap:20px; font-size:10pt; margin-bottom:10px; flex-wrap:wrap; }
table.sheet { width:100%; border-collapse:collapse; }
table.sheet th, table.sheet td { border:1px solid #000; padding:4px 8px; font-size:10pt; }
table.sheet th { background:#eee; text-align:center; }
td.c { text-align:center; }
.final { margin-top:12px; font-size:12pt; }
.final strong { font-size:13pt; }
.note { font-size:9pt; margin-top:8px; font-style:italic; color:#444; }
</style></head><body>
${buildDepEdHeaderWithLogos(
  `<div class="school-name">${escapeHtml(schoolName || "Department of Education")}</div>
   <div class="form-title">Phil-IRI — Individual Assessment Summary</div>`,
)}
<div class="sub-title">${escapeHtml(`${student.last_name}, ${student.first_name}`)} · ${escapeHtml(philIriPhaseLabel(phase))}</div>
<div class="meta-line">
  <div><strong>Section:</strong> ${escapeHtml(sectionName || "")}</div>
  <div><strong>Teacher:</strong> ${escapeHtml(teacherName || "")}</div>
  <div><strong>Language:</strong> ${escapeHtml(language)}</div>
  <div><strong>GST Score:</strong> ${gstTotal === null ? "—" : `${gstTotal}/20`}</div>
</div>
<table class="sheet">
  <thead>
    <tr>
      <th>Passage Level</th>
      <th>Passage</th>
      <th>WR %</th>
      <th>WR Level</th>
      <th>Comp %</th>
      <th>Comp Level</th>
      <th>Overall</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="final"><strong>Final Reading Profile:</strong> ${escapeHtml(finalProfileLabel)}</div>
<div class="note">The learner reads graded passages until reaching Frustration; the highest Instructional grade is the reading level.</div>
</body></html>`;

  printHTMLContent(html);
}
