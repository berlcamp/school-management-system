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
  students: Student[];
  scores: Record<string, Record<string, number | null>>;
  meta: Record<string, RecordMeta>;
  sectionName: string;
  teacherName: string;
  phase: string;
  maxTotal: number;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function masteryFor(bands: RmaBand[], pct: number): string {
  const m = bands.find(
    (b) => pct >= Number(b.min_score) && pct <= Number(b.max_score),
  );
  return m ? m.label : "";
}

export async function generateRmaScoresheet(
  params: RmaScoresheetParams,
): Promise<void> {
  const {
    schoolId,
    material,
    items,
    bands,
    students,
    scores,
    meta,
    sectionName,
    teacherName,
    phase,
    maxTotal,
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
        `<div>${Number(b.min_score)}–${Number(b.max_score)}% — ${escapeHtml(b.label)}</div>`,
    )
    .join("");

  const itemHeaders = items
    .map((it, i) => `<th title="${escapeHtml(it.domain ?? "")}">${i + 1}</th>`)
    .join("");

  const rows = students
    .map((s, idx) => {
      const studentScores = scores[s.id] || {};
      const entered = items.some((it) => {
        const v = studentScores[it.id];
        return v !== undefined && v !== null;
      });
      const total = items.reduce(
        (sum, it) => sum + (Number(studentScores[it.id] ?? 0) || 0),
        0,
      );
      const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
      const m = meta[s.id];
      const itemCells = items
        .map((it) => {
          const v = studentScores[it.id];
          return `<td class="c">${v === undefined || v === null ? "" : v}</td>`;
        })
        .join("");
      return `<tr>
        <td class="c">${idx + 1}</td>
        <td>${escapeHtml(`${s.last_name}, ${s.first_name}`)}</td>
        <td class="c">${m?.date_assessed ?? ""}</td>
        ${itemCells}
        <td class="c">${entered ? total : ""}</td>
        <td class="c">${entered ? escapeHtml(masteryFor(bands, pct)) : ""}</td>
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
   <div class="form-title">RMA — Scoresheet</div>`,
)}
<div class="sub-title">${escapeHtml(material.title)} · ${escapeHtml(phase)}</div>
<div class="meta-line">
  <div><strong>Teacher:</strong> ${escapeHtml(teacherName || "")}</div>
  <div><strong>Section:</strong> ${escapeHtml(sectionName || "")}</div>
  <div><strong>School:</strong> ${escapeHtml(schoolName || "")}</div>
  <div><strong>Total possible:</strong> ${maxTotal}</div>
</div>
<div class="legend"><strong>Mastery Bands</strong> ${bandsLegend}</div>
<table class="sheet">
  <thead>
    <tr>
      <th>#</th>
      <th>Name</th>
      <th>Date</th>
      ${itemHeaders}
      <th>Total</th>
      <th>Mastery</th>
      <th>Remarks</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;

  printHTMLContent(html);
}
