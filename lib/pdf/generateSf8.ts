import {
  bodyMassIndex,
  measurementProblem,
  MEASUREMENT_PERIOD_OPTIONS,
  type HealthMeasurementPeriod,
} from "@/lib/utils/nutritionalStatus";
import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
  escapeHtml,
  printHTMLContent,
} from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";
import { ENROLLED_LIFECYCLE_STATUSES } from "@/lib/constants/enrollment";
import { groupLearnersBySex } from "@/lib/utils/learnerSex";

export interface Sf8Params {
  schoolId: string;
  sectionId: string;
  schoolYear: string;
}

const NUTRITIONAL_LABELS: Record<string, string> = {
  severely_wasted: "Severely Wasted",
  wasted: "Wasted",
  normal: "Normal",
  overweight: "Overweight",
  obese: "Obese",
};

const HFA_LABELS: Record<string, string> = {
  severely_stunted: "Severely Stunted",
  stunted: "Stunted",
  normal: "Normal",
  tall: "Tall",
};

function computeAgeAtCutoff(birthdate: string, schoolYear: string): number {
  const [startStr] = schoolYear.split("-");
  const cutoffYear = parseInt(startStr, 10);
  const cutoffDate = new Date(cutoffYear, 9, 31); // Oct 31
  const birth = new Date(birthdate);
  let age = cutoffDate.getFullYear() - birth.getFullYear();
  const m =
    cutoffDate.getMonth() * 100 +
    cutoffDate.getDate() -
    (birth.getMonth() * 100 + birth.getDate());
  if (m < 0) age -= 1;
  return Math.max(0, age);
}

function formatName(
  last: string,
  first: string,
  middle: string | null,
  suffix: string | null
): string {
  const parts = [last, first];
  if (suffix?.trim()) parts.push(suffix.trim());
  if (middle?.trim()) parts.push(middle.trim());
  return parts.join(", ");
}

/** SF8 - Learner Basic Health and Nutrition Report */
export async function generateSf8Print(params: Sf8Params): Promise<void> {
  const { schoolId, sectionId, schoolYear } = params;

  const { data: school, error: schoolError } = await supabase
    .from("sms_schools")
    .select("id, school_id, name, address, district, region")
    .eq("id", schoolId)
    .single();

  if (schoolError || !school) {
    throw new Error("School not found");
  }

  const { data: section, error: sectionError } = await supabase
    .from("sms_sections")
    .select("id, name, grade_level, section_adviser_id")
    .eq("id", sectionId)
    .single();

  if (sectionError || !section) {
    throw new Error("Section not found");
  }

  // `status` is the approval workflow; `enrollment_status` is the lifecycle.
  // SF8 is the nutritional status of the learners in the section — a measuring
  // sheet, not a register — so a learner already released to another school or
  // dropped is off it. SF1 and SF2, which ARE registers, keep them and
  // annotate instead.
  const { data: enrollments } = await supabase
    .from("sms_enrollments")
    .select("student_id")
    .eq("section_id", sectionId)
    .eq("school_year", schoolYear)
    .eq("status", "approved")
    .in("enrollment_status", ENROLLED_LIFECYCLE_STATUSES);

  const studentIds = [...new Set((enrollments || []).map((e) => e.student_id))];
  if (studentIds.length === 0) {
    throw new Error("No enrolled learners in this section for the selected school year");
  }

  const { data: students } = await supabase
    .from("sms_students")
    .select(
      "id, lrn, first_name, middle_name, last_name, suffix, date_of_birth, gender"
    )
    .in("id", studentIds)
    .order("last_name")
    .order("first_name");

  const { data: healthRecords } = await supabase
    .from("sms_learner_health")
    .select("*")
    .eq("section_id", sectionId)
    .eq("school_year", schoolYear)
    .in("student_id", studentIds);

  type HealthRec = NonNullable<typeof healthRecords>[number];
  // Keyed by period as well as learner: the form carries both of the school
  // year's readings side by side. A record whose period the database does not
  // name is a baseline — every row predating migration 188 is one.
  const healthMap = new Map<string, HealthRec>();
  (healthRecords || []).forEach((h: HealthRec) => {
    const period: HealthMeasurementPeriod =
      h.measurement_period === "endline" ? "endline" : "baseline";
    healthMap.set(`${period}:${h.student_id}`, h);
  });

  // Signatories. SF8 is signed on paper by the adviser who took the
  // measurements and certified by the school head; the sheet had no signature
  // lines at all before this.
  const adviserName = section.section_adviser_id
    ? (
        await supabase
          .from("sms_users")
          .select("name")
          .eq("id", section.section_adviser_id)
          .single()
      ).data?.name ?? ""
    : "";

  // sms_school_settings.school_id is TEXT while sms_schools.id is BIGINT
  // (invariant 11), hence the String() rather than a bare id.
  const { data: settings } = await supabase
    .from("sms_school_settings")
    .select("principal_name, principal_title")
    .eq("school_id", String(schoolId))
    .maybeSingle();
  const principalName = settings?.principal_name || "";
  const principalTitle = settings?.principal_title || "Principal";

  const schoolName = school.name || "—";
  const schoolIdDisplay = school.school_id || "—";
  const district = school.district || "";
  const region = school.region || "";
  const address = school.address || "";
  const sectionName = section.name || "—";
  const gradeLabel =
    section.grade_level === -1
      ? "SNED"
      : section.grade_level === 0
        ? "Kindergarten"
        : `Grade ${section.grade_level ?? ""}`;

  /** One learner's figures for one reading, formatted for the sheet. */
  interface Reading {
    weight: string;
    height: string;
    bmi: string;
    nutritional: string;
    hfa: string;
    /** The stored bands, kept raw so the summary can count them. */
    nutritionalBand: string | null;
    hfaBand: string | null;
    remarks: string;
  }

  const EMPTY_READING: Reading = {
    weight: "—",
    height: "—",
    bmi: "—",
    nutritional: "—",
    hfa: "—",
    nutritionalBand: null,
    hfaBand: null,
    remarks: "",
  };

  const readingFor = (
    studentId: string,
    period: HealthMeasurementPeriod
  ): Reading => {
    const health = healthMap.get(`${period}:${studentId}`);
    if (!health) return EMPTY_READING;

    const heightCm = health.height_cm != null ? Number(health.height_cm) : null;
    const weightKg = health.weight_kg != null ? Number(health.weight_kg) : null;
    const heightM = heightCm != null && heightCm > 0 ? heightCm / 100 : null;
    // One formula, shared with the entry screen — this had its own copy, at a
    // different number of decimals. A measurement that cannot be one prints no
    // BMI at all: a quarter of the heights on file are in metres, and dividing
    // by one gives a BMI in the hundreds of thousands, which is not a figure to
    // print on a DepEd form. The stored height and weight still print verbatim
    // beside it, so the entry that needs fixing is visible on the sheet.
    const bmiValue = measurementProblem(heightCm, weightKg)
      ? null
      : bodyMassIndex(heightCm, weightKg);

    return {
      weight: weightKg != null ? String(weightKg) : "—",
      height: heightM != null ? heightM.toFixed(2) : "—",
      bmi: bmiValue === null ? "—" : bmiValue.toFixed(2),
      nutritional: health.nutritional_status
        ? NUTRITIONAL_LABELS[health.nutritional_status] ||
          health.nutritional_status
        : "—",
      hfa: health.height_for_age
        ? HFA_LABELS[health.height_for_age] || health.height_for_age
        : "—",
      nutritionalBand: health.nutritional_status ?? null,
      hfaBand: health.height_for_age ?? null,
      remarks: health.remarks?.trim() || "",
    };
  };

  // The summary under the roster: how many learners fall in each band, by sex,
  // for each reading. This is the figure the feeding programme and the division
  // ask for, and it is the one thing a single reading could never give — which
  // is why the sheet is measured twice.
  type BandCounts = Record<string, { male: number; female: number }>;
  const bandTally: Record<HealthMeasurementPeriod, { bmi: BandCounts; hfa: BandCounts }> = {
    baseline: { bmi: {}, hfa: {} },
    endline: { bmi: {}, hfa: {} },
  };

  const tally = (
    counts: BandCounts,
    band: string | null,
    gender: string | null | undefined
  ) => {
    if (!band) return;
    counts[band] ??= { male: 0, female: 0 };
    // Anything not recorded as female is counted as male, matching how the rest
    // of the DepEd forms here split a roster that has only the two columns.
    if (String(gender ?? "").toLowerCase().startsWith("f")) {
      counts[band].female += 1;
    } else {
      counts[band].male += 1;
    }
  };

  // The roster lists males first, then females, each block headed with its
  // count and numbered from 1 (the DepEd class-list convention SF1/SF2 use).
  type Sf8Student = NonNullable<typeof students>[number];
  let rows = "";
  const renderLearner = (st: Sf8Student, idx: number) => {
    const baseline = readingFor(String(st.id), "baseline");
    const endline = readingFor(String(st.id), "endline");

    tally(bandTally.baseline.bmi, baseline.nutritionalBand, st.gender);
    tally(bandTally.baseline.hfa, baseline.hfaBand, st.gender);
    tally(bandTally.endline.bmi, endline.nutritionalBand, st.gender);
    tally(bandTally.endline.hfa, endline.hfaBand, st.gender);

    const birthdate = st.date_of_birth
      ? new Date(st.date_of_birth).toLocaleDateString("en-CA")
      : "—";
    const age = st.date_of_birth
      ? computeAgeAtCutoff(st.date_of_birth, schoolYear)
      : "—";
    const name = formatName(
      st.last_name || "",
      st.first_name || "",
      st.middle_name ?? null,
      st.suffix ?? null
    );

    // One Remarks column on the form, two readings that can each carry one.
    // Both are printed, labelled, rather than the later one silently winning.
    const remarkParts = [
      baseline.remarks ? `BoSY: ${baseline.remarks}` : "",
      endline.remarks ? `EoSY: ${endline.remarks}` : "",
    ].filter(Boolean);
    const remarks =
      remarkParts.length === 0
        ? "—"
        : remarkParts.length === 1 && !endline.remarks
          ? baseline.remarks
          : remarkParts.join(" · ");

    rows += `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td class="font-mono text-xs">${st.lrn || "—"}</td>
        <td>${name}</td>
        <td class="text-center">${birthdate}</td>
        <td class="text-center">${age}</td>
        <td class="text-center period-start">${baseline.weight}</td>
        <td class="text-center">${baseline.height}</td>
        <td class="text-center">${baseline.bmi}</td>
        <td class="text-center">${baseline.nutritional}</td>
        <td class="text-center">${baseline.hfa}</td>
        <td class="text-center period-start">${endline.weight}</td>
        <td class="text-center">${endline.height}</td>
        <td class="text-center">${endline.bmi}</td>
        <td class="text-center">${endline.nutritional}</td>
        <td class="text-center">${endline.hfa}</td>
        <td>${remarks}</td>
      </tr>`;
  };
  for (const group of groupLearnersBySex(students || [], (st) => st.gender)) {
    rows += `
      <tr class="sex-group"><td colspan="16">${group.label} (${group.rows.length})</td></tr>`;
    group.rows.forEach((st, idx) => renderLearner(st, idx));
  }

  /**
   * A summary table for one measure. Bands print in the order DepEd lists them
   * — severely wasted first — and a band nobody falls into still prints its
   * row, as a zero: a summary that silently omits "Severely Wasted" reads as if
   * the question was never asked.
   */
  const buildSummary = (
    title: string,
    labels: Record<string, string>,
    pick: (t: { bmi: BandCounts; hfa: BandCounts }) => BandCounts
  ): string => {
    const bands = Object.keys(labels);
    const body = bands
      .map((band) => {
        const cells = MEASUREMENT_PERIOD_OPTIONS.map(({ value }) => {
          const c = pick(bandTally[value])[band] ?? { male: 0, female: 0 };
          return `
        <td class="text-center period-start">${c.male}</td>
        <td class="text-center">${c.female}</td>
        <td class="text-center bold">${c.male + c.female}</td>`;
        }).join("");
        return `      <tr><td>${labels[band]}</td>${cells}</tr>`;
      })
      .join("\n");

    const totals = MEASUREMENT_PERIOD_OPTIONS.map(({ value }) => {
      const counts = pick(bandTally[value]);
      const male = Object.values(counts).reduce((n, c) => n + c.male, 0);
      const female = Object.values(counts).reduce((n, c) => n + c.female, 0);
      return `
        <td class="text-center period-start">${male}</td>
        <td class="text-center">${female}</td>
        <td class="text-center bold">${male + female}</td>`;
    }).join("");

    return `
  <div class="summary">
    <div class="summary-title">${title}</div>
    <table class="form-table">
      <thead>
        <tr>
          <th rowspan="2" style="width:150px">Band</th>
          ${MEASUREMENT_PERIOD_OPTIONS.map(
            (o) =>
              `<th colspan="3" class="text-center period-start">${o.shortLabel}</th>`
          ).join("")}
        </tr>
        <tr>
          ${MEASUREMENT_PERIOD_OPTIONS.map(
            () => `
          <th class="text-center period-start">M</th>
          <th class="text-center">F</th>
          <th class="text-center">Total</th>`
          ).join("")}
        </tr>
      </thead>
      <tbody>
${body}
        <tr class="bold"><td>Total Measured</td>${totals}</tr>
      </tbody>
    </table>
  </div>`;
  };

  const summaries =
    buildSummary(
      "Summary of Nutritional Status (BMI for Age)",
      NUTRITIONAL_LABELS,
      (t) => t.bmi
    ) +
    buildSummary(
      "Summary of Nutritional Status (Height for Age)",
      HFA_LABELS,
      (t) => t.hfa
    );

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SF8 - Learner Basic Health and Nutrition Report</title>
  <style>
    @page { size: 8.5in 13in; margin: 0.5in; }
    body { font-family: "Times New Roman", serif; font-size: 11pt; }
    .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; }
    .school-info { font-size: 9pt; margin-top: 4px; }
    /* Two readings put sixteen columns on the page, so the roster is set a
       point smaller than the rest of the sheet rather than spilling over. */
    .form-table { width: 100%; border-collapse: collapse; font-size: 8pt; }
    .form-table th, .form-table td { border: 1px solid #000; padding: 3px; }
    .text-center { text-align: center; }
    .bold { font-weight: bold; }
    .form-table tr.sex-group td { font-weight: bold; background-color: #f7f7f7; }
    /* The line that separates one reading from the other. */
    .period-start { border-left: 2px solid #000; }
    .summary { margin-top: 14px; page-break-inside: avoid; }
    .summary-title { font-size: 9pt; font-weight: bold; margin-bottom: 4px; }
    .summary .form-table { width: auto; min-width: 60%; }
    .signatories {
      margin-top: 26px;
      display: flex;
      justify-content: space-between;
      gap: 40px;
      page-break-inside: avoid;
    }
    .sign-block { font-size: 9pt; width: 45%; }
    .sign-name {
      margin-top: 22px;
      border-bottom: 1px solid #000;
      text-align: center;
      font-weight: bold;
      text-transform: uppercase;
      min-height: 14px;
    }
    .sign-role { text-align: center; font-size: 8pt; }
    ${DEPED_HEADER_LOGOS_STYLES}
  </style>
</head>
<body>
  ${buildDepEdHeaderWithLogos(`
    <div>Republic of the Philippines</div>
    <div style="font-weight:bold">Department of Education</div>
    <div style="font-weight:bold; margin-top:6px">${schoolName}</div>
    <div class="school-info">${address}${district ? ` • ${district}` : ""}${region ? ` • ${region}` : ""}</div>
    <div class="school-info">School ID: ${schoolIdDisplay}</div>
    <div style="font-size:10pt; margin-top:8px; font-weight:bold">SF8 - Learner Basic Health and Nutrition Report</div>
    <div style="font-size:10pt">${gradeLabel} - ${sectionName} | School Year ${schoolYear}</div>
  `)}
  <table class="form-table">
    <thead>
      <tr>
        <th rowspan="2" style="width:26px">No.</th>
        <th rowspan="2" style="width:88px">LRN</th>
        <th rowspan="2" style="width:140px">Name of Learner<br/>(Last, First, Ext, Middle)</th>
        <th rowspan="2" style="width:62px">Birthdate</th>
        <th rowspan="2" style="width:28px">Age</th>
        ${MEASUREMENT_PERIOD_OPTIONS.map(
          (o) =>
            `<th colspan="5" class="text-center period-start">${o.shortLabel}</th>`
        ).join("")}
        <th rowspan="2">Remarks</th>
      </tr>
      <tr>
        ${MEASUREMENT_PERIOD_OPTIONS.map(
          () => `
        <th class="text-center period-start" style="width:42px">Weight<br/>(kg)</th>
        <th class="text-center" style="width:42px">Height<br/>(m)</th>
        <th class="text-center" style="width:36px">BMI</th>
        <th class="text-center" style="width:62px">Nutritional<br/>Status</th>
        <th class="text-center" style="width:58px">Height for<br/>Age</th>`
        ).join("")}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${summaries}
  <div class="signatories">
    <div class="sign-block">
      <div>Prepared by:</div>
      <div class="sign-name">${escapeHtml(adviserName)}</div>
      <div class="sign-role">Adviser / Teacher</div>
    </div>
    <div class="sign-block">
      <div>Certified correct by:</div>
      <div class="sign-name">${escapeHtml(principalName)}</div>
      <div class="sign-role">${escapeHtml(principalTitle)}</div>
    </div>
  </div>
</body>
</html>`;

  printHTMLContent(htmlContent);
}
