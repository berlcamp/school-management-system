import { PABASA_LEVELS } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { Student } from "@/types";
import {
  buildDepEdHeaderWithLogos,
  DEPED_BASE_STYLES,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "./utils";

interface PabasaEntry {
  reading_level: string | null;
  remarks: string | null;
}

export interface PabasaScoresheetParams {
  schoolId: number | null;
  language: string; // Filipino | English
  students: Student[];
  entries: Record<string, PabasaEntry>;
  sectionName: string;
  gradeLevel: number;
  teacherName: string;
  phase: string; // BoSY | MoSY | EoSY
  schoolYear: string;
  sortAscMale?: boolean;
  sortAscFemale?: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sortByName(list: Student[], ascending: boolean): Student[] {
  return [...list].sort((a, b) => {
    const an = `${a.last_name} ${a.first_name}`.toLowerCase();
    const bn = `${b.last_name} ${b.first_name}`.toLowerCase();
    const cmp = an.localeCompare(bn);
    return ascending ? cmp : -cmp;
  });
}

// Split "2026-2027" into its two year parts for the "SY 20__-20__" line.
function schoolYearParts(sy: string): { start: string; end: string } {
  const [start = "", end = ""] = sy.split("-");
  return { start, end };
}

export async function generatePabasaScoresheet(
  params: PabasaScoresheetParams,
): Promise<void> {
  const {
    schoolId,
    language,
    students,
    entries,
    sectionName,
    gradeLevel,
    teacherName,
    phase,
    schoolYear,
    sortAscMale = true,
    sortAscFemale = true,
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

  const { start, end } = schoolYearParts(schoolYear);
  // Underline the active test period on the Pretest/Midtest/Posttest line.
  const periodMark = (p: string) => (phase === p ? "✓" : "____");

  const levelHeaders = PABASA_LEVELS.map((lvl) => `<th>${escapeHtml(lvl)}</th>`).join(
    "",
  );

  const renderRow = (s: Student, idx: number): string => {
    const entry = entries[s.id] || { reading_level: null, remarks: null };
    const levelCells = PABASA_LEVELS.map(
      (lvl) => `<td class="c">${entry.reading_level === lvl ? "✓" : ""}</td>`,
    ).join("");
    return `<tr>
      <td class="c">${idx}</td>
      <td>${escapeHtml(`${s.last_name}, ${s.first_name}`)}</td>
      <td class="c">${s.gender === "female" ? "F" : "M"}</td>
      ${levelCells}
      <td>${escapeHtml(entry.remarks ?? "")}</td>
    </tr>`;
  };

  const colSpan = PABASA_LEVELS.length + 4; // #, Name, Sex, levels…, Remarks
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
@page { size: A4 portrait; margin: 12mm; }
.sub-title { text-align:center; font-weight:bold; font-size:12pt; margin: 6px 0 2px; }
.sy-line { text-align:center; font-size:10pt; margin-bottom:8px; }
.meta-line { display:flex; justify-content:space-between; gap:24px; font-size:10pt; margin-bottom:10px; flex-wrap:wrap; }
table.sheet { width:100%; border-collapse:collapse; }
table.sheet th, table.sheet td { border:1px solid #000; padding:5px 6px; font-size:10pt; }
table.sheet th { background:#eee; text-align:center; }
td.c { text-align:center; }
tr.grp td { background:#ddd; font-weight:bold; font-size:9pt; letter-spacing:1px; }
</style></head><body>
${buildDepEdHeaderWithLogos(
  `<div class="school-name">${escapeHtml(schoolName || "Department of Education")}</div>
   <div class="form-title">Pabasa Reading Program</div>`,
)}
<div class="sub-title">Pabasa for Grades 11-12 (${escapeHtml(language.toUpperCase())})</div>
<div class="sy-line">SY ${escapeHtml(start || "20__")}-${escapeHtml(end || "20__")}
  &nbsp;&nbsp; Pretest ${periodMark("BoSY")} &nbsp; Midtest ${periodMark("MoSY")} &nbsp; Posttest ${periodMark("EoSY")}</div>
<div class="meta-line">
  <div><strong>Grade/Section:</strong> Grade ${gradeLevel} — ${escapeHtml(sectionName || "")}</div>
  <div><strong>Teacher:</strong> ${escapeHtml(teacherName || "")}</div>
</div>
<table class="sheet">
  <thead>
    <tr>
      <th>#</th>
      <th>Name of Learner</th>
      <th>Sex</th>
      ${levelHeaders}
      <th>Remarks</th>
    </tr>
  </thead>
  <tbody>${bodyRows}</tbody>
</table>
</body></html>`;

  printHTMLContent(html);
}
