import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";
import { Grade, Section, Subject } from "@/types/database";

export interface Sf10Params {
  studentId: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const dy = String(dt.getDate()).padStart(2, "0");
  return `${m}/${dy}/${dt.getFullYear()}`;
}

function fmtG(g: number | null | undefined): string {
  return g != null ? g.toFixed(2) : "";
}

function computeFinal(qs: (number | null)[]): number | null {
  const vals = qs.filter((v): v is number => v !== null);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// ── Key mapping ────────────────────────────────────────────────────────────

function getJHSKey(name: string, code: string): string {
  const c = `${name} ${code}`.toLowerCase();
  if (c.includes("mother tongue")) return "mother_tongue";
  if (c.includes("filipino")) return "filipino";
  if (c.includes("english")) return "english";
  if (c.includes("math")) return "mathematics";
  if (c.includes("science")) return "science";
  if (c.includes("araling") || /\bap\b/.test(c)) return "araling_panlipunan";
  if (c.includes("tle") || c.includes("technology") || c.includes("livelihood")) return "tle";
  if (/\bmusic\b/.test(c)) return "music";
  if (/\barts?\b/.test(c)) return "arts";
  if (c.includes("physical education") || /\bpe\b/.test(c)) return "pe";
  if (/\bhealth\b/.test(c) && !c.includes("mapeh")) return "health";
  if (c.includes("mapeh")) return "mapeh";
  if (c.includes("esp") || c.includes("edukasyon") || c.includes("pagpapakatao")) return "esp";
  return `other__${name}`;
}

function getESKey(name: string, code: string): string {
  const c = `${name} ${code}`.toLowerCase();
  if (c.includes("mother tongue") || (c.includes("language") && !c.includes("filipino"))) return "language";
  if (c.includes("reading") || c.includes("literacy")) return "reading_literacy";
  if (c.includes("filipino")) return "filipino";
  if (c.includes("english")) return "english";
  if (c.includes("math")) return "mathematics";
  if (c.includes("science")) return "science";
  if (c.includes("gmrc") || c.includes("good manners")) return "gmrc";
  if (c.includes("makabansa")) return "makabansa";
  if (c.includes("araling") || /\bap\b/.test(c)) return "araling_panlipunan";
  if (c.includes("epp")) return "epp";
  if (/\bmusic\b/.test(c)) return "music";
  if (/\barts?\b/.test(c)) return "arts";
  if (c.includes("physical education") || /\bpe\b/.test(c)) return "pe_health";
  if (/\bhealth\b/.test(c)) return "pe_health";
  if (c.includes("mapeh")) return "mapeh";
  if (c.includes("esp") || c.includes("edukasyon") || c.includes("pagpapakatao")) return "esp";
  if (c.includes("arabic")) return "arabic";
  if (c.includes("islamic")) return "islamic_values";
  return `other__${name}`;
}

// ── Types ─────────────────────────────────────────────────────────────────

type GradeRecord = Grade & { subject: Subject; section: Section | null };

type GradeLookup = Record<string, { q1: number | null; q2: number | null; q3: number | null; q4: number | null }>;

type LevelData = {
  gradeLevel: number;
  sectionName: string;
  schoolYear: string;
  adviserName: string;
  schoolName: string;
  schoolIdCode: string;
  district: string;
  division: string;
  region: string;
  lookup: GradeLookup;
  records: GradeRecord[];
};

// ── Subject definitions ────────────────────────────────────────────────────

export type SubjectDef = { key: string; label: string; isHeader?: boolean; isSub?: boolean };

export const JHS_SUBJECTS: SubjectDef[] = [
  { key: "mother_tongue", label: "Mother Tongue" },
  { key: "filipino", label: "Filipino" },
  { key: "english", label: "English" },
  { key: "mathematics", label: "Mathematics" },
  { key: "science", label: "Science" },
  { key: "araling_panlipunan", label: "Araling Panlipunan" },
  { key: "tle", label: "Technology and Livelihood Education (TLE)" },
  { key: "mapeh", label: "MAPEH", isHeader: true },
  { key: "music", label: "Music", isSub: true },
  { key: "arts", label: "Arts", isSub: true },
  { key: "pe", label: "Physical Education", isSub: true },
  { key: "health", label: "Health", isSub: true },
  { key: "esp", label: "Edukasyon sa Pagpapakatao (EsP)" },
];

export const ES_SUBJECTS_1_3: SubjectDef[] = [
  { key: "language", label: "Language" },
  { key: "reading_literacy", label: "Reading and Literacy" },
  { key: "mathematics", label: "Mathematics" },
  { key: "gmrc", label: "GMRC (Good Manners and Right Conduct)" },
  { key: "makabansa", label: "Makabansa" },
  { key: "arabic", label: "*Arabic Language" },
  { key: "islamic_values", label: "*Islamic Values Education" },
];

export const ES_SUBJECTS_4_6: SubjectDef[] = [
  { key: "filipino", label: "Filipino" },
  { key: "english", label: "English" },
  { key: "mathematics", label: "Mathematics" },
  { key: "science", label: "Science" },
  { key: "araling_panlipunan", label: "Araling Panlipunan" },
  { key: "epp", label: "EPP" },
  { key: "mapeh", label: "MAPEH", isHeader: true },
  { key: "music", label: "Music", isSub: true },
  { key: "arts", label: "Arts", isSub: true },
  { key: "pe_health", label: "Physical Education & Health", isSub: true },
  { key: "esp", label: "Edukasyon sa Pagpapakatao (EsP)" },
  { key: "arabic", label: "*Arabic Language" },
  { key: "islamic_values", label: "*Islamic Values Education" },
];

// ── Build grade lookup for a set of records ────────────────────────────────

function buildLookup(records: GradeRecord[], keyFn: (n: string, c: string) => string): GradeLookup {
  const lookup: GradeLookup = {};
  const subjectIds = [...new Set(records.map((r) => r.subject_id))];
  subjectIds.forEach((sid) => {
    const recs = records.filter((r) => r.subject_id === sid);
    const subj = recs[0]?.subject;
    if (!subj) return;
    const key = keyFn(subj.name || "", subj.code || "");
    const q1 = recs.find((r) => r.grading_period === 1)?.grade ?? null;
    const q2 = recs.find((r) => r.grading_period === 2)?.grade ?? null;
    const q3 = recs.find((r) => r.grading_period === 3)?.grade ?? null;
    const q4 = recs.find((r) => r.grading_period === 4)?.grade ?? null;
    if (!lookup[key]) {
      lookup[key] = { q1, q2, q3, q4 };
    }
  });
  return lookup;
}

// ── Shared CSS ─────────────────────────────────────────────────────────────

const SHARED_CSS = `
@page { size: 8.5in 13in; margin: 0.45in 0.55in; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; color: #000; background: #fff; line-height: 1.2; }
.section-header { background: #ddd; font-weight: bold; font-size: 7.5pt; text-align: center; padding: 3px 4px; border: 1px solid #000; letter-spacing: 0.5px; margin-top: 6px; }
.two-col-info { width: 100%; border-collapse: collapse; font-size: 7pt; }
.two-col-info td { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
.two-col-info .lbl { font-weight: bold; background: #f5f5f5; white-space: nowrap; }
.grades-2col { width: 100%; border-collapse: collapse; font-size: 7pt; margin-bottom: 4px; }
.grades-2col th, .grades-2col td { border: 1px solid #000; padding: 2px 3px; text-align: center; vertical-align: middle; }
.grades-2col .subj-name { text-align: left; padding-left: 4px; }
.grades-2col .subj-indent { text-align: left; padding-left: 14px; }
.grades-2col .subj-header { text-align: left; padding-left: 4px; font-weight: bold; background: #f0f0f0; }
.grades-2col th { background: #e8e8e8; font-weight: bold; font-size: 7pt; }
.gen-avg { background: #f5f5f5; font-weight: bold; }
.col-sep { border-left: 2px solid #000 !important; }
.remedial-section { width: 100%; border-collapse: collapse; font-size: 7pt; margin-top: 2px; }
.remedial-section td { border: 1px solid #000; padding: 2px 4px; }
.grade-pair { display: table; width: 100%; margin-bottom: 10px; page-break-inside: avoid; break-inside: avoid; }
.grade-pair table { page-break-inside: avoid; break-inside: avoid; }
.level-box { display: table; width: 100%; margin-bottom: 8px; border: 2px solid #000; page-break-inside: avoid; break-inside: avoid; }
.level-box table { page-break-inside: avoid; break-inside: avoid; }
.es-pair-row { display: flex; gap: 8px; margin-bottom: 8px; page-break-inside: avoid; break-inside: avoid; }
.es-box { flex: 1; border: 1.5px solid #000; page-break-inside: avoid; break-inside: avoid; }
.es-box-hdr { width: 100%; border-collapse: collapse; font-size: 6.5pt; }
.es-box-hdr td { border: 1px solid #000; padding: 1px 3px; vertical-align: middle; }
.es-box-hdr .lbl { font-weight: bold; background: #f5f5f5; white-space: nowrap; }
.es-box-grades { width: 100%; border-collapse: collapse; font-size: 6.5pt; }
.es-box-grades th, .es-box-grades td { border: 1px solid #000; padding: 1px 2px; text-align: center; vertical-align: middle; }
.es-box-grades .subj-name { text-align: left; padding-left: 3px; }
.es-box-grades .subj-indent { text-align: left; padding-left: 12px; }
.es-box-grades .subj-header { text-align: left; padding-left: 3px; font-weight: bold; background: #f0f0f0; }
.es-box-grades th { background: #e8e8e8; font-weight: bold; font-size: 6.5pt; }
.es-box-remedial { width: 100%; border-collapse: collapse; font-size: 6.5pt; }
.es-box-remedial td { border: 1px solid #000; padding: 1px 3px; }
.es-box-remedial .lbl { font-weight: bold; }
.school-hdr-single { width: 100%; border-collapse: collapse; font-size: 7pt; }
.school-hdr-single td { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
.school-hdr-single .lbl { font-weight: bold; white-space: nowrap; background: #f5f5f5; }
.grades-single { width: 100%; border-collapse: collapse; font-size: 7pt; }
.grades-single th, .grades-single td { border: 1px solid #000; padding: 2px 3px; text-align: center; vertical-align: middle; }
.grades-single .subj-name { text-align: left; padding-left: 4px; }
.grades-single .subj-indent { text-align: left; padding-left: 14px; }
.grades-single .subj-header { text-align: left; padding-left: 4px; font-weight: bold; background: #f0f0f0; }
.grades-single th { background: #e8e8e8; font-weight: bold; font-size: 7pt; }
.remedial-single { width: 100%; border-collapse: collapse; font-size: 7pt; }
.remedial-single td { border: 1px solid #000; padding: 2px 4px; }
.personal-info-tbl { width: 100%; border-collapse: collapse; font-size: 7.5pt; margin-bottom: 3px; }
.personal-info-tbl td { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
.personal-info-tbl .lbl { font-weight: bold; white-space: nowrap; background: #f5f5f5; font-size: 7pt; }
.personal-info-tbl .val { min-width: 80px; }
.eligibility-tbl { width: 100%; border-collapse: collapse; font-size: 7pt; margin-bottom: 3px; }
.eligibility-tbl td { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
.eligibility-tbl .lbl { font-weight: bold; white-space: nowrap; background: #f5f5f5; }
.form-title-main { font-size: 11pt; font-weight: bold; text-transform: uppercase; }
.form-subtitle { font-size: 8pt; font-style: italic; }
.republic { font-size: 8pt; }
${DEPED_HEADER_LOGOS_STYLES}
@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

// ── Render one grade-pair block (two side-by-side grade levels) ────────────

function renderPair(
  leftData: LevelData | null,
  rightData: LevelData | null,
  subjects: SubjectDef[],
): string {
  const lLookup = leftData?.lookup ?? {};
  const rLookup = rightData?.lookup ?? {};

  const leftFinals: number[] = [];
  const rightFinals: number[] = [];

  const cellsFor = (lookup: GradeLookup, key: string): string => {
    const d = lookup[key];
    if (!d) return "<td></td><td></td><td></td><td></td><td></td><td></td>";
    const fin = computeFinal([d.q1, d.q2, d.q3, d.q4]);
    const rem = fin !== null ? (fin >= 75 ? "Passed" : "Failed") : "";
    return `<td>${fmtG(d.q1)}</td><td>${fmtG(d.q2)}</td><td>${fmtG(d.q3)}</td><td>${fmtG(d.q4)}</td><td>${fmtG(fin)}</td><td>${rem}</td>`;
  };

  // Compute general averages
  subjects.filter((s) => !s.isHeader && !s.isSub).forEach((s) => {
    const lFin = computeFinal([lLookup[s.key]?.q1 ?? null, lLookup[s.key]?.q2 ?? null, lLookup[s.key]?.q3 ?? null, lLookup[s.key]?.q4 ?? null]);
    if (lFin !== null) leftFinals.push(lFin);
    const rFin = computeFinal([rLookup[s.key]?.q1 ?? null, rLookup[s.key]?.q2 ?? null, rLookup[s.key]?.q3 ?? null, rLookup[s.key]?.q4 ?? null]);
    if (rFin !== null) rightFinals.push(rFin);
  });

  const lGenAvg = leftFinals.length > 0 ? leftFinals.reduce((a, b) => a + b, 0) / leftFinals.length : null;
  const rGenAvg = rightFinals.length > 0 ? rightFinals.reduce((a, b) => a + b, 0) / rightFinals.length : null;

  const lGL = leftData ? (leftData.gradeLevel === -1 ? "SNED" : leftData.gradeLevel === 0 ? "K" : `${leftData.gradeLevel}`) : "";
  const rGL = rightData ? (rightData.gradeLevel === -1 ? "SNED" : rightData.gradeLevel === 0 ? "K" : `${rightData.gradeLevel}`) : "";

  const subjectRows = subjects.map((s) => {
    if (s.isHeader) {
      return `<tr>
        <td class="subj-header" colspan="7">${s.label}</td>
        <td class="subj-header col-sep" colspan="7">${s.label}</td>
      </tr>`;
    }
    const cls = s.isSub ? "subj-indent" : "subj-name";
    return `<tr>
      <td class="${cls}">${s.label}</td>
      ${cellsFor(lLookup, s.key)}
      <td class="${cls} col-sep">${s.label}</td>
      ${cellsFor(rLookup, s.key)}
    </tr>`;
  }).join("");

  const genAvgRow = `<tr class="gen-avg">
    <td class="subj-name">General Average</td>
    <td colspan="4"></td>
    <td>${fmtG(lGenAvg)}</td>
    <td>${lGenAvg !== null ? (lGenAvg >= 75 ? "Passed" : "Failed") : ""}</td>
    <td class="subj-name col-sep">General Average</td>
    <td colspan="4"></td>
    <td>${fmtG(rGenAvg)}</td>
    <td>${rGenAvg !== null ? (rGenAvg >= 75 ? "Passed" : "Failed") : ""}</td>
  </tr>`;

  return `
  <div class="grade-pair">
    <table class="two-col-info">
      <tr>
        <td class="lbl">School:</td><td colspan="3">${leftData?.schoolName ?? ""}</td>
        <td class="lbl">School ID:</td><td>${leftData?.schoolIdCode ?? ""}</td>
        <td class="lbl">School:</td><td colspan="3">${rightData?.schoolName ?? ""}</td>
        <td class="lbl">School ID:</td><td>${rightData?.schoolIdCode ?? ""}</td>
      </tr>
      <tr>
        <td class="lbl">District:</td><td>${leftData?.district ?? ""}</td>
        <td class="lbl">Division:</td><td colspan="3">${leftData?.division ?? ""}</td>
        <td class="lbl">District:</td><td>${rightData?.district ?? ""}</td>
        <td class="lbl">Division:</td><td colspan="3">${rightData?.division ?? ""}</td>
      </tr>
      <tr>
        <td class="lbl">Classified as Grade:</td><td>${lGL}</td>
        <td class="lbl">Section:</td><td>${leftData?.sectionName ?? ""}</td>
        <td class="lbl">School Year:</td><td>${leftData?.schoolYear ?? ""}</td>
        <td class="lbl">Classified as Grade:</td><td>${rGL}</td>
        <td class="lbl">Section:</td><td>${rightData?.sectionName ?? ""}</td>
        <td class="lbl">School Year:</td><td>${rightData?.schoolYear ?? ""}</td>
      </tr>
      <tr>
        <td class="lbl">Name of Adviser/Teacher:</td><td colspan="3">${leftData?.adviserName ?? ""}</td>
        <td class="lbl">Signature:</td><td></td>
        <td class="lbl">Name of Adviser/Teacher:</td><td colspan="3">${rightData?.adviserName ?? ""}</td>
        <td class="lbl">Signature:</td><td></td>
      </tr>
    </table>
    <table class="grades-2col">
      <thead>
        <tr>
          <th rowspan="2" style="width:18%">LEARNING AREAS</th>
          <th colspan="4">Quarterly Rating</th>
          <th rowspan="2">Final<br>Rating</th>
          <th rowspan="2">Remarks</th>
          <th rowspan="2" style="width:18%" class="col-sep">Learning Areas</th>
          <th colspan="4">Quarterly Rating</th>
          <th rowspan="2">Final<br>Rating</th>
          <th rowspan="2">Remarks</th>
        </tr>
        <tr>
          <th>1</th><th>2</th><th>3</th><th>4</th>
          <th>1</th><th>2</th><th>3</th><th>4</th>
        </tr>
      </thead>
      <tbody>
        ${subjectRows}
        ${genAvgRow}
      </tbody>
    </table>
    <table class="remedial-section">
      <tr>
        <td class="lbl" style="width:15%">Remedial Classes</td>
        <td style="width:12%">Conducted from:</td><td style="width:10%"></td>
        <td style="width:3%">to</td><td style="width:10%"></td>
        <td class="lbl col-sep" style="width:15%">Remedial Classes</td>
        <td style="width:12%">Conducted from:</td><td style="width:10%"></td>
        <td style="width:3%">to</td><td style="width:10%"></td>
      </tr>
      <tr>
        <td class="lbl">Learning Areas</td>
        <td class="lbl">Final Rating</td>
        <td class="lbl">Remedial Class Mark</td>
        <td class="lbl" colspan="2">Recomputed Final Grade</td>
        <td class="lbl col-sep">Learning Areas</td>
        <td class="lbl">Final Rating</td>
        <td class="lbl">Remedial Class Mark</td>
        <td class="lbl" colspan="2">Recomputed Final Grade</td>
      </tr>
      <tr><td colspan="5" style="height:16px;"></td><td colspan="5" style="height:16px;"></td></tr>
    </table>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// SF10-JHS HTML generator
// ══════════════════════════════════════════════════════════════════════════

function buildJHSHtml(
  student: Record<string, string | null | undefined>,
  levelMap: Map<number, LevelData>,
): void {
  const name = `${student.last_name || ""}, ${student.first_name || ""} ${student.middle_name || ""}`.trim();
  const sex = student.gender === "male" ? "Male" : "Female";

  const grade7 = levelMap.get(7) ?? null;
  const grade8 = levelMap.get(8) ?? null;
  const grade9 = levelMap.get(9) ?? null;
  const grade10 = levelMap.get(10) ?? null;

  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<title>SF10-JHS – ${name}</title>
<style>${SHARED_CSS}</style>
</head><body>
${buildDepEdHeaderWithLogos(`
  <div class="republic">Republic of the Philippines</div>
  <div style="font-size:9pt;font-weight:bold">Department of Education</div>
  <div class="form-title-main" style="margin-top:6px">Learner Permanent Academic Record for Junior High School (SF10-JHS)</div>
`)}

<div class="section-header">LEARNER'S PERSONAL INFORMATION</div>
<table class="personal-info-tbl">
  <tr>
    <td class="lbl">LAST NAME:</td><td class="val">${student.last_name || ""}</td>
    <td class="lbl">FIRST NAME:</td><td class="val">${student.first_name || ""}</td>
    <td class="lbl">NAME EXTN. (Jr,I,II):</td><td class="val">${student.suffix || ""}</td>
    <td class="lbl">MIDDLE NAME:</td><td class="val">${student.middle_name || ""}</td>
  </tr>
  <tr>
    <td class="lbl">Learner Reference No. (LRN):</td><td>${student.lrn || ""}</td>
    <td class="lbl">Birthdate (mm/dd/yyyy):</td><td>${fmt(student.date_of_birth)}</td>
    <td class="lbl">Sex:</td><td>${sex}</td>
    <td class="lbl">Date of JHS Admission:</td><td></td>
  </tr>
</table>

<div class="section-header">ELIGIBILITY FOR JHS ENROLLMENT</div>
<table class="eligibility-tbl">
  <tr>
    <td class="lbl">Junior High School Completed:*</td><td></td>
    <td class="lbl">Gen. Ave.:</td><td></td>
    <td class="lbl">Date of HS Grad./Completion:</td><td></td>
    <td class="lbl">School Year:</td><td></td>
    <td class="lbl">School NAC/Name:</td><td></td>
  </tr>
  <tr>
    <td class="lbl">PEPT Passer:**</td><td></td>
    <td class="lbl">Rating:</td><td></td>
    <td class="lbl">Date of Examination/Assessment:</td><td></td>
    <td class="lbl">ALS A&amp;E Passer:</td><td></td>
    <td class="lbl">Others (Pls. Specify):</td><td></td>
  </tr>
  <tr>
    <td class="lbl">Name and Address of Testing Center:</td>
    <td colspan="6"></td>
    <td class="lbl">Remark:</td><td></td>
  </tr>
</table>

<div class="section-header">SCHOLASTIC RECORD</div>

${renderPair(grade7, grade8, JHS_SUBJECTS)}
${renderPair(grade9, grade10, JHS_SUBJECTS)}

<div style="margin-top:10px; font-size:7pt; text-align:center; border-top:1px solid #000; padding-top:4px;">
  * For those who completed elementary, provide school and general average. ** PEPT is DepEd's Philippine Educational Placement Test. *** Notate on ALS A&amp;E = Alternative Learning System Accreditation and Equivalency.
</div>
</body></html>`;

  printHTMLContent(html);
}

// ── Render one ES grade level box ──────────────────────────────────────────

function renderESBox(data: LevelData | null, subjects: SubjectDef[]): string {
  const lookup = data?.lookup ?? {};
  const finals: number[] = [];

  const cellsFor = (key: string): string => {
    const d = lookup[key];
    if (!d) return "<td></td><td></td><td></td><td></td><td></td><td></td>";
    const fin = computeFinal([d.q1, d.q2, d.q3, d.q4]);
    const rem = fin !== null ? (fin >= 75 ? "Passed" : "Failed") : "";
    return `<td>${fmtG(d.q1)}</td><td>${fmtG(d.q2)}</td><td>${fmtG(d.q3)}</td><td>${fmtG(d.q4)}</td><td>${fmtG(fin)}</td><td>${rem}</td>`;
  };

  subjects.filter((s) => !s.isHeader && !s.isSub).forEach((s) => {
    const fin = computeFinal([lookup[s.key]?.q1 ?? null, lookup[s.key]?.q2 ?? null, lookup[s.key]?.q3 ?? null, lookup[s.key]?.q4 ?? null]);
    if (fin !== null) finals.push(fin);
  });

  const genAvg = finals.length > 0 ? finals.reduce((a, b) => a + b, 0) / finals.length : null;
  const gl = data ? (data.gradeLevel === -1 ? "SNED" : data.gradeLevel === 0 ? "K" : String(data.gradeLevel)) : "";

  const subjectRows = subjects.map((s) => {
    if (s.isHeader) {
      return `<tr><td class="subj-header" colspan="7">${s.label}</td></tr>`;
    }
    const cls = s.isSub ? "subj-indent" : "subj-name";
    return `<tr><td class="${cls}">${s.label}</td>${cellsFor(s.key)}</tr>`;
  }).join("");

  return `
  <div class="es-box">
    <table class="es-box-hdr">
      <tr>
        <td class="lbl">School:</td><td colspan="3">${data?.schoolName ?? ""}</td>
        <td class="lbl">School ID:</td><td>${data?.schoolIdCode ?? ""}</td>
      </tr>
      <tr>
        <td class="lbl">District:</td><td>${data?.district ?? ""}</td>
        <td class="lbl">Division:</td><td colspan="3">${data?.division ?? ""}</td>
      </tr>
      <tr>
        <td class="lbl">Classified as Grade:</td><td>${gl}</td>
        <td class="lbl">Section:</td><td>${data?.sectionName ?? ""}</td>
        <td class="lbl">School Year:</td><td>${data?.schoolYear ?? ""}</td>
      </tr>
      <tr>
        <td class="lbl">Name of Adviser/Teacher:</td><td colspan="3">${data?.adviserName ?? ""}</td>
        <td class="lbl">Signature:</td><td></td>
      </tr>
    </table>
    <table class="es-box-grades">
      <thead>
        <tr>
          <th rowspan="2" style="width:30%">LEARNING AREAS</th>
          <th colspan="4">Quarterly Rating</th>
          <th rowspan="2">Final<br>Rating</th>
          <th rowspan="2">Remarks</th>
        </tr>
        <tr><th>1</th><th>2</th><th>3</th><th>4</th></tr>
      </thead>
      <tbody>
        ${subjectRows}
        <tr class="gen-avg">
          <td class="subj-name">General Average</td>
          <td colspan="4"></td>
          <td>${fmtG(genAvg)}</td>
          <td>${genAvg !== null ? (genAvg >= 75 ? "Passed" : "Failed") : ""}</td>
        </tr>
      </tbody>
    </table>
    <table class="es-box-remedial">
      <tr>
        <td class="lbl" style="width:25%">Remedial Classes</td>
        <td style="width:20%">Conducted from:</td><td style="width:15%"></td>
        <td style="width:5%">to</td><td></td>
      </tr>
      <tr>
        <td class="lbl">Learning Areas</td>
        <td class="lbl">Final Rating</td>
        <td class="lbl">Remedial Class Mark</td>
        <td class="lbl" colspan="2">Recomputed Final Grade</td>
      </tr>
      <tr><td colspan="5" style="height:14px;"></td></tr>
    </table>
  </div>`;
}

// ── Render ES grade-pair (two side-by-side boxes with gap) ────────────────

function renderESPair(
  leftData: LevelData | null,
  rightData: LevelData | null,
  leftSubjects: SubjectDef[],
  rightSubjects: SubjectDef[],
): string {
  return `
  <div class="es-pair-row">
    ${renderESBox(leftData, leftSubjects)}
    ${renderESBox(rightData, rightSubjects)}
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// SF10-ES HTML generator
// ══════════════════════════════════════════════════════════════════════════

function buildESHtml(
  student: Record<string, string | null | undefined>,
  levelMap: Map<number, LevelData>,
): void {
  const name = `${student.last_name || ""}, ${student.first_name || ""} ${student.middle_name || ""}`.trim();
  const sex = student.gender === "male" ? "Male" : "Female";

  const gradeK = levelMap.get(0) ?? null;
  const grade1 = levelMap.get(1) ?? null;
  const grade2 = levelMap.get(2) ?? null;
  const grade3 = levelMap.get(3) ?? null;
  const grade4 = levelMap.get(4) ?? null;
  const grade5 = levelMap.get(5) ?? null;
  const grade6 = levelMap.get(6) ?? null;

  // For ES: K is shown in eligibility only, grades 1-3 use first column set, 4-6 use second
  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<title>SF10-ES – ${name}</title>
<style>${SHARED_CSS}</style>
</head><body>
${buildDepEdHeaderWithLogos(`
  <div class="republic">Republic of the Philippines</div>
  <div style="font-size:9pt;font-weight:bold">Department of Education</div>
  <div class="form-title-main" style="margin-top:6px">Learner Permanent Academic Record for Elementary School (SF10-ES)</div>
  <div class="form-subtitle">(Formerly Form 137)</div>
`)}

<div class="section-header">LEARNER'S PERSONAL INFORMATION</div>
<table class="personal-info-tbl">
  <tr>
    <td class="lbl">LAST NAME:</td><td class="val">${student.last_name || ""}</td>
    <td class="lbl">FIRST NAME:</td><td class="val">${student.first_name || ""}</td>
    <td class="lbl">NAME EXTN. (Jr,I,II):</td><td class="val">${student.suffix || ""}</td>
    <td class="lbl">MIDDLE NAME:</td><td class="val">${student.middle_name || ""}</td>
  </tr>
  <tr>
    <td class="lbl">Learner Reference Number (LRN):</td><td>${student.lrn || ""}</td>
    <td class="lbl">Birthdate (mm/dd/yyyy):</td><td>${fmt(student.date_of_birth)}</td>
    <td class="lbl">Sex:</td><td>${sex}</td>
    <td colspan="2"></td>
  </tr>
</table>

<div class="section-header">ELIGIBILITY FOR ELEMENTARY SCHOOL ENROLLMENT</div>
<table class="eligibility-tbl">
  <tr>
    <td class="lbl">Credential Presented for Grade 1:</td>
    <td>☐ Kinder Progress Report</td>
    <td>☐ ECCD Checklist</td>
    <td colspan="4"></td>
  </tr>
  <tr>
    <td class="lbl">Name of School:</td><td>${gradeK?.schoolName ?? ""}</td>
    <td class="lbl">School ID:</td><td>${gradeK?.schoolIdCode ?? ""}</td>
    <td class="lbl">Address of School:</td><td colspan="2"></td>
  </tr>
  <tr>
    <td class="lbl" colspan="7">Other Credential Presented:</td>
  </tr>
  <tr>
    <td class="lbl">PEPT Passer* Rating:</td><td></td>
    <td class="lbl">Date of Examination/Assessment (mm/dd/yyyy):</td><td></td>
    <td class="lbl">Others (Pls. Specify):</td><td colspan="2"></td>
  </tr>
  <tr>
    <td class="lbl">Name and Address of Testing Center:</td>
    <td colspan="3"></td>
    <td class="lbl">Remark:</td><td colspan="2"></td>
  </tr>
</table>

<div class="section-header">SCHOLASTIC RECORD</div>

${renderESPair(grade1, grade2, ES_SUBJECTS_1_3, ES_SUBJECTS_1_3)}
${renderESPair(grade3, grade4, ES_SUBJECTS_1_3, ES_SUBJECTS_4_6)}

<div style="page-break-before: always;"></div>

${renderESPair(grade5, grade6, ES_SUBJECTS_4_6, ES_SUBJECTS_4_6)}

<div style="margin-top:10px; font-size:7pt; text-align:center; border-top:1px solid #000; padding-top:4px;">
  *PEPT – Philippine Educational Placement Test
</div>
</body></html>`;

  printHTMLContent(html);
}

// ══════════════════════════════════════════════════════════════════════════
// SF10-SHS HTML generator
// ══════════════════════════════════════════════════════════════════════════

function buildSHSHtml(
  student: Record<string, string | null | undefined>,
  allRecords: GradeRecord[],
  adviserNames: Record<string, string>,
): void {
  const name = `${student.last_name || ""}, ${student.first_name || ""} ${student.middle_name || ""}`.trim();
  const sex = student.gender === "male" ? "Male" : "Female";

  // Group records by grade level (11 or 12) and semester (periods 1-2 = sem1, 3-4 = sem2)
  const bySemester = (gradeLevel: number, sem: 1 | 2): GradeRecord[] => {
    const periods = sem === 1 ? [1, 2] : [3, 4];
    return allRecords.filter(
      (r) => r.section?.grade_level === gradeLevel && periods.includes(r.grading_period),
    );
  };

  const getSchoolInfo = (records: GradeRecord[]) => {
    const section = records[0]?.section;
    if (!section) return { school: "", schoolId: "", gradeLevel: "", section: "", schoolYear: "", adviser: "" };
    const advId = section.section_adviser_id ? String(section.section_adviser_id) : "";
    return {
      school: "",
      schoolId: "",
      gradeLevel: String(section.grade_level),
      section: section.name || "",
      schoolYear: records[0]?.school_year || "",
      adviser: advId && adviserNames[advId] ? adviserNames[advId] : "",
    };
  };

  const renderSHSSemesterTable = (records: GradeRecord[], sem: 1 | 2): string => {
    if (records.length === 0) return "";

    const info = getSchoolInfo(records);
    const semLabel = sem === 1 ? "FIRST" : "SECOND";
    const [p1, p2] = sem === 1 ? [1, 2] : [3, 4];

    // Group by subject
    const subjectIds = [...new Set(records.map((r) => r.subject_id))];
    let rows = "";
    const subjectFinals: number[] = [];

    subjectIds.forEach((sid) => {
      const recs = records.filter((r) => r.subject_id === sid);
      const subj = recs[0]?.subject;
      if (!subj) return;
      const q1Grade = recs.find((r) => r.grading_period === p1)?.grade ?? null;
      const q2Grade = recs.find((r) => r.grading_period === p2)?.grade ?? null;
      const fin = computeFinal([q1Grade, q2Grade]);
      if (fin !== null) subjectFinals.push(fin);
      const rem = fin !== null ? (fin >= 75 ? "Passed" : "Failed") : "";
      rows += `<tr>
        <td class="subj-name">${subj.name || ""}</td>
        <td>${fmtG(q1Grade)}</td>
        <td>${fmtG(q2Grade)}</td>
        <td>${fmtG(fin)}</td>
        <td></td>
        <td>${rem}</td>
      </tr>`;
    });

    const semAvg = subjectFinals.length > 0
      ? subjectFinals.reduce((a, b) => a + b, 0) / subjectFinals.length
      : null;

    return `
    <div style="margin-bottom:8px;">
      <table class="two-col-info" style="margin-bottom:3px;">
        <tr>
          <td class="lbl">SCHOOL:</td><td colspan="3">${info.school}</td>
          <td class="lbl">SCHOOL ID:</td><td></td>
          <td class="lbl">GRADE LEVEL:</td><td>${info.gradeLevel}</td>
          <td class="lbl">TRACK:</td><td colspan="2"></td>
        </tr>
        <tr>
          <td class="lbl">SCHOOL YEAR:</td><td>${info.schoolYear}</td>
          <td class="lbl">SECTION:</td><td>${info.section}</td>
          <td class="lbl">NAME OF ADVISER:</td><td colspan="3">${info.adviser}</td>
          <td class="lbl">SEM:</td><td colspan="2" style="font-weight:bold">${semLabel}</td>
        </tr>
      </table>
      <table class="grades-2col" style="width:70%;">
        <thead>
          <tr>
            <th style="width:45%">SUBJECTS</th>
            <th>Q1</th><th>Q2</th>
            <th>FINAL GRADE</th>
            <th>ACTION TAKEN</th>
            <th>REMARK</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="gen-avg">
            <td class="subj-name">Semester Average</td>
            <td colspan="2"></td>
            <td>${fmtG(semAvg)}</td>
            <td></td>
            <td>${semAvg !== null ? (semAvg >= 75 ? "Passed" : "Failed") : ""}</td>
          </tr>
        </tbody>
      </table>
      <table class="remedial-section" style="width:70%; margin-top:3px;">
        <tr>
          <td class="lbl">REMEDIATION CLASS</td>
          <td>Conducted from:</td><td></td><td>to</td><td></td><td>School:</td><td></td><td>School ID:</td><td></td>
        </tr>
        <tr>
          <td class="lbl">Learning Areas</td>
          <td class="lbl">Final Rating</td>
          <td class="lbl">Remedial Class Mark</td>
          <td class="lbl" colspan="2">Recomputed Final Grade</td>
          <td class="lbl" colspan="2">Action Taken</td>
          <td class="lbl" colspan="2">Remarks</td>
        </tr>
        <tr><td colspan="9" style="height:16px;"></td></tr>
      </table>
    </div>`;
  };

  // Summary table for a grade level
  const renderSHSSummary = (gradeLevel: number): string => {
    const allLevelRecs = allRecords.filter((r) => r.section?.grade_level === gradeLevel);
    if (allLevelRecs.length === 0) return "";

    const subjectIds = [...new Set(allLevelRecs.map((r) => r.subject_id))];
    let rows = "";
    const allFinals: number[] = [];

    subjectIds.forEach((sid) => {
      const recs = allLevelRecs.filter((r) => r.subject_id === sid);
      const subj = recs[0]?.subject;
      if (!subj) return;
      const q1 = recs.find((r) => r.grading_period === 1)?.grade ?? null;
      const q2 = recs.find((r) => r.grading_period === 2)?.grade ?? null;
      const q3 = recs.find((r) => r.grading_period === 3)?.grade ?? null;
      const q4 = recs.find((r) => r.grading_period === 4)?.grade ?? null;
      const fin = computeFinal([q1, q2, q3, q4]);
      if (fin !== null) allFinals.push(fin);
      const rem = fin !== null ? (fin >= 75 ? "Passed" : "Failed") : "";
      rows += `<tr>
        <td class="subj-name">${subj.name || ""}</td>
        <td>${fmtG(q1)}</td><td>${fmtG(q2)}</td><td>${fmtG(q3)}</td><td>${fmtG(q4)}</td>
        <td>${fmtG(fin)}</td>
        <td>${rem}</td>
      </tr>`;
    });

    const genAvg = allFinals.length > 0 ? allFinals.reduce((a, b) => a + b, 0) / allFinals.length : null;

    return `
    <div style="margin-top:8px; page-break-inside:avoid;">
      <div class="section-header">SUMMARY OF FINAL GRADES FOR GRADE ${gradeLevel}</div>
      <table class="grades-2col" style="width:80%;">
        <thead>
          <tr>
            <th style="width:40%">SUBJECTS</th>
            <th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th>
            <th>NOMINAL</th>
            <th>FINAL GRADES<br>(PASSED/FAILED)</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="gen-avg">
            <td class="subj-name">General Average</td>
            <td colspan="4"></td>
            <td>${fmtG(genAvg)}</td>
            <td>${genAvg !== null ? (genAvg >= 75 ? "Passed" : "Failed") : ""}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
  };

  const g11s1 = bySemester(11, 1);
  const g11s2 = bySemester(11, 2);
  const g12s1 = bySemester(12, 1);
  const g12s2 = bySemester(12, 2);

  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<title>SF10-SHS – ${name}</title>
<style>${SHARED_CSS}</style>
</head><body>
${buildDepEdHeaderWithLogos(`
  <div class="republic" style="text-transform:uppercase;font-weight:bold">Republic of the Philippines</div>
  <div style="text-transform:uppercase;font-weight:bold">Department of Education</div>
  <div class="form-title-main" style="margin-top:6px">Senior High School Learner's Permanent Record</div>
`)}

<div class="section-header">LEARNER'S INFORMATION</div>
<table class="personal-info-tbl">
  <tr>
    <td class="lbl">LAST NAME:</td><td>${student.last_name || ""}</td>
    <td class="lbl">FIRST NAME:</td><td>${student.first_name || ""}</td>
    <td class="lbl">MIDDLE NAME:</td><td>${student.middle_name || ""}</td>
    <td class="lbl">EXTENSION:</td><td>${student.suffix || ""}</td>
  </tr>
  <tr>
    <td class="lbl">LRN:</td><td>${student.lrn || ""}</td>
    <td class="lbl">DATE OF BIRTH:</td><td>${fmt(student.date_of_birth)}</td>
    <td class="lbl">SEX:</td><td>${sex}</td>
    <td class="lbl">DATE OF SHS ADMISSION:</td><td></td>
  </tr>
</table>

<div class="section-header">ELIGIBILITY FOR SHS ENROLLMENT</div>
<table class="eligibility-tbl">
  <tr>
    <td class="lbl">High School Completed*:</td><td></td>
    <td class="lbl">Gen. Ave.:</td><td></td>
    <td class="lbl">Date of HS Graduation/Completion:</td><td></td>
    <td class="lbl">School Year:</td><td></td>
    <td class="lbl">School NAC:</td><td></td>
  </tr>
  <tr>
    <td class="lbl">PEPT Passer**:</td><td></td>
    <td class="lbl">Rating:</td><td></td>
    <td class="lbl">ALS A&amp;E Passer***:</td><td></td>
    <td class="lbl">Others (Pls. Specify):</td><td colspan="3"></td>
  </tr>
  <tr>
    <td colspan="10" style="font-size:6.5pt;font-style:italic;padding:2px 4px;">
      *For those who completed JHS from other schools. **PEPT – Philippine Educational Placement Test. ***ALS A&amp;E – Alternative Learning System Accreditation and Equivalency.
    </td>
  </tr>
</table>

<div class="section-header">SCHOLASTIC RECORD</div>

${g11s1.length > 0 ? renderSHSSemesterTable(g11s1, 1) : ""}
${g11s2.length > 0 ? renderSHSSemesterTable(g11s2, 2) : ""}
${g11s1.length > 0 || g11s2.length > 0 ? renderSHSSummary(11) : ""}
${g12s1.length > 0 ? renderSHSSemesterTable(g12s1, 1) : ""}
${g12s2.length > 0 ? renderSHSSemesterTable(g12s2, 2) : ""}
${g12s1.length > 0 || g12s2.length > 0 ? renderSHSSummary(12) : ""}

</body></html>`;

  printHTMLContent(html);
}

// ══════════════════════════════════════════════════════════════════════════
// Main entry point
// ══════════════════════════════════════════════════════════════════════════

export async function generateSf10Print(params: Sf10Params): Promise<void> {
  const { studentId } = params;

  // Fetch student
  const { data: student, error: studentErr } = await supabase
    .from("sms_students")
    .select("*")
    .eq("id", studentId)
    .single();
  if (studentErr || !student) throw new Error("Student not found");

  // Fetch all grades with subject and section info
  const { data: grades } = await supabase
    .from("sms_grades")
    .select("*, subject:sms_subjects(*), section:sms_sections(*)")
    .eq("student_id", studentId)
    .order("school_year")
    .order("grading_period");

  const allRecords = (grades || []) as GradeRecord[];

  // Fetch school info for each unique school_id found across sections
  const schoolIds = new Set<string>();
  allRecords.forEach((r) => {
    if (r.section?.school_id) schoolIds.add(String(r.section.school_id));
  });
  const schoolInfo: Record<string, { name: string; schoolIdCode: string; district: string; division: string; region: string }> = {};
  if (schoolIds.size > 0) {
    const { data: schools } = await supabase
      .from("sms_schools")
      .select("id, name, school_id, district, division_id, region")
      .in("id", Array.from(schoolIds));
    (schools || []).forEach((s: { id: string | number; name: string; school_id: string; district: string | null; division_id: string | null; region: string | null }) => {
      schoolInfo[String(s.id)] = {
        name: s.name || "",
        schoolIdCode: s.school_id || "",
        district: s.district || "",
        division: s.division_id || "",
        region: s.region || "",
      };
    });
  }

  // Fetch adviser names
  const adviserIds = new Set<string>();
  allRecords.forEach((r) => {
    if (r.section?.section_adviser_id) adviserIds.add(String(r.section.section_adviser_id));
  });
  const adviserNames: Record<string, string> = {};
  if (adviserIds.size > 0) {
    const { data: advisers } = await supabase
      .from("sms_users")
      .select("id, name")
      .in("id", Array.from(adviserIds));
    (advisers || []).forEach((a) => { adviserNames[String(a.id)] = a.name || ""; });
  }

  // Fetch most recent enrollment to determine current grade level
  const { data: enrollments } = await supabase
    .from("sms_enrollments")
    .select("grade_level, section:sms_sections(grade_level)")
    .eq("student_id", studentId)
    .eq("status", "approved")
    .order("school_year", { ascending: false })
    .limit(1);

  const latestGradeLevel =
    (enrollments?.[0] as { grade_level?: number } | undefined)?.grade_level ??
    student.grade_level ??
    0;

  // Determine form type
  const formType = latestGradeLevel <= 6 ? "ES" : latestGradeLevel <= 10 ? "JHS" : "SHS";

  // Fetch historical grades
  const { data: historicalGrades } = await supabase
    .from("sms_historical_grades")
    .select("*")
    .eq("student_id", studentId);

  if (formType === "SHS") {
    // Inject historical SHS records as synthetic GradeRecords
    (historicalGrades || []).forEach((hg) => {
      if (hg.grade_level < 11) return;
      const sem = hg.semester as 1 | 2;
      const [p1, p2] = sem === 1 ? [1, 2] : [3, 4];
      const gradesData = hg.grades as Record<string, { q1: number | null; q2: number | null; q3: number | null; q4: number | null }>;

      Object.entries(gradesData).forEach(([subjectName, vals]) => {
        const syntheticSubject = { id: `hist_${subjectName}`, name: subjectName, code: "", school_id: hg.school_id };
        const syntheticSection = {
          id: `hist_${hg.grade_level}_${sem}`,
          name: hg.section_name,
          grade_level: hg.grade_level,
          school_id: hg.school_id,
          section_adviser_id: null,
          school_year: hg.school_year,
        };

        if (vals.q1 !== null) {
          allRecords.push({
            student_id: studentId, subject_id: syntheticSubject.id, section_id: syntheticSection.id,
            grading_period: p1, school_year: hg.school_year, grade: vals.q1,
            remarks: vals.q1 >= 75 ? "Passed" : "Failed", teacher_id: "",
            subject: syntheticSubject, section: syntheticSection,
          } as unknown as GradeRecord);
        }
        if (vals.q2 !== null) {
          allRecords.push({
            student_id: studentId, subject_id: syntheticSubject.id, section_id: syntheticSection.id,
            grading_period: p2, school_year: hg.school_year, grade: vals.q2,
            remarks: vals.q2 >= 75 ? "Passed" : "Failed", teacher_id: "",
            subject: syntheticSubject, section: syntheticSection,
          } as unknown as GradeRecord);
        }
      });
    });

    buildSHSHtml(student as Record<string, string | null | undefined>, allRecords, adviserNames);
    return;
  }

  // For ES and JHS: build grade level data map
  // Group records by grade level (pick the most recent school year per level)
  const byLevel = new Map<number, GradeRecord[]>();
  allRecords.forEach((r) => {
    const gl = r.section?.grade_level;
    if (gl === undefined || gl === null) return;
    if (!byLevel.has(gl)) byLevel.set(gl, []);
    byLevel.get(gl)!.push(r);
  });

  const keyFn = formType === "JHS" ? getJHSKey : getESKey;
  const levelMap = new Map<number, LevelData>();

  byLevel.forEach((records, gl) => {
    // Pick the most recent school year for this grade level
    const schoolYears = [...new Set(records.map((r) => r.school_year))].sort().reverse();
    const latestSY = schoolYears[0];
    const latestRecs = records.filter((r) => r.school_year === latestSY);
    const section = latestRecs[0]?.section;
    const advId = section?.section_adviser_id ? String(section.section_adviser_id) : "";
    const sectionSchoolId = section?.school_id ? String(section.school_id) : "";
    const school = sectionSchoolId ? (schoolInfo[sectionSchoolId] ?? null) : null;

    levelMap.set(gl, {
      gradeLevel: gl,
      sectionName: section?.name ?? "",
      schoolYear: latestSY,
      adviserName: advId && adviserNames[advId] ? adviserNames[advId] : "",
      schoolName: school?.name ?? "",
      schoolIdCode: school?.schoolIdCode ?? "",
      district: school?.district ?? "",
      division: school?.division ?? "",
      region: school?.region ?? "",
      lookup: buildLookup(latestRecs, keyFn),
      records: latestRecs,
    });
  });

  // Merge historical grades into levelMap — system records take priority
  (historicalGrades || []).forEach((hg) => {
    if (levelMap.has(hg.grade_level)) return; // system data wins
    const lookup: GradeLookup = {};
    const gradesData = hg.grades as Record<string, { q1: number | null; q2: number | null; q3: number | null; q4: number | null }>;
    Object.entries(gradesData).forEach(([key, val]) => {
      lookup[key] = { q1: val.q1, q2: val.q2, q3: val.q3, q4: val.q4 };
    });
    levelMap.set(hg.grade_level, {
      gradeLevel: hg.grade_level,
      sectionName: hg.section_name || "",
      schoolYear: hg.school_year,
      adviserName: hg.adviser_name || "",
      schoolName: hg.school_name || "",
      schoolIdCode: hg.school_id_code || "",
      district: hg.district || "",
      division: hg.division || "",
      region: hg.region || "",
      lookup,
      records: [],
    });
  });

  if (formType === "JHS") {
    buildJHSHtml(student as Record<string, string | null | undefined>, levelMap);
  } else {
    buildESHtml(student as Record<string, string | null | undefined>, levelMap);
  }
}
