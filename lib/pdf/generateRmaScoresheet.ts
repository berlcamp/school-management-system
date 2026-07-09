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
  sortAscMale?: boolean;
  sortAscFemale?: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function taskLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

function levelFor(bands: RmaBand[], pct: number): string {
  const m = bands.find(
    (b) => pct >= Number(b.min_score) && pct <= Number(b.max_score),
  );
  return m ? m.label : "";
}

function levelClass(label: string): string {
  if (label === "Intervention") return "lvl-red";
  if (label === "Consolidation") return "lvl-amber";
  if (label === "Enhancement") return "lvl-green";
  return "";
}

function sortByName(list: Student[], ascending: boolean): Student[] {
  return [...list].sort((a, b) => {
    const an = `${a.last_name} ${a.first_name}`.toLowerCase();
    const bn = `${b.last_name} ${b.first_name}`.toLowerCase();
    const cmp = an.localeCompare(bn);
    return ascending ? cmp : -cmp;
  });
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
    sectionName,
    teacherName,
    phase,
    maxTotal,
    sortAscMale = true,
    sortAscFemale = true,
  } = params;

  const phaseLabel =
    phase === "BoSY" ? "Pre-Test" : phase === "EoSY" ? "Post-Test" : phase;

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
    .map(
      (it, i) =>
        `<th title="${escapeHtml(it.domain ?? "")}">${taskLetter(i)}<div class="mx">(${Number(it.max_score)})</div></th>`,
    )
    .join("");

  const renderRow = (s: Student, idx: number): string => {
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
    const level = entered ? levelFor(bands, pct) : "";
    const itemCells = items
      .map((it) => {
        const v = studentScores[it.id];
        return `<td class="c">${v === undefined || v === null ? "" : v}</td>`;
      })
      .join("");
    return `<tr>
      <td class="c">${idx}</td>
      <td>${escapeHtml(`${s.last_name}, ${s.first_name}`)}</td>
      <td class="c">${s.gender === "female" ? "F" : "M"}</td>
      ${itemCells}
      <td class="c">${entered ? total : ""}</td>
      <td class="c">${entered ? `${pct}%` : ""}</td>
      <td class="c ${levelClass(level)}">${escapeHtml(level)}</td>
    </tr>`;
  };

  const colSpan = items.length + 6; // #, Name, Gender, tasks…, Total, %, Levelling
  const males = sortByName(
    students.filter((s) => s.gender !== "female"),
    sortAscMale,
  );
  const females = sortByName(
    students.filter((s) => s.gender === "female"),
    sortAscFemale,
  );

  const groupHeader = (label: string) =>
    `<tr class="grp"><td colspan="${colSpan}">${label}</td></tr>`;

  const bodyRows =
    (males.length > 0
      ? groupHeader("MALE") + males.map((s, i) => renderRow(s, i + 1)).join("")
      : "") +
    (females.length > 0
      ? groupHeader("FEMALE") +
        females.map((s, i) => renderRow(s, i + 1)).join("")
      : "");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
@page { size: A4 landscape; margin: 10mm; }
.sub-title { text-align:center; font-weight:bold; font-size:12pt; margin: 4px 0 10px; }
.meta-line { display:flex; gap:24px; font-size:10pt; margin-bottom:10px; flex-wrap:wrap; }
.legend { border:1px solid #333; border-radius:8px; padding:8px 10px; font-size:9pt; background:#f6f6f6; margin-bottom:12px; }
table.sheet { width:100%; border-collapse:collapse; }
table.sheet th, table.sheet td { border:1px solid #000; padding:4px 6px; font-size:9.5pt; }
table.sheet th { background:#eee; text-align:center; }
table.sheet th .mx { font-size:7.5pt; font-weight:normal; }
td.c { text-align:center; }
tr.grp td { background:#ddd; font-weight:bold; font-size:9pt; letter-spacing:1px; }
.lvl-red { color:#b91c1c; font-weight:bold; }
.lvl-amber { color:#b45309; font-weight:bold; }
.lvl-green { color:#15803d; font-weight:bold; }
</style></head><body>
${buildDepEdHeaderWithLogos(
  `<div class="school-name">${escapeHtml(schoolName || "Department of Education")}</div>
   <div class="form-title">Rapid Mathematics Assessment (RMA)</div>`,
)}
<div class="sub-title">${escapeHtml(material.title)} · ${escapeHtml(phaseLabel)}</div>
<div class="meta-line">
  <div><strong>Teacher:</strong> ${escapeHtml(teacherName || "")}</div>
  <div><strong>Section:</strong> ${escapeHtml(sectionName || "")}</div>
  <div><strong>School:</strong> ${escapeHtml(schoolName || "")}</div>
  <div><strong>Total possible:</strong> ${maxTotal}</div>
</div>
<div class="legend"><strong>KS1 Levelling</strong> ${bandsLegend}</div>
<table class="sheet">
  <thead>
    <tr>
      <th>#</th>
      <th>Name of Pupil</th>
      <th>Gender</th>
      ${itemHeaders}
      <th>Total</th>
      <th>%</th>
      <th>Levelling</th>
    </tr>
  </thead>
  <tbody>${bodyRows}</tbody>
</table>
</body></html>`;

  printHTMLContent(html);
}
