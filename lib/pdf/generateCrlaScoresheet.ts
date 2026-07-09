import {
  effectiveScores,
  hasAnyScore,
  totalScore,
} from "@/app/(protected)/teacher/assessments/crla/crlaUtils";
import { supabase } from "@/lib/supabase/client";
import { CrlaBand, CrlaMaterial, CrlaMaterialTask, Student } from "@/types";
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
  profile_label?: string | null;
}

export interface CrlaScoresheetParams {
  schoolId: number | null;
  material: CrlaMaterial;
  tasks: CrlaMaterialTask[];
  bands: CrlaBand[];
  students: Student[];
  scores: Record<string, Record<string, number | null>>;
  meta: Record<string, RecordMeta>;
  sectionName: string;
  teacherName: string;
  phase: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function bandFor(bands: CrlaBand[], total: number): string {
  const m = bands.find(
    (b) => total >= Number(b.min_score) && total <= Number(b.max_score),
  );
  return m ? m.label : "";
}

export async function generateCrlaScoresheet(
  params: CrlaScoresheetParams,
): Promise<void> {
  const {
    schoolId,
    material,
    tasks,
    bands,
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

  const bandsLegend = bands
    .map(
      (b) =>
        `<div>${Number(b.min_score) === Number(b.max_score) ? Number(b.min_score) : `${Number(b.min_score)} to ${Number(b.max_score)}`} — ${escapeHtml(b.label)}</div>`,
    )
    .join("");

  const taskHeaders = tasks
    .map(
      (t) =>
        `<th>${escapeHtml(t.label)}<br>(${Number(t.max_score)})</th>`,
    )
    .join("");

  const rows = students
    .map((s, idx) => {
      const studentScores = scores[s.id] || {};
      // Apply the shared branching rules (Task 2L auto-fill / Task 2H n/a).
      const eff = effectiveScores(tasks, studentScores);
      const entered = hasAnyScore(tasks, eff);
      const total = totalScore(tasks, eff);
      const m = meta[s.id];
      const taskCells = tasks
        .map((t) => {
          const v = eff[t.id];
          return `<td class="c">${v === undefined || v === null ? "" : v}</td>`;
        })
        .join("");
      // Reading Profile is always auto-banded from the 0–30 total.
      const profile = bandFor(bands, total);
      return `<tr>
        <td class="c">${idx + 1}</td>
        <td>${escapeHtml(`${s.last_name}, ${s.first_name}`)}</td>
        <td class="c">${m?.date_assessed ?? ""}</td>
        ${taskCells}
        <td class="c">${entered ? total : ""}</td>
        <td class="c">${entered ? escapeHtml(profile) : ""}</td>
        <td>${m?.remarks ? escapeHtml(m.remarks) : ""}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
.sub-title { text-align:center; font-weight:bold; font-size:12pt; margin: 4px 0 10px; }
.meta-line { display:flex; gap:24px; font-size:10pt; margin-bottom:10px; flex-wrap:wrap; }
.legend { display:flex; gap:12px; margin-bottom:12px; }
.legend .box { flex:1; border:1px solid #333; border-radius:8px; padding:8px 10px; font-size:9pt; background:#f6f6f6; }
.legend .box h4 { font-size:9pt; margin-bottom:4px; text-transform:uppercase; }
table.sheet { width:100%; border-collapse:collapse; }
table.sheet th, table.sheet td { border:1px solid #000; padding:4px 6px; font-size:9.5pt; }
table.sheet th { background:#eee; text-align:center; }
td.c { text-align:center; }
</style></head><body>
${buildDepEdHeaderWithLogos(
  `<div class="school-name">${escapeHtml(schoolName || "Department of Education")}</div>
   <div class="form-title">CRLA — Scoresheet</div>`,
)}
<div class="sub-title">${escapeHtml(material.title)} · ${escapeHtml(phase)}</div>
<div class="meta-line">
  <div><strong>Teacher:</strong> ${escapeHtml(teacherName || "")}</div>
  <div><strong>Section:</strong> ${escapeHtml(sectionName || "")}</div>
  <div><strong>School:</strong> ${escapeHtml(schoolName || "")}</div>
</div>
<div class="legend">
  ${material.instructions ? `<div class="box"><h4>Scoring</h4>${escapeHtml(material.instructions)}</div>` : ""}
  <div class="box"><h4>Reading Profiles</h4>${bandsLegend}</div>
</div>
<table class="sheet">
  <thead>
    <tr>
      <th>#</th>
      <th>Name</th>
      <th>Date of<br>Assessment</th>
      ${taskHeaders}
      <th>Total<br>Score</th>
      <th>Reading Profile</th>
      <th>Remarks</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;

  printHTMLContent(html);
}
