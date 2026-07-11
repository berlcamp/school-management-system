import { supabase } from "@/lib/supabase/client";
import {
  getGradeLevelLabel,
  philIriPhaseLabel,
  PHILIRI_QUESTION_TYPES,
  PHILIRI_QUESTION_TYPE_ABBR,
  type PhilIriQuestionType,
} from "@/lib/constants";
import { PhilIriComprehensionAnswer, Student } from "@/types";
import {
  buildDepEdHeaderWithLogos,
  DEPED_BASE_STYLES,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "./utils";

// One passage-level row of the Individual Summary Record (structurally matches
// PhilIriIsrRow from the Phil-IRI utils).
export interface PhilIriIsrRowParam {
  grade: number;
  title: string;
  answers: PhilIriComprehensionAnswer[];
  byType: Record<PhilIriQuestionType, { correct: number; total: number }>;
  rawCorrect: number;
  totalQuestions: number;
  comprehensionScore: number | null;
  readingLevel: string | null;
}

export interface PhilIriIsrParams {
  schoolId: number | null;
  schoolName?: string;
  student: Student;
  sectionName: string;
  teacherName: string;
  language: string;
  phase: string;
  rows: PhilIriIsrRowParam[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function generatePhilIriIsr(
  params: PhilIriIsrParams,
): Promise<void> {
  const {
    schoolId,
    student,
    sectionName,
    teacherName,
    language,
    phase,
    rows,
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

  const isEnglish = language === "English";
  const isFilipino = language === "Filipino";
  const isPre = phase === "BoSY";
  const isPost = phase === "EoSY";
  const chk = (on: boolean) => (on ? "☑" : "☐");

  const maxQuestions = rows.reduce((m, r) => Math.max(m, r.answers.length), 0);
  const questionCols = Array.from({ length: Math.max(maxQuestions, 1) }, (_, i) => i);

  const responseCell = (correct: boolean | null | undefined) => {
    if (correct === true) return "✓";
    if (correct === false) return "✗";
    return "";
  };

  const bodyRows = rows
    .map((r) => {
      const qCells = questionCols
        .map(
          (i) =>
            `<td class="c">${responseCell(r.answers[i]?.correct)}</td>`,
        )
        .join("");
      const typeCell = PHILIRI_QUESTION_TYPES.map(
        (t) =>
          `${PHILIRI_QUESTION_TYPE_ABBR[t]}=${r.byType[t].correct}/${r.byType[t].total}`,
      ).join("<br>");
      return `<tr>
        <td class="lvl">${escapeHtml(getGradeLevelLabel(r.grade))}</td>
        ${qCells}
        <td class="type">${typeCell}</td>
        <td class="c"><strong>${r.rawCorrect}/${r.totalQuestions}</strong></td>
        <td class="c">${r.comprehensionScore === null ? "" : r.comprehensionScore}</td>
        <td class="c">${escapeHtml(r.readingLevel ?? "")}</td>
      </tr>`;
    })
    .join("");

  const qHeaders = questionCols
    .map((i) => `<th class="c qcol">Q${i + 1}</th>`)
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
.sub-title { text-align:center; font-weight:bold; font-size:12pt; margin: 4px 0 2px; }
.sub-title .fil { display:block; font-weight:normal; font-style:italic; font-size:10.5pt; }
.summary-line { text-align:center; font-weight:bold; font-size:11pt; margin: 6px 0 4px; }
.summary-line .fil { font-weight:normal; font-style:italic; }
.meta-line { display:flex; gap:20px; font-size:10pt; margin:6px 0; flex-wrap:wrap; }
.check-line { display:flex; gap:28px; font-size:10.5pt; margin:6px 0 10px; flex-wrap:wrap; }
table.sheet { width:100%; border-collapse:collapse; }
table.sheet th, table.sheet td { border:1px solid #000; padding:4px 6px; font-size:9.5pt; }
table.sheet th { background:#eee; text-align:center; }
td.c { text-align:center; }
td.lvl { font-weight:bold; text-align:center; }
td.type { font-size:8.5pt; white-space:nowrap; line-height:1.3; }
th.qcol { width:26px; }
.legend { font-size:9pt; margin-top:8px; }
</style></head><body>
${buildDepEdHeaderWithLogos(
  `<div class="school-name">${escapeHtml(schoolName || "Department of Education")}</div>
   <div class="form-title">Phil-IRI — Individual Summary Record (Form 4)</div>`,
)}
<div class="sub-title">Individual Summary Record (ISR)
  <span class="fil">Talaan ng Indibidwal na Pagbabasa (TIP)</span>
</div>
<div class="summary-line">Summary of Comprehension Responses
  <span class="fil">(Talaan ng Pag-unawa)</span>
</div>
<div class="check-line">
  <span>${chk(isEnglish)} English</span>
  <span>${chk(isFilipino)} Filipino</span>
  <span>${chk(isPre)} Pre-Test <span style="font-style:italic">(Panimulang Pagtatasa)</span></span>
  <span>${chk(isPost)} Post Test <span style="font-style:italic">(Panapos na Pagtatasa)</span></span>
</div>
<div class="meta-line">
  <div><strong>Learner:</strong> ${escapeHtml(`${student.last_name}, ${student.first_name}`)}</div>
  <div><strong>Section:</strong> ${escapeHtml(sectionName || "")}</div>
  <div><strong>Teacher:</strong> ${escapeHtml(teacherName || "")}</div>
  <div><strong>Phase:</strong> ${escapeHtml(philIriPhaseLabel(phase))}</div>
</div>
<table class="sheet">
  <thead>
    <tr>
      <th rowspan="2">Passage Level<br><span style="font-weight:normal;font-style:italic">Antas</span></th>
      <th colspan="${questionCols.length}">Responses to Questions<br><span style="font-weight:normal;font-style:italic">(Sagot sa mga Tanong)</span></th>
      <th rowspan="2">Score per Type<br>of Question</th>
      <th rowspan="2">Score<br><span style="font-weight:normal;font-style:italic">(Marka)</span></th>
      <th rowspan="2">%</th>
      <th rowspan="2">Reading Level<br><span style="font-weight:normal;font-style:italic">(Antas ng Pagbasa)</span></th>
    </tr>
    <tr>${qHeaders}</tr>
  </thead>
  <tbody>${bodyRows}</tbody>
</table>
<div class="legend"><strong>Legend:</strong> L — Literal; I — Inferential; C — Critical</div>
</body></html>`;

  printHTMLContent(html);
}
