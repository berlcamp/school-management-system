import { printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface Sf6Params {
  schoolId: string;
  schoolYear: string;
}

const PROMOTION_THRESHOLD = 75;

export async function generateSf6Print(params: Sf6Params): Promise<void> {
  try {
    const { schoolId, schoolYear } = params;

    const { data: school, error: schoolError } = await supabase
      .from("sms_schools")
      .select("id, school_id, name, address, district, region")
      .eq("id", schoolId)
      .single();

    if (schoolError || !school) {
      throw new Error("School not found");
    }

    const { data: sections } = await supabase
      .from("sms_sections")
      .select("id, name, grade_level")
      .eq("school_id", schoolId)
      .eq("school_year", schoolYear)
      .eq("is_active", true)
      .order("grade_level")
      .order("name");

    if (!sections || sections.length === 0) {
      throw new Error("No sections found for the selected school year");
    }

    const gradeLevels = Array.from(
      new Set(sections.map((s) => s.grade_level)),
    ).sort((a, b) => a - b);

    const summary: {
      gradeLevel: number;
      promoted: number;
      retained: number;
      total: number;
    }[] = [];

    for (const gl of gradeLevels) {
      const sectionIds = sections
        .filter((s) => s.grade_level === gl)
        .map((s) => s.id);

      const { data: enrollments } = await supabase
        .from("sms_enrollments")
        .select("student_id")
        .in("section_id", sectionIds)
        .eq("school_year", schoolYear)
        .eq("status", "approved");

      const studentIds = (enrollments || []).map((e) => e.student_id);
      let promotedCount = 0;
      let retainedCount = 0;

      if (studentIds.length > 0) {
        const { data: grades } = await supabase
          .from("sms_grades")
          .select("student_id, subject_id, grading_period, grade")
          .in("section_id", sectionIds)
          .eq("school_year", schoolYear);

        const gradesByStudent = new Map<string, number[]>();
        (grades || []).forEach((g) => {
          const key = `${g.student_id}-${g.subject_id}`;
          if (!gradesByStudent.has(key)) gradesByStudent.set(key, []);
          const arr = gradesByStudent.get(key)!;
          arr[g.grading_period - 1] = g.grade;
        });

        studentIds.forEach((studentId) => {
          const subjectKeys = Array.from(gradesByStudent.keys()).filter((k) =>
            k.startsWith(`${studentId}-`),
          );
          const subjectIds = new Set(subjectKeys.map((k) => k.split("-")[1]));
          const finals: number[] = [];
          subjectIds.forEach((subjId) => {
            const key = `${studentId}-${subjId}`;
            const qGrades = gradesByStudent.get(key) || [];
            const valid = qGrades.filter((v) => v != null && !Number.isNaN(v));
            if (valid.length >= 1) {
              finals.push(
                valid.reduce((a, b) => a + b, 0) / valid.length,
              );
            }
          });
          const overall =
            finals.length > 0
              ? finals.reduce((a, b) => a + b, 0) / finals.length
              : 0;
          if (overall >= PROMOTION_THRESHOLD) promotedCount++;
          else if (overall > 0) retainedCount++;
        });
      }

      summary.push({
        gradeLevel: gl,
        promoted: promotedCount,
        retained: retainedCount,
        total: promotedCount + retainedCount,
      });
    }

    const totalPromoted = summary.reduce((a, s) => a + s.promoted, 0);
    const totalRetained = summary.reduce((a, s) => a + s.retained, 0);

    let rows = "";
    summary.forEach((s) => {
      const gradeLabel = s.gradeLevel === 0 ? "Kindergarten" : `Grade ${s.gradeLevel}`;
      rows += `<tr>
        <td>${gradeLabel}</td>
        <td class="text-center">${s.promoted}</td>
        <td class="text-center">${s.retained}</td>
        <td class="text-center">${s.total}</td>
      </tr>`;
    });
    rows += `<tr class="total-row">
      <td><strong>TOTAL</strong></td>
      <td class="text-center"><strong>${totalPromoted}</strong></td>
      <td class="text-center"><strong>${totalRetained}</strong></td>
      <td class="text-center"><strong>${totalPromoted + totalRetained}</strong></td>
    </tr>`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SF6 - Summarized Report on Promotion</title>
  <style>
    @page { size: 8.5in 13in; margin: 0.5in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Times New Roman", serif; font-size: 11pt; color: #000; background: #fff; }
    .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .school-name { font-size: 14pt; font-weight: bold; text-transform: uppercase; }
    .school-address { font-size: 10pt; margin-top: 4px; }
    .form-title { font-size: 12pt; font-weight: bold; margin-top: 10px; text-transform: uppercase; }
    .form-subtitle { font-size: 10pt; margin-top: 4px; margin-bottom: 15px; }
    .form-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .form-table th, .form-table td { border: 1px solid #000; padding: 5px 8px; }
    .form-table th { background-color: #f0f0f0; font-weight: bold; }
    .total-row { background-color: #f8f8f8; }
    .text-center { text-align: center; }
    @media print { body { print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <div>Republic of the Philippines</div>
    <div class="school-name">Department of Education</div>
    <div class="school-name" style="margin-top:6px">${school.name}</div>
    <div class="school-address">${school.address || ""} ${school.district ? `• ${school.district}` : ""} ${school.region ? `• ${school.region}` : ""}</div>
    <div class="form-title" style="margin-top:12px">SF6 - Summarized Report on Promotion and Learning Progress</div>
    <div class="form-subtitle">School Year ${schoolYear}</div>
  </div>
  <table class="form-table">
    <thead>
      <tr>
        <th>Grade Level</th>
        <th class="text-center">Promoted</th>
        <th class="text-center">Retained</th>
        <th class="text-center">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

    printHTMLContent(htmlContent);
  } catch (error) {
    console.error("Error generating SF6:", error);
    throw error;
  }
}
