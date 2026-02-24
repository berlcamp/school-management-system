import { buildDepEdHeaderWithLogos, DEPED_HEADER_LOGOS_STYLES, printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface Sf8Params {
  schoolId: string;
  sectionId: string;
  schoolYear: string;
}

const NUTRITIONAL_LABELS: Record<string, string> = {
  underweight: "Underweight",
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
    .select("id, name, grade_level")
    .eq("id", sectionId)
    .single();

  if (sectionError || !section) {
    throw new Error("Section not found");
  }

  const { data: enrollments } = await supabase
    .from("sms_enrollments")
    .select("student_id")
    .eq("section_id", sectionId)
    .eq("school_year", schoolYear)
    .eq("status", "approved");

  const studentIds = [...new Set((enrollments || []).map((e) => e.student_id))];
  if (studentIds.length === 0) {
    throw new Error("No enrolled learners in this section for the selected school year");
  }

  const { data: students } = await supabase
    .from("sms_students")
    .select("id, lrn, first_name, middle_name, last_name, suffix, date_of_birth")
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
  const healthMap = new Map<string, HealthRec>();
  (healthRecords || []).forEach((h: HealthRec) => {
    healthMap.set(String(h.student_id), h);
  });

  const schoolName = school.name || "—";
  const schoolIdDisplay = school.school_id || "—";
  const district = school.district || "";
  const region = school.region || "";
  const address = school.address || "";
  const sectionName = section.name || "—";
  const gradeLabel =
    section.grade_level === 0
      ? "Kindergarten"
      : `Grade ${section.grade_level ?? ""}`;

  let rows = "";
  (students || []).forEach((st, idx) => {
    const health = healthMap.get(String(st.id));
    const heightCm = health?.height_cm != null ? Number(health.height_cm) : null;
    const weightKg = health?.weight_kg != null ? Number(health.weight_kg) : null;
    const heightM =
      heightCm != null && heightCm > 0 ? heightCm / 100 : null;
    const heightSq = heightM != null ? heightM * heightM : null;
    const bmi =
      weightKg != null &&
      heightM != null &&
      heightM > 0
        ? (weightKg / (heightM * heightM)).toFixed(2)
        : "—";
    const birthdate = st.date_of_birth
      ? new Date(st.date_of_birth).toLocaleDateString("en-CA")
      : "—";
    const age = st.date_of_birth
      ? computeAgeAtCutoff(st.date_of_birth, schoolYear)
      : "—";
    const weightStr = weightKg != null ? String(weightKg) : "—";
    const heightMStr =
      heightM != null ? heightM.toFixed(2) : "—";
    const heightSqStr =
      heightSq != null ? heightSq.toFixed(4) : "—";
    const nutritionalStr = health?.nutritional_status
      ? NUTRITIONAL_LABELS[health.nutritional_status] || health.nutritional_status
      : "—";
    const hfaStr = health?.height_for_age
      ? HFA_LABELS[health.height_for_age] || health.height_for_age
      : "—";
    const remarks = health?.remarks?.trim() || "—";
    const name = formatName(
      st.last_name || "",
      st.first_name || "",
      st.middle_name ?? null,
      st.suffix ?? null
    );

    rows += `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td class="font-mono text-xs">${st.lrn || "—"}</td>
        <td>${name}</td>
        <td class="text-center">${birthdate}</td>
        <td class="text-center">${age}</td>
        <td class="text-center">${weightStr}</td>
        <td class="text-center">${heightMStr}</td>
        <td class="text-center">${heightSqStr}</td>
        <td class="text-center">${bmi}</td>
        <td class="text-center">${nutritionalStr}</td>
        <td class="text-center">${hfaStr}</td>
        <td>${remarks}</td>
      </tr>`;
  });

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
    .form-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .form-table th, .form-table td { border: 1px solid #000; padding: 4px; }
    .text-center { text-align: center; }
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
        <th style="width:30px">No.</th>
        <th style="width:100px">LRN</th>
        <th style="width:150px">Name of Learner<br/>(Last, First, Ext, Middle)</th>
        <th style="width:70px">Birthdate</th>
        <th style="width:35px">Age</th>
        <th style="width:60px">Weight<br/>(kg)</th>
        <th style="width:55px">Height<br/>(m)</th>
        <th style="width:55px">Height²<br/>(m²)</th>
        <th style="width:45px">BMI</th>
        <th style="width:70px">Nutritional<br/>Status</th>
        <th style="width:70px">Height for<br/>Age</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  printHTMLContent(htmlContent);
}
