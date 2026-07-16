import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";
import { getGradeLevelLabel } from "@/lib/constants";
import {
  SRC_BMI_BANDS,
  SRC_HFA_BANDS,
  SRC_SECTIONS,
  SRC_AWARD_LEVELS,
  SRC_AWARD_CATEGORIES,
} from "@/lib/constants/src";
import { formatPhp, formatSrcRatio, getSbmBand } from "@/lib/utils/src";
import type {
  SrcSectionKey,
  SrcSectionPayloadMap,
  SrcSignatory,
  SrcSubmission,
} from "@/types";

export interface SchoolReportCardParams {
  schoolId: string;
  schoolYear: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const DASH = "—";

function text(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v ? escapeHtml(v) : DASH;
}

function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return DASH;
  }
  return Number(value).toFixed(digits);
}

function labelFor(
  options: { value: string; label: string }[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/** Section heading + its analysis paragraph. */
function sectionHeading(key: SrcSectionKey): string {
  const meta = SRC_SECTIONS.find((s) => s.key === key);
  if (!meta) return "";
  return `<h2 class="section-title">${meta.numeral}. ${escapeHtml(meta.title)}</h2>`;
}

function narrativeBlock(narrative: string | null): string {
  const n = (narrative ?? "").trim();
  if (!n) return "";
  return `<p class="narrative">${escapeHtml(n)}</p>`;
}

function tableOrEmpty(headerHtml: string, bodyHtml: string, caption?: string): string {
  if (!bodyHtml) {
    return `<p class="empty">No data reported for this section.</p>`;
  }
  return `
    <table class="src-table">
      <thead>${headerHtml}</thead>
      <tbody>${bodyHtml}</tbody>
    </table>
    ${caption ? `<div class="caption">${escapeHtml(caption)}</div>` : ""}`;
}

export async function generateSchoolReportCard({
  schoolId,
  schoolYear,
}: SchoolReportCardParams): Promise<void> {
  const { data: school, error: schoolError } = await supabase
    .from("sms_schools")
    .select(
      "id, school_id, name, address, district, region, municipality_city, principal_name",
    )
    .eq("id", Number(schoolId))
    .single();

  if (schoolError || !school) {
    throw new Error("School not found");
  }

  const { data: submission, error: subError } = await supabase
    .from("sms_src_submissions")
    .select("*")
    .eq("school_id", Number(schoolId))
    .eq("school_year", schoolYear)
    .maybeSingle();

  if (subError) throw subError;
  if (!submission) {
    throw new Error(
      `No School Report Card has been started for ${schoolYear}. Save a draft first.`,
    );
  }

  const header = submission as SrcSubmission;

  const { data: sectionRows, error: secError } = await supabase
    .from("sms_src_sections")
    .select("section_key, narrative, payload")
    .eq("submission_id", header.id);
  if (secError) throw secError;

  const bySection = new Map<
    SrcSectionKey,
    { narrative: string | null; payload: unknown }
  >();
  for (const row of sectionRows ?? []) {
    bySection.set(row.section_key as SrcSectionKey, {
      narrative: row.narrative,
      payload: row.payload,
    });
  }

  function payloadFor<K extends SrcSectionKey>(
    key: K,
  ): SrcSectionPayloadMap[K] | null {
    const entry = bySection.get(key);
    return entry ? (entry.payload as SrcSectionPayloadMap[K]) : null;
  }

  function narrativeFor(key: SrcSectionKey): string | null {
    return bySection.get(key)?.narrative ?? null;
  }

  // --- I. Enrollment ---------------------------------------------------
  // Stored normalized (one row per SY/grade/semester). Printed as a flat
  // table rather than the template's semester-pivoted grid: the same figures,
  // and it holds up for both elementary (semester NULL) and SHS schools.
  const enrollment = payloadFor("enrollment");
  let enrollmentBody = "";
  let enrollTotalM = 0;
  let enrollTotalF = 0;
  for (const r of enrollment?.rows ?? []) {
    enrollTotalM += Number(r.male) || 0;
    enrollTotalF += Number(r.female) || 0;
    enrollmentBody += `
      <tr>
        <td>${text(r.school_year)}</td>
        <td>${escapeHtml(getGradeLevelLabel(Number(r.grade_level)))}</td>
        <td class="c">${r.semester ? num(r.semester) : DASH}</td>
        <td class="c">${num(r.male)}</td>
        <td class="c">${num(r.female)}</td>
        <td class="c b">${num((Number(r.male) || 0) + (Number(r.female) || 0))}</td>
      </tr>`;
  }
  if (enrollmentBody) {
    enrollmentBody += `
      <tr class="total">
        <td colspan="3" class="b">Total</td>
        <td class="c b">${enrollTotalM}</td>
        <td class="c b">${enrollTotalF}</td>
        <td class="c b">${enrollTotalM + enrollTotalF}</td>
      </tr>`;
  }
  const enrollmentHtml = tableOrEmpty(
    `<tr>
      <th>School Year</th><th>Grade Level</th><th>Sem</th>
      <th>Male</th><th>Female</th><th>Total</th>
    </tr>`,
    enrollmentBody,
    "Enrollment by Grade Level and Sex",
  );

  // --- II. Health and Nutritional Status -------------------------------
  // Pivoted to the DepEd band columns, which are a fixed known set.
  const health = payloadFor("health");
  const buildHealthTable = (
    bandType: "bmi" | "hfa",
    bands: { value: string; label: string }[],
    caption: string,
  ): string => {
    const rows = (health?.rows ?? []).filter((r) => r.band_type === bandType);
    if (rows.length === 0) return "";

    const grid = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const key = `${r.grade_level}|${r.sex}`;
      if (!grid.has(key)) grid.set(key, new Map());
      const cell = grid.get(key)!;
      cell.set(r.band, (cell.get(r.band) ?? 0) + (Number(r.count) || 0));
    }

    const sorted = [...grid.keys()].sort((a, b) => {
      const [ga, sa] = a.split("|");
      const [gb, sb] = b.split("|");
      return Number(ga) - Number(gb) || sa.localeCompare(sb);
    });

    const totals = new Map<string, number>();
    let body = "";
    for (const key of sorted) {
      const [grade, sex] = key.split("|");
      const cell = grid.get(key)!;
      body += `
        <tr>
          <td>${escapeHtml(getGradeLevelLabel(Number(grade)))}</td>
          <td>${sex === "male" ? "Male" : "Female"}</td>
          ${bands
            .map((b) => {
              const v = cell.get(b.value) ?? 0;
              totals.set(b.value, (totals.get(b.value) ?? 0) + v);
              return `<td class="c">${v}</td>`;
            })
            .join("")}
        </tr>`;
    }
    body += `
      <tr class="total">
        <td colspan="2" class="b">Total</td>
        ${bands.map((b) => `<td class="c b">${totals.get(b.value) ?? 0}</td>`).join("")}
      </tr>`;

    return tableOrEmpty(
      `<tr>
        <th>Grade Level</th><th>Sex</th>
        ${bands.map((b) => `<th>${escapeHtml(b.label)}</th>`).join("")}
      </tr>`,
      body,
      caption,
    );
  };

  const healthHtml =
    buildHealthTable("bmi", SRC_BMI_BANDS, "Nutritional Status — Body Mass Index (BMI)") +
      buildHealthTable("hfa", SRC_HFA_BANDS, "Nutritional Status — Height for Age") ||
    `<p class="empty">No data reported for this section.</p>`;

  // --- III. Learners' Materials ----------------------------------------
  const materials = payloadFor("materials");
  const materialsHtml = tableOrEmpty(
    `<tr><th>Grade Level</th><th>Subject</th><th>Printed SLMs Received</th></tr>`,
    (materials?.rows ?? [])
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(getGradeLevelLabel(Number(r.grade_level)))}</td>
        <td>${text(r.subject)}</td>
        <td class="c">${num(r.copies_received)}</td>
      </tr>`,
      )
      .join(""),
    "Printed Self-Learning Materials from DepEd Central and Regional Office",
  );

  // --- IV. Teachers' Professional Development --------------------------
  const pd = payloadFor("professional_development");
  const pdHtml = tableOrEmpty(
    `<tr><th>Professional Development</th><th>Frequency</th></tr>`,
    (pd?.rows ?? [])
      .map(
        (r) => `
      <tr><td>${text(r.activity)}</td><td class="c">${num(r.frequency)}</td></tr>`,
      )
      .join(""),
  );

  // --- V. Funding Sources ----------------------------------------------
  const funding = payloadFor("funding");
  let partnersBody = "";
  let partnersTotalCount = 0;
  let partnersTotalAmount = 0;
  for (const r of funding?.partners ?? []) {
    partnersTotalCount += Number(r.partners_count) || 0;
    partnersTotalAmount += Number(r.resources_generated) || 0;
    partnersBody += `
      <tr>
        <td class="c">${num(r.fiscal_year)}</td>
        <td class="c">${num(r.partners_count)}</td>
        <td class="r">${escapeHtml(formatPhp(r.resources_generated))}</td>
      </tr>`;
  }
  if (partnersBody) {
    partnersBody += `
      <tr class="total">
        <td class="b">Total</td>
        <td class="c b">${partnersTotalCount}</td>
        <td class="r b">${escapeHtml(formatPhp(partnersTotalAmount))}</td>
      </tr>`;
  }

  let contribBody = "";
  let contribTotalAmount = 0;
  let contribTotalVolunteers = 0;
  for (const r of funding?.contributions ?? []) {
    contribTotalAmount += Number(r.amount) || 0;
    contribTotalVolunteers += Number(r.volunteers) || 0;
    contribBody += `
      <tr>
        <td>${text(r.activity)}</td>
        <td class="r">${escapeHtml(formatPhp(r.amount))}</td>
        <td class="c">${num(r.volunteers)}</td>
      </tr>`;
  }
  if (contribBody) {
    contribBody += `
      <tr class="total">
        <td class="b">Total</td>
        <td class="r b">${escapeHtml(formatPhp(contribTotalAmount))}</td>
        <td class="c b">${contribTotalVolunteers}</td>
      </tr>`;
  }

  const fundingHtml = `
    ${tableOrEmpty(
      `<tr><th>Fiscal Year</th><th>Number of Partners</th><th>Resources Generated</th></tr>`,
      partnersBody,
      "Resources Generated from Partners and Stakeholders",
    )}
    ${tableOrEmpty(
      `<tr><th>Activities</th><th>Contributions</th><th>Number of Volunteers</th></tr>`,
      contribBody,
      "Stakeholders' Contributions",
    )}
    ${
      header.mooe_amount != null
        ? `<p class="narrative">School MOOE: ${escapeHtml(formatPhp(header.mooe_amount))}</p>`
        : ""
    }`;

  // --- VI. School Awards and Recognitions ------------------------------
  const awards = payloadFor("awards");
  const awardsHtml = tableOrEmpty(
    `<tr>
      <th>Title of Award</th><th>Award Giving Body</th>
      <th>Level</th><th>Category of Awardee</th><th>Awardee</th>
    </tr>`,
    (awards?.rows ?? [])
      .map(
        (r) => `
      <tr>
        <td>${text(r.title)}</td>
        <td>${text(r.giving_body)}</td>
        <td>${escapeHtml(labelFor(SRC_AWARD_LEVELS, r.level))}</td>
        <td>${escapeHtml(labelFor(SRC_AWARD_CATEGORIES, r.category))}</td>
        <td>${text(r.awardee)}</td>
      </tr>`,
      )
      .join(""),
  );

  // --- VII. Dropouts ----------------------------------------------------
  const dropouts = payloadFor("dropouts");
  const dropoutRateHtml = tableOrEmpty(
    `<tr><th>School Year</th><th>Frequency of Dropouts</th><th>Percentage</th></tr>`,
    (dropouts?.rows ?? [])
      .map(
        (r) => `
      <tr>
        <td>${text(r.school_year)}</td>
        <td class="c">${num(r.frequency)}</td>
        <td class="c">${r.percentage == null ? DASH : `${num(r.percentage, 2)}%`}</td>
      </tr>`,
      )
      .join(""),
  );
  const dropoutCauseHtml =
    (dropouts?.causes ?? []).length > 0
      ? tableOrEmpty(
          `<tr><th>Cause</th><th>Count</th></tr>`,
          (dropouts?.causes ?? [])
            .map(
              (r) =>
                `<tr><td>${text(r.cause)}</td><td class="c">${num(r.count)}</td></tr>`,
            )
            .join(""),
          "Dropouts by Cause",
        )
      : "";

  // --- VIII. Promotion / Graduation Rate --------------------------------
  const promotion = payloadFor("promotion");
  const promotionHtml = tableOrEmpty(
    `<tr><th>School Year</th><th>Promotees / Graduates</th><th>Percentage</th></tr>`,
    (promotion?.rows ?? [])
      .map(
        (r) => `
      <tr>
        <td>${text(r.school_year)}</td>
        <td class="c">${num(r.frequency)}</td>
        <td class="c">${r.percentage == null ? DASH : `${num(r.percentage, 2)}%`}</td>
      </tr>`,
      )
      .join(""),
  );

  // --- IX. Academic Performance Per Learning Area -----------------------
  const performance = payloadFor("academic_performance");
  const performanceHtml = tableOrEmpty(
    `<tr><th>Grade Level</th><th>Sem</th><th>Subject</th><th>General Average</th></tr>`,
    (performance?.rows ?? [])
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(getGradeLevelLabel(Number(r.grade_level)))}</td>
        <td class="c">${r.semester ? num(r.semester) : DASH}</td>
        <td>${text(r.subject)}</td>
        <td class="c b">${num(r.general_average, 2)}</td>
      </tr>`,
      )
      .join(""),
    "Subjects Offered",
  );

  // --- X. SBM ------------------------------------------------------------
  const sbmBand = getSbmBand(header.sbm_rating);
  const sbmHtml =
    header.sbm_rating != null
      ? tableOrEmpty(
          `<tr><th>Numerical Rating</th><th>SBM Level</th><th>Description</th></tr>`,
          `<tr>
            <td class="c">${num(header.sbm_rating, 2)}</td>
            <td class="c">${sbmBand ? escapeHtml(sbmBand.level) : DASH}</td>
            <td class="c">${sbmBand ? escapeHtml(sbmBand.description) : DASH}</td>
          </tr>`,
        )
      : `<p class="empty">No data reported for this section.</p>`;

  // --- XI. CFSS ----------------------------------------------------------
  const cfssHtml =
    header.cfss_points != null
      ? tableOrEmpty(
          `<tr><th>CFSS Points</th><th>Qualitative Interpretation</th></tr>`,
          `<tr>
            <td class="c">${num(header.cfss_points)}</td>
            <td class="c">${text(header.cfss_interpretation)}</td>
          </tr>`,
        )
      : `<p class="empty">No data reported for this section.</p>`;

  // --- XII. Stakeholders' Participation ----------------------------------
  const participation = payloadFor("stakeholder_participation");
  const participationHtml = tableOrEmpty(
    `<tr><th>Activities</th><th>Percentage</th></tr>`,
    (participation?.rows ?? [])
      .map(
        (r) => `
      <tr>
        <td>${text(r.activity)}</td>
        <td class="c">${r.percentage == null ? DASH : `${num(r.percentage, 2)}%`}</td>
      </tr>`,
      )
      .join(""),
  );

  // --- XIII–XVI. Ratios --------------------------------------------------
  const ratioTable = (key: SrcSectionKey, unitLabel: string): string => {
    const payload = payloadFor(key) as
      | SrcSectionPayloadMap["learner_teacher"]
      | null;
    return tableOrEmpty(
      `<tr><th>Grade Level</th><th>Learners</th><th>${escapeHtml(unitLabel)}</th><th>Ratio</th></tr>`,
      (payload?.rows ?? [])
        .map((r) => {
          const ratio = formatSrcRatio(r.learners, r.units);
          return `
        <tr>
          <td>${
            r.grade_level === null || r.grade_level === undefined
              ? "All Grades"
              : escapeHtml(getGradeLevelLabel(Number(r.grade_level)))
          }</td>
          <td class="c">${num(r.learners)}</td>
          <td class="c">${num(r.units)}</td>
          <td class="c b">${ratio ? escapeHtml(ratio) : DASH}</td>
        </tr>`;
        })
        .join(""),
    );
  };

  const signatories = Array.isArray(header.signatories)
    ? (header.signatories as SrcSignatory[])
    : [];
  const signatoryCells = signatories
    .filter((s) => (s.name ?? "").trim())
    .map(
      (s) => `
      <td class="sig-cell">
        <div class="sig-line"></div>
        <div class="sig-name">${escapeHtml(s.name)}</div>
        <div class="sig-title">${text(s.title)}</div>
      </td>`,
    );

  let signatoryRows = "";
  for (let i = 0; i < signatoryCells.length; i += 2) {
    const pair = signatoryCells.slice(i, i + 2);
    if (pair.length === 1) pair.push("<td></td>");
    signatoryRows += `<tr>${pair.join("")}</tr>`;
  }

  const schoolName = school.name || DASH;
  const addressLine = [school.address, school.municipality_city]
    .filter(Boolean)
    .join(", ");
  const preparedBy = signatories.find((s) => s.role === "school_head");

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>School Report Card - ${escapeHtml(schoolYear)}</title>
  <style>
    @page { size: 8.5in 13in; margin: 0.5in; }
    body { font-family: "Times New Roman", serif; font-size: 11pt; color: #000; }
    .school-info { font-size: 9pt; margin-top: 4px; }
    .doc-title { text-align: center; margin: 24px 0 32px; }
    .doc-title h1 { font-size: 22pt; margin: 0; letter-spacing: 1px; }
    .doc-title .sy { font-size: 13pt; margin-top: 6px; }
    .section-title { font-size: 11pt; margin: 18px 0 8px; }
    .src-table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 4px; }
    .src-table th, .src-table td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
    .src-table th { background: #f2f2f2; text-align: center; font-weight: bold; }
    .c { text-align: center; }
    .r { text-align: right; }
    .b { font-weight: bold; }
    .total td { background: #fafafa; }
    .caption { text-align: center; font-size: 8.5pt; font-style: italic; margin-bottom: 12px; }
    .narrative { font-size: 10pt; text-align: justify; text-indent: 32px; margin: 8px 0 14px; }
    .empty { font-size: 9pt; font-style: italic; color: #555; margin-bottom: 12px; }
    .group-title { font-size: 12pt; font-weight: bold; margin: 22px 0 4px; letter-spacing: 1px; }
    .sig-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 10pt; }
    .sig-cell { border: 1px solid #000; padding: 22px 8px 8px; width: 50%; }
    .sig-line { border-bottom: 1px solid #000; margin-bottom: 4px; }
    .sig-name { font-weight: bold; }
    .sig-title { font-size: 9pt; }
    .page-break { page-break-before: always; }
    ${DEPED_HEADER_LOGOS_STYLES}
  </style>
</head>
<body>
  ${buildDepEdHeaderWithLogos(`
    <div>Republic of the Philippines</div>
    <div style="font-weight:bold">Department of Education</div>
    ${school.region ? `<div class="school-info">${escapeHtml(school.region)}</div>` : ""}
    ${school.district ? `<div class="school-info">${escapeHtml(school.district)}</div>` : ""}
    <div style="font-weight:bold; margin-top:6px">${escapeHtml(schoolName)}</div>
    ${addressLine ? `<div class="school-info">${escapeHtml(addressLine)}</div>` : ""}
    <div class="school-info">School ID: ${escapeHtml(school.school_id || DASH)}</div>
  `)}

  <div class="doc-title">
    <h1>SCHOOL REPORT CARD</h1>
    <div class="sy">S.Y. ${escapeHtml(schoolYear)}</div>
  </div>

  ${sectionHeading("enrollment")}
  ${enrollmentHtml}
  ${narrativeBlock(narrativeFor("enrollment"))}

  ${sectionHeading("health")}
  ${healthHtml}
  ${narrativeBlock(narrativeFor("health"))}

  ${sectionHeading("materials")}
  ${materialsHtml}
  ${narrativeBlock(narrativeFor("materials"))}

  ${sectionHeading("professional_development")}
  ${pdHtml}
  ${narrativeBlock(narrativeFor("professional_development"))}

  ${sectionHeading("funding")}
  ${fundingHtml}
  ${narrativeBlock(narrativeFor("funding"))}

  ${sectionHeading("awards")}
  ${awardsHtml}
  ${narrativeBlock(narrativeFor("awards"))}

  <div class="page-break"></div>
  <div class="doc-title"><h1>PERFORMANCE INDICATORS</h1></div>

  <div class="group-title">ACCESS</div>
  ${sectionHeading("dropouts")}
  ${dropoutRateHtml}
  ${dropoutCauseHtml}
  ${narrativeBlock(narrativeFor("dropouts"))}

  <div class="group-title">QUALITY</div>
  ${sectionHeading("promotion")}
  ${promotionHtml}
  ${narrativeBlock(narrativeFor("promotion"))}

  ${sectionHeading("academic_performance")}
  ${performanceHtml}
  ${narrativeBlock(narrativeFor("academic_performance"))}

  <div class="group-title">GOVERNANCE</div>
  ${sectionHeading("sbm")}
  ${sbmHtml}
  ${narrativeBlock(narrativeFor("sbm"))}

  ${sectionHeading("cfss")}
  ${cfssHtml}
  ${narrativeBlock(narrativeFor("cfss"))}

  ${sectionHeading("stakeholder_participation")}
  ${participationHtml}
  ${narrativeBlock(narrativeFor("stakeholder_participation"))}

  ${sectionHeading("learner_teacher")}
  ${ratioTable("learner_teacher", "Teachers")}
  ${narrativeBlock(narrativeFor("learner_teacher"))}

  ${sectionHeading("learner_classroom")}
  ${ratioTable("learner_classroom", "Classrooms")}
  ${narrativeBlock(narrativeFor("learner_classroom"))}

  ${sectionHeading("learner_toilet")}
  ${ratioTable("learner_toilet", "Toilets")}
  ${narrativeBlock(narrativeFor("learner_toilet"))}

  ${sectionHeading("learner_seat")}
  ${ratioTable("learner_seat", "Seats")}
  ${narrativeBlock(narrativeFor("learner_seat"))}

  <div class="page-break"></div>
  <p>Prepared by:</p>
  <p style="margin-top:28px">
    <span class="sig-name">${text(preparedBy?.name ?? school.principal_name)}</span><br/>
    <span class="sig-title">${text(preparedBy?.title ?? "School Head")}</span>
  </p>

  <p style="margin-top:24px">Certified Accurate:</p>
  ${
    signatoryRows
      ? `<table class="sig-table">${signatoryRows}</table>`
      : `<p class="empty">No signatories recorded.</p>`
  }
</body>
</html>`;

  printHTMLContent(htmlContent);
}
