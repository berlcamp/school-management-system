import { buildDepEdHeaderWithLogos, DEPED_HEADER_LOGOS_STYLES, printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface Sf6Params {
  schoolId: string;
  schoolYear: string;
}

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
      graduated: number;
      transferredOut: number;
      dropped: number;
      total: number;
    }[] = [];

    for (const gl of gradeLevels) {
      const sectionIds = sections
        .filter((s) => s.grade_level === gl)
        .map((s) => s.id);

      const { data: enrollments } = await supabase
        .from("sms_enrollments")
        .select("student_id, enrollment_status")
        .in("section_id", sectionIds)
        .eq("school_year", schoolYear)
        .eq("status", "approved");

      const enrollmentList = enrollments || [];
      let promotedCount = 0;
      let retainedCount = 0;
      let graduatedCount = 0;
      let transferredOutCount = 0;
      let droppedCount = 0;

      enrollmentList.forEach((e) => {
        const status = e.enrollment_status || "active";
        if (status === "promoted") promotedCount++;
        else if (status === "retained") retainedCount++;
        else if (status === "graduated") graduatedCount++;
        else if (status === "transferred_out") transferredOutCount++;
        else if (status === "dropped") droppedCount++;
      });

      summary.push({
        gradeLevel: gl,
        promoted: promotedCount,
        retained: retainedCount,
        graduated: graduatedCount,
        transferredOut: transferredOutCount,
        dropped: droppedCount,
        total: promotedCount + retainedCount + graduatedCount,
      });
    }

    const totalPromoted = summary.reduce((a, s) => a + s.promoted, 0);
    const totalRetained = summary.reduce((a, s) => a + s.retained, 0);
    const totalGraduated = summary.reduce((a, s) => a + s.graduated, 0);
    const totalTransferredOut = summary.reduce((a, s) => a + s.transferredOut, 0);
    const totalDropped = summary.reduce((a, s) => a + s.dropped, 0);

    let rows = "";
    summary.forEach((s) => {
      const gradeLabel = s.gradeLevel === -1 ? "SNED" : s.gradeLevel === 0 ? "Kindergarten" : `Grade ${s.gradeLevel}`;
      rows += `<tr>
        <td>${gradeLabel}</td>
        <td class="text-center">${s.promoted}</td>
        <td class="text-center">${s.graduated}</td>
        <td class="text-center">${s.retained}</td>
        <td class="text-center">${s.transferredOut}</td>
        <td class="text-center">${s.dropped}</td>
        <td class="text-center">${s.total}</td>
      </tr>`;
    });
    rows += `<tr class="total-row">
      <td><strong>TOTAL</strong></td>
      <td class="text-center"><strong>${totalPromoted}</strong></td>
      <td class="text-center"><strong>${totalGraduated}</strong></td>
      <td class="text-center"><strong>${totalRetained}</strong></td>
      <td class="text-center"><strong>${totalTransferredOut}</strong></td>
      <td class="text-center"><strong>${totalDropped}</strong></td>
      <td class="text-center"><strong>${totalPromoted + totalRetained + totalGraduated}</strong></td>
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
    ${DEPED_HEADER_LOGOS_STYLES}
    @media print { body { print-color-adjust: exact; } }
  </style>
</head>
<body>
  ${buildDepEdHeaderWithLogos(`
    <div>Republic of the Philippines</div>
    <div class="school-name">Department of Education</div>
    <div class="school-name" style="margin-top:6px">${school.name}</div>
    <div class="school-address">${school.address || ""} ${school.district ? `• ${school.district}` : ""} ${school.region ? `• ${school.region}` : ""}</div>
    <div class="form-title" style="margin-top:12px">SF6 - Summarized Report on Promotion and Learning Progress</div>
    <div class="form-subtitle">School Year ${schoolYear}</div>
  `)}
  <table class="form-table">
    <thead>
      <tr>
        <th>Grade Level</th>
        <th class="text-center">Promoted</th>
        <th class="text-center">Graduated</th>
        <th class="text-center">Retained</th>
        <th class="text-center">Transferred Out</th>
        <th class="text-center">Dropped</th>
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
