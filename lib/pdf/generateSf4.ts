import { printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface Sf4Params {
  schoolId: string;
  schoolYear: string;
  month?: string; // e.g. "January", optional for summary
}

export async function generateSf4Print(params: Sf4Params): Promise<void> {
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
      maleEnrolled: number;
      femaleEnrolled: number;
      totalEnrolled: number;
      transferredIn: number;
      transferredOut: number;
      dropout: number;
    }[] = [];

    for (const gl of gradeLevels) {
      const sectionIds = sections.filter((s) => s.grade_level === gl).map((s) => s.id);
      const { data: enrollments } = await supabase
        .from("sms_enrollments")
        .select("student_id")
        .in("section_id", sectionIds)
        .eq("school_year", schoolYear)
        .eq("status", "approved");

      const studentIds = (enrollments || []).map((e) => e.student_id);
      let maleCount = 0;
      let femaleCount = 0;
      let transferredOut = 0;
      let dropout = 0;

      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from("sms_students")
          .select("id, gender, enrollment_status")
          .in("id", studentIds);

        (students || []).forEach((s) => {
          if (s.enrollment_status === "transferred") transferredOut++;
          else if (s.enrollment_status === "dropped") dropout++;
          else {
            if (s.gender === "male") maleCount++;
            else femaleCount++;
          }
        });
      }

      summary.push({
        gradeLevel: gl,
        maleEnrolled: maleCount,
        femaleEnrolled: femaleCount,
        totalEnrolled: maleCount + femaleCount,
        transferredIn: 0, // Schema does not track; placeholder
        transferredOut,
        dropout,
      });
    }

    const totalMale = summary.reduce((a, s) => a + s.maleEnrolled, 0);
    const totalFemale = summary.reduce((a, s) => a + s.femaleEnrolled, 0);
    const totalAll = summary.reduce((a, s) => a + s.totalEnrolled, 0);

    let rows = "";
    summary.forEach((s) => {
      const gradeLabel = s.gradeLevel === 0 ? "Kinder" : `Grade ${s.gradeLevel}`;
      rows += `<tr>
        <td>${gradeLabel}</td>
        <td class="text-center">${s.maleEnrolled}</td>
        <td class="text-center">${s.femaleEnrolled}</td>
        <td class="text-center">${s.totalEnrolled}</td>
        <td class="text-center">${s.transferredIn}</td>
        <td class="text-center">${s.transferredOut}</td>
        <td class="text-center">${s.dropout}</td>
      </tr>`;
    });
    rows += `<tr class="total-row">
      <td><strong>TOTAL</strong></td>
      <td class="text-center"><strong>${totalMale}</strong></td>
      <td class="text-center"><strong>${totalFemale}</strong></td>
      <td class="text-center"><strong>${totalAll}</strong></td>
      <td colspan="3"></td>
    </tr>`;

    const monthLabel = params.month ? ` - ${params.month}` : "";

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SF4 - Summary Enrollment and Movement of Learners</title>
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
    .note { font-size: 9pt; margin-top: 15px; color: #555; }
    @media print { body { print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <div>Republic of the Philippines</div>
    <div class="school-name">Department of Education</div>
    <div class="school-name" style="margin-top:6px">${school.name}</div>
    <div class="school-address">${school.address || ""} ${school.district ? `• ${school.district}` : ""} ${school.region ? `• ${school.region}` : ""}</div>
    <div class="form-title" style="margin-top:12px">SF4 - Summary Enrollment and Movement of Learners</div>
    <div class="form-subtitle">School Year ${schoolYear}${monthLabel}</div>
  </div>
  <table class="form-table">
    <thead>
      <tr>
        <th>Grade Level</th>
        <th class="text-center">Male</th>
        <th class="text-center">Female</th>
        <th class="text-center">Total Enrolled</th>
        <th class="text-center">Transferred In</th>
        <th class="text-center">Transferred Out</th>
        <th class="text-center">Dropout</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="note">Note: Transferred In is not tracked in the system. Update manually if needed.</div>
</body>
</html>`;

    printHTMLContent(htmlContent);
  } catch (error) {
    console.error("Error generating SF4:", error);
    throw error;
  }
}
