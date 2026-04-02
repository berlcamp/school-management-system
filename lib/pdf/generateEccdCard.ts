import { buildDepEdHeaderWithLogos, DEPED_HEADER_LOGOS_STYLES, printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";
import { fetchSchoolSettings } from "@/lib/utils/schoolSettings";
import { EccdCompetency, EccdDomain, EccdScaleScore } from "@/types";

export interface EccdCardParams {
  schoolId: string;
  studentId: string;
  sectionId: string;
  schoolYear: string;
}

interface EccdCardData {
  school: { name: string; address: string; district: string; region: string };
  student: Record<string, string | number | null | undefined>;
  section: { name: string; section_adviser_id: string };
  adviserName: string;
  principalName: string;
  principalTitle: string;
  domains: EccdDomain[];
  competencies: EccdCompetency[];
  scaleScores: EccdScaleScore[];
  // assessments keyed by competencyId -> { 1ST_SEM: 0|1, 2ND_SEM: 0|1 }
  assessments: Record<string, Record<string, number>>;
  schoolYear: string;
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function computeAge(dob: string | null | undefined, refDate: string): string {
  if (!dob) return "";
  const birth = new Date(dob);
  const ref = new Date(refDate);
  let years = ref.getFullYear() - birth.getFullYear();
  const monthDiff = ref.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) {
    years--;
  }
  return `${years} yrs`;
}

async function fetchEccdCardData(params: EccdCardParams): Promise<EccdCardData> {
  const { schoolId, studentId, sectionId, schoolYear } = params;

  const [schoolRes, studentRes, sectionRes, domainsRes, compRes, scaleRes] = await Promise.all([
    supabase.from("sms_schools").select("name, address, district, region").eq("id", schoolId).single(),
    supabase.from("sms_students").select("*").eq("id", studentId).single(),
    supabase.from("sms_sections").select("name, section_adviser_id").eq("id", sectionId).single(),
    supabase.from("sms_eccd_domains").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("sms_eccd_competencies").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("sms_eccd_scale_scores").select("*"),
  ]);

  if (!schoolRes.data) throw new Error("School not found");
  if (!studentRes.data) throw new Error("Student not found");
  if (!sectionRes.data) throw new Error("Section not found");

  let adviserName = "";
  if (sectionRes.data.section_adviser_id) {
    const { data: adviser } = await supabase
      .from("sms_users")
      .select("name")
      .eq("id", sectionRes.data.section_adviser_id)
      .single();
    adviserName = adviser?.name || "";
  }

  const schoolSettings = await fetchSchoolSettings(schoolId);

  // Fetch assessments for both semesters
  const { data: assessmentData } = await supabase
    .from("sms_eccd_assessments")
    .select("competency_id, period, rating")
    .eq("student_id", studentId)
    .eq("section_id", sectionId)
    .eq("school_year", schoolYear)
    .in("period", ["1ST_SEM", "2ND_SEM"]);

  const assessments: Record<string, Record<string, number>> = {};
  (assessmentData || []).forEach((a: { competency_id: string; period: string; rating: number | null }) => {
    const cid = String(a.competency_id);
    if (!assessments[cid]) assessments[cid] = {};
    assessments[cid][a.period] = a.rating ?? 0;
  });

  return {
    school: schoolRes.data,
    student: studentRes.data,
    section: sectionRes.data,
    adviserName,
    principalName: schoolSettings.principal_name || "",
    principalTitle: schoolSettings.principal_title || "Principal",
    domains: domainsRes.data || [],
    competencies: compRes.data || [],
    scaleScores: scaleRes.data || [],
    assessments,
    schoolYear,
  };
}

function getRawScore(
  domainId: string,
  competencies: EccdCompetency[],
  assessments: Record<string, Record<string, number>>,
  semester: string
): number {
  const domainComps = competencies.filter((c) => String(c.domain_id) === String(domainId));
  return domainComps.reduce((sum, comp) => {
    const val = assessments[comp.id]?.[semester] ?? 0;
    return sum + val;
  }, 0);
}

function getScaleScore(
  domainId: string,
  rawScore: number,
  scaleScores: EccdScaleScore[]
): string {
  const mapping = scaleScores.find(
    (s) => String(s.domain_id) === String(domainId) && s.raw_score === rawScore
  );
  return mapping ? String(mapping.scale_score) : "";
}

function buildDomainHTML(
  domain: EccdDomain,
  competencies: EccdCompetency[],
  assessments: Record<string, Record<string, number>>,
  scaleScores: EccdScaleScore[],
  bgColor: string
): string {
  const domainComps = competencies.filter((c) => String(c.domain_id) === String(domain.id));
  const raw1st = getRawScore(domain.id, competencies, assessments, "1ST_SEM");
  const raw2nd = getRawScore(domain.id, competencies, assessments, "2ND_SEM");
  const scale1st = getScaleScore(domain.id, raw1st, scaleScores);
  const scale2nd = getScaleScore(domain.id, raw2nd, scaleScores);

  const checkMark = "&#10003;";

  let rows = "";
  domainComps.forEach((comp, idx) => {
    const checked1st = (assessments[comp.id]?.["1ST_SEM"] ?? 0) === 1;
    const checked2nd = (assessments[comp.id]?.["2ND_SEM"] ?? 0) === 1;
    rows += `<tr>
      <td class="item-num">${idx + 1}.</td>
      <td class="item-desc">${comp.description}</td>
      <td class="check-col">${checked1st ? checkMark : ""}</td>
      <td class="check-col">${checked2nd ? checkMark : ""}</td>
    </tr>`;
  });

  return `
    <div class="domain-section">
      <table class="domain-table">
        <thead>
          <tr>
            <th colspan="2" class="domain-header" style="background:${bgColor}">${domain.name.toUpperCase()}</th>
            <th class="sem-header" style="background:${bgColor}">1<sup>st</sup></th>
            <th class="sem-header" style="background:${bgColor}">2<sup>nd</sup></th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="score-row">
            <td colspan="2" class="score-label">TOTAL / Raw SCORE</td>
            <td class="check-col score-val">${raw1st}</td>
            <td class="check-col score-val">${raw2nd}</td>
          </tr>
          <tr class="score-row">
            <td colspan="2" class="score-label">SCALE SCORE</td>
            <td class="check-col score-val">${scale1st}</td>
            <td class="check-col score-val">${scale2nd}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

function buildSummaryTable(
  domains: EccdDomain[],
  competencies: EccdCompetency[],
  assessments: Record<string, Record<string, number>>,
  scaleScores: EccdScaleScore[]
): string {
  let rows = "";
  let totalRaw1st = 0;
  let totalRaw2nd = 0;
  let totalScale1st = 0;
  let totalScale2nd = 0;

  domains.forEach((domain) => {
    const raw1st = getRawScore(domain.id, competencies, assessments, "1ST_SEM");
    const raw2nd = getRawScore(domain.id, competencies, assessments, "2ND_SEM");
    const scale1st = getScaleScore(domain.id, raw1st, scaleScores);
    const scale2nd = getScaleScore(domain.id, raw2nd, scaleScores);
    totalRaw1st += raw1st;
    totalRaw2nd += raw2nd;
    totalScale1st += scale1st ? Number(scale1st) : 0;
    totalScale2nd += scale2nd ? Number(scale2nd) : 0;

    rows += `<tr>
      <td style="text-align:left;padding:3px 6px;border:1px solid #000;font-size:8pt">${domain.name}</td>
      <td class="summary-val">${raw1st}</td>
      <td class="summary-val">${scale1st}</td>
      <td class="summary-val">${raw2nd}</td>
      <td class="summary-val">${scale2nd}</td>
    </tr>`;
  });

  rows += `<tr style="font-weight:bold">
    <td style="text-align:left;padding:3px 6px;border:1px solid #000;font-size:8pt">TOTAL</td>
    <td class="summary-val">${totalRaw1st}</td>
    <td class="summary-val">${totalScale1st}</td>
    <td class="summary-val">${totalRaw2nd}</td>
    <td class="summary-val">${totalScale2nd}</td>
  </tr>`;

  return `
    <div class="summary-section">
      <h3 class="section-title">ECCD SUMMARY OF RESULTS</h3>
      <table class="summary-table">
        <thead>
          <tr>
            <th rowspan="2" style="text-align:left;padding:3px 6px;border:1px solid #000;font-size:8pt;background:#e8e8e8">DOMAIN</th>
            <th colspan="2" style="text-align:center;padding:3px 4px;border:1px solid #000;font-size:8pt;background:#e8e8e8">1st SEMESTER</th>
            <th colspan="2" style="text-align:center;padding:3px 4px;border:1px solid #000;font-size:8pt;background:#e8e8e8">2nd SEMESTER</th>
          </tr>
          <tr>
            <th style="text-align:center;padding:2px 4px;border:1px solid #000;font-size:7pt;background:#f0f0f0">Raw</th>
            <th style="text-align:center;padding:2px 4px;border:1px solid #000;font-size:7pt;background:#f0f0f0">Scale</th>
            <th style="text-align:center;padding:2px 4px;border:1px solid #000;font-size:7pt;background:#f0f0f0">Raw</th>
            <th style="text-align:center;padding:2px 4px;border:1px solid #000;font-size:7pt;background:#f0f0f0">Scale</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;
}

export async function generateEccdCardPrint(params: EccdCardParams): Promise<void> {
  const data = await fetchEccdCardData(params);
  const { school, student, section, adviserName, principalName, principalTitle, domains, competencies, scaleScores, assessments, schoolYear } = data;

  const studentName = `${student.last_name || ""}, ${student.first_name || ""} ${student.middle_name || ""} ${student.suffix || ""}`.trim();
  const dob = formatDate(student.date_of_birth as string);
  const sex = student.gender === "Male" ? "Male" : student.gender === "Female" ? "Female" : "";
  const [startYear] = schoolYear.split("-");
  const ageBOSY = computeAge(student.date_of_birth as string, `${startYear}-06-01`);
  const ageEOSY = computeAge(student.date_of_birth as string, `${Number(startYear) + 1}-03-31`);

  const domainColors = ["#FFE4B5", "#B0E0E6", "#E6E6FA", "#FFDAB9", "#D4F1D4", "#FFF8DC", "#F0E68C"];

  // Split domains for page layout
  // Page 1: first 3 domains (with header + profile)
  // Page 2: remaining domains + summary + interpretation + signatories
  const page1Domains = domains.slice(0, 3);
  const page2Domains = domains.slice(3);

  const page1DomainsHTML = page1Domains.map((d, i) =>
    buildDomainHTML(d, competencies, assessments, scaleScores, domainColors[i])
  ).join("");

  const page2DomainsHTML = page2Domains.map((d, i) =>
    buildDomainHTML(d, competencies, assessments, scaleScores, domainColors[i + 3])
  ).join("");

  const summaryHTML = buildSummaryTable(domains, competencies, assessments, scaleScores);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>ECCD Checklist - ${studentName}</title>
<style>
@page {
  size: 8.5in 13in;
  margin: 0.4in 0.5in;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Times New Roman", serif;
  font-size: 9pt;
  line-height: 1.3;
  color: #000;
  background: #fff;
}
${DEPED_HEADER_LOGOS_STYLES}
.deped-header-with-logos { margin-bottom: 8px; padding-bottom: 5px; }
.deped-logo-img { width: 70px; height: 70px; }
.deped-logo-left-wrap, .deped-logo-right-wrap { width: 70px; }

.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }

.form-title { text-align: center; font-size: 11pt; font-weight: bold; margin: 6px 0 2px; text-transform: uppercase; }
.form-subtitle { text-align: center; font-size: 9pt; margin-bottom: 2px; }
.sy-line { text-align: center; font-size: 9pt; margin-bottom: 8px; }

/* Profile table */
.profile-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 8pt; }
.profile-table td { padding: 2px 4px; border: 1px solid #000; }
.profile-label { font-weight: bold; background: #f5f5f5; width: 28%; }

/* Domain tables */
.domain-section { margin-bottom: 6px; }
.domain-table { width: 100%; border-collapse: collapse; font-size: 8pt; }
.domain-table th, .domain-table td { border: 1px solid #000; }
.domain-header { text-align: left; padding: 3px 6px; font-weight: bold; font-size: 8.5pt; }
.sem-header { text-align: center; padding: 2px 4px; font-size: 7pt; width: 35px; }
.item-num { text-align: center; width: 22px; padding: 1px 2px; font-size: 8pt; }
.item-desc { text-align: left; padding: 1px 4px; font-size: 8pt; }
.check-col { text-align: center; width: 35px; padding: 1px 2px; font-size: 9pt; }
.score-row { background: #f9f9f9; }
.score-label { text-align: right; padding: 2px 6px; font-weight: bold; font-size: 8pt; }
.score-val { font-weight: bold; font-size: 9pt; }

/* Two-column layout for domains */
.domains-row { display: flex; gap: 8px; margin-bottom: 6px; }
.domains-row .domain-section { flex: 1; min-width: 0; }

/* Summary */
.summary-section { margin-top: 10px; }
.section-title { font-size: 9pt; font-weight: bold; margin-bottom: 4px; text-align: center; text-transform: uppercase; }
.summary-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
.summary-val { text-align: center; padding: 2px 4px; border: 1px solid #000; font-size: 8pt; }

/* Interpretation tables */
.interp-section { margin-top: 8px; }
.interp-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 8pt; }
.interp-table th, .interp-table td { border: 1px solid #000; padding: 2px 5px; }
.interp-table th { background: #e8e8e8; font-size: 8pt; }

/* Signatories */
.signatories { margin-top: 30px; display: flex; justify-content: space-between; }
.sig-block { text-align: center; width: 40%; }
.sig-name { font-weight: bold; border-top: 1px solid #000; padding-top: 3px; font-size: 9pt; text-transform: uppercase; }
.sig-title { font-size: 8pt; }

@media print {
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
</style>
</head>
<body>

<!-- PAGE 1 -->
<div class="page">
  ${buildDepEdHeaderWithLogos(`
    <div style="font-size:8pt">Department of Education</div>
    <div style="font-size:8pt">${school.region || "Caraga Administrative Region"}</div>
    <div style="font-size:8pt">${school.district || "Division of Bayugan City"}</div>
    <div style="font-size:10pt;font-weight:bold;text-transform:uppercase;margin-top:2px">${school.name}</div>
  `)}

  <div class="form-title">Early Childhood Development Checklist (ECCD)</div>
  <div class="form-subtitle">GPDD &mdash; Comprehensive Profile of the Child</div>
  <div class="sy-line">School Year: <strong>${schoolYear}</strong></div>

  <table class="profile-table">
    <tr>
      <td class="profile-label">Name of Learner:</td>
      <td>${studentName}</td>
      <td class="profile-label">Level/Section:</td>
      <td>Kindergarten - ${section.name}</td>
      <td class="profile-label">Sex:</td>
      <td>${sex}</td>
    </tr>
    <tr>
      <td class="profile-label">Date of Birth:</td>
      <td>${dob}</td>
      <td class="profile-label">Age at Beginning of SY:</td>
      <td>${ageBOSY}</td>
      <td class="profile-label">Age at End of SY:</td>
      <td>${ageEOSY}</td>
    </tr>
    <tr>
      <td class="profile-label">LRN:</td>
      <td>${student.lrn || ""}</td>
      <td class="profile-label">Child&rsquo;s Immunization:</td>
      <td>${student.immunization_status || ""}</td>
      <td class="profile-label">Mother Tongue:</td>
      <td>${student.mother_tongue || ""}</td>
    </tr>
    <tr>
      <td class="profile-label">Father&rsquo;s Name:</td>
      <td>${student.father_name || ""}</td>
      <td class="profile-label">Mother&rsquo;s Name:</td>
      <td>${student.mother_name || ""}</td>
      <td class="profile-label">Child&rsquo;s Ethnic Group:</td>
      <td>${student.ip_ethnic_group || ""}</td>
    </tr>
    <tr>
      <td class="profile-label">Child&rsquo;s No. of Siblings:</td>
      <td>${student.no_of_siblings ?? ""}</td>
      <td class="profile-label">Child&rsquo;s Birth Order:</td>
      <td>${student.birth_order ?? ""}</td>
      <td class="profile-label">Parent&rsquo;s Contact No.:</td>
      <td>${student.contact_number || student.guardian_contact || ""}</td>
    </tr>
  </table>

  <div class="domains-row">
    ${page1Domains.length > 0 ? buildDomainHTML(page1Domains[0], competencies, assessments, scaleScores, domainColors[0]) : ""}
    ${page1Domains.length > 1 ? buildDomainHTML(page1Domains[1], competencies, assessments, scaleScores, domainColors[1]) : ""}
  </div>
  ${page1Domains.length > 2 ? `<div class="domains-row">${buildDomainHTML(page1Domains[2], competencies, assessments, scaleScores, domainColors[2])}<div class="domain-section" style="flex:1"></div></div>` : ""}
</div>

<!-- PAGE 2 -->
<div class="page">
  ${page2DomainsHTML ? `<div class="domains-row">${page2Domains.slice(0, 2).map((d, i) => buildDomainHTML(d, competencies, assessments, scaleScores, domainColors[i + 3])).join("")}</div>` : ""}
  ${page2Domains.length > 2 ? `<div class="domains-row">${page2Domains.slice(2).map((d, i) => buildDomainHTML(d, competencies, assessments, scaleScores, domainColors[i + 5])).join("")}${page2Domains.length === 3 ? '<div class="domain-section" style="flex:1"></div>' : ""}</div>` : ""}

  ${summaryHTML}

  <div class="interp-section">
    <h3 class="section-title">Standard Score Interpretation</h3>
    <table class="interp-table">
      <thead>
        <tr>
          <th>Standard Score Range</th>
          <th>Interpretation</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1.8 &ndash; 14</td><td>Suggest intensive development</td></tr>
        <tr><td>1.5 and above</td><td>Suggest highly-intensive development</td></tr>
        <tr><td>M &ndash; 1</td><td>Average to above average</td></tr>
        <tr><td>M &ndash; 1.5</td><td>Average/typical development</td></tr>
        <tr><td>Below M &ndash; 1.5</td><td>Suggest further developmental assessment</td></tr>
      </tbody>
    </table>
  </div>

  <div class="interp-section">
    <h3 class="section-title">Scale Score Interpretation</h3>
    <table class="interp-table">
      <thead>
        <tr>
          <th>Scale Score</th>
          <th>Interpretation (1st Sem)</th>
          <th>Interpretation (2nd Sem)</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>15 &ndash; 17</td><td>Advanced</td><td>Advanced</td></tr>
        <tr><td>12 &ndash; 14</td><td>Proficient</td><td>Proficient</td></tr>
        <tr><td>8 &ndash; 11</td><td>Approaching Proficiency</td><td>Approaching Proficiency</td></tr>
        <tr><td>4 &ndash; 7</td><td>Developing</td><td>Developing</td></tr>
        <tr><td>1 &ndash; 3</td><td>Beginning</td><td>Beginning</td></tr>
      </tbody>
    </table>
  </div>

  <div class="signatories">
    <div class="sig-block">
      <div class="sig-name">${adviserName || "&nbsp;"}</div>
      <div class="sig-title">Teacher</div>
    </div>
    <div class="sig-block">
      <div class="sig-name">${principalName || "&nbsp;"}</div>
      <div class="sig-title">${principalTitle}</div>
    </div>
  </div>
</div>

</body>
</html>`;

  printHTMLContent(html);
}
