import { supabase } from "@/lib/supabase/client";
import {
  comprehensionLevel,
  overallReadingLevel,
  wordReadingLevel,
} from "@/lib/constants";
import { PhilIriMaterial, PhilIriQuestion, Student } from "@/types";
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

export interface PhilIriScoresheetParams {
  schoolId: number | null;
  material: PhilIriMaterial;
  questions: PhilIriQuestion[];
  students: Student[];
  miscues: Record<string, number | null>;
  answers: Record<string, Record<string, boolean>>;
  meta: Record<string, RecordMeta>;
  sectionName: string;
  teacherName: string;
  phase: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function generatePhilIriScoresheet(
  params: PhilIriScoresheetParams,
): Promise<void> {
  const {
    schoolId,
    material,
    questions,
    students,
    miscues,
    answers,
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

  const wc = Number(material.word_count);
  const totalQ = questions.length;

  const rows = students
    .map((s, idx) => {
      const miscueVal = miscues[s.id] ?? null;
      const studentAnswers = answers[s.id] || {};
      const correctCount = questions.reduce(
        (n, q) => n + (studentAnswers[q.id] ? 1 : 0),
        0,
      );
      const wr =
        miscueVal === null || wc <= 0
          ? null
          : round2(((wc - miscueVal) / wc) * 100);
      const comp = totalQ <= 0 ? null : round2((correctCount / totalQ) * 100);
      const wrLevel = wr === null ? "" : wordReadingLevel(wr);
      const compLevel = comp === null ? "" : comprehensionLevel(comp);
      const overall =
        wrLevel && compLevel
          ? overallReadingLevel(
              wrLevel as ReturnType<typeof wordReadingLevel>,
              compLevel as ReturnType<typeof comprehensionLevel>,
            )
          : wrLevel || compLevel || "";
      const m = meta[s.id];
      return `<tr>
        <td class="c">${idx + 1}</td>
        <td>${escapeHtml(`${s.last_name}, ${s.first_name}`)}</td>
        <td class="c">${m?.date_assessed ?? ""}</td>
        <td class="c">${miscueVal ?? ""}</td>
        <td class="c">${wr ?? ""}</td>
        <td class="c">${escapeHtml(wrLevel)}</td>
        <td class="c">${comp ?? ""}</td>
        <td class="c">${escapeHtml(compLevel)}</td>
        <td class="c">${escapeHtml(overall)}</td>
        <td>${m?.remarks ? escapeHtml(m.remarks) : ""}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
.sub-title { text-align:center; font-weight:bold; font-size:12pt; margin: 4px 0 10px; }
.meta-line { display:flex; gap:24px; font-size:10pt; margin-bottom:10px; flex-wrap:wrap; }
.legend { border:1px solid #333; border-radius:8px; padding:8px 10px; font-size:9pt; background:#f6f6f6; margin-bottom:12px; }
table.sheet { width:100%; border-collapse:collapse; }
table.sheet th, table.sheet td { border:1px solid #000; padding:4px 6px; font-size:9.5pt; }
table.sheet th { background:#eee; text-align:center; }
td.c { text-align:center; }
</style></head><body>
${buildDepEdHeaderWithLogos(
  `<div class="school-name">${escapeHtml(schoolName || "Department of Education")}</div>
   <div class="form-title">Phil-IRI — Scoresheet</div>`,
)}
<div class="sub-title">${escapeHtml(material.title)} · ${escapeHtml(phase)}</div>
<div class="meta-line">
  <div><strong>Teacher:</strong> ${escapeHtml(teacherName || "")}</div>
  <div><strong>Section:</strong> ${escapeHtml(sectionName || "")}</div>
  <div><strong>School:</strong> ${escapeHtml(schoolName || "")}</div>
  <div><strong>Words:</strong> ${material.word_count}</div>
</div>
<div class="legend">
  <strong>Reading Levels</strong> — Word Reading: ≥97% Independent · 90–96% Instructional · ≤89% Frustration.
  Comprehension: ≥80% Independent · 59–79% Instructional · ≤58% Frustration.
</div>
<table class="sheet">
  <thead>
    <tr>
      <th>#</th>
      <th>Name</th>
      <th>Date</th>
      <th>Miscues</th>
      <th>WR %</th>
      <th>WR Level</th>
      <th>Comp %</th>
      <th>Comp Level</th>
      <th>Overall Level</th>
      <th>Remarks</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;

  printHTMLContent(html);
}
