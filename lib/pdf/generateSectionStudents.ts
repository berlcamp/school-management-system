import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface SectionStudentsPrintParams {
  schoolId: string | number;
  sectionId: string;
  sectionName: string;
  gradeLevel: number;
  schoolYear: string;
  adviserName: string;
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

export async function generateSectionStudentsPrint(
  params: SectionStudentsPrintParams,
): Promise<void> {
  try {
    const {
      schoolId,
      sectionId,
      sectionName,
      gradeLevel,
      schoolYear,
      adviserName,
    } = params;

    // Fetch school
    const { data: school, error: schoolError } = await supabase
      .from("sms_schools")
      .select("id, school_id, name, address, district, region")
      .eq("id", schoolId)
      .single();

    if (schoolError || !school) {
      throw new Error("School not found");
    }

    // Fetch enrolled students
    const { data: enrollments } = await supabase
      .from("sms_enrollments")
      .select("student_id")
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .eq("status", "approved");

    const studentIds = (enrollments || []).map((e) => e.student_id);
    let students: {
      id: string;
      lrn: string;
      first_name: string;
      middle_name: string | null;
      last_name: string;
      suffix: string | null;
      gender: string;
      date_of_birth: string;
    }[] = [];

    if (studentIds.length > 0) {
      const { data: studentList } = await supabase
        .from("sms_students")
        .select(
          "id, lrn, first_name, middle_name, last_name, suffix, gender, date_of_birth",
        )
        .in("id", studentIds)
        .order("last_name")
        .order("first_name");
      students = studentList || [];
    }

    const gradeLabel =
      gradeLevel === -1
        ? "SNED"
        : gradeLevel === 0
          ? "Kindergarten"
          : `Grade ${gradeLevel}`;

    let rows = "";
    students.forEach((s, idx) => {
      const fullName =
        `${s.last_name}, ${s.first_name} ${s.middle_name || ""} ${s.suffix || ""}`.trim();
      const gender = s.gender === "male" ? "M" : "F";
      rows += `<tr>
        <td class="text-center">${idx + 1}</td>
        <td>${s.lrn}</td>
        <td>${fullName}</td>
        <td class="text-center">${gender}</td>
        <td class="text-center">${formatDate(s.date_of_birth)}</td>
      </tr>`;
    });

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Section Student List - ${sectionName}</title>
  <style>
    @page { size: 8.5in 13in; margin: 0.5in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Times New Roman", serif; font-size: 11pt; color: #000; background: #fff; }
    .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .school-name { font-size: 14pt; font-weight: bold; text-transform: uppercase; }
    .school-address { font-size: 10pt; margin-top: 4px; }
    .form-title { font-size: 12pt; font-weight: bold; margin-top: 10px; text-transform: uppercase; }
    .form-subtitle { font-size: 10pt; margin-top: 4px; }
    .section-info { font-size: 10pt; margin-bottom: 12px; line-height: 1.6; }
    .section-info strong { font-weight: bold; }
    .form-table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-bottom: 15px; }
    .form-table th, .form-table td { border: 1px solid #000; padding: 4px 6px; }
    .form-table th { background-color: #f0f0f0; font-weight: bold; }
    .text-center { text-align: center; }
    .total-row { font-weight: bold; margin-top: 8px; font-size: 10pt; }
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
    <div class="form-title" style="margin-top:12px">Section Student List</div>
    <div class="form-subtitle">School Year ${schoolYear}</div>
  `)}
  <div class="section-info">
    <strong>Section:</strong> ${sectionName} &nbsp;&nbsp;
    <strong>Grade Level:</strong> ${gradeLabel} &nbsp;&nbsp;
    <strong>Adviser:</strong> ${adviserName || "N/A"}
  </div>
  <table class="form-table">
    <thead>
      <tr>
        <th style="width:40px">No.</th>
        <th style="width:120px">LRN</th>
        <th>Name (Last, First, Middle)</th>
        <th style="width:50px" class="text-center">Sex</th>
        <th style="width:100px" class="text-center">Date of Birth</th>
      </tr>
    </thead>
    <tbody>${rows || "<tr><td colspan='5' class='text-center'>No learners enrolled</td></tr>"}</tbody>
  </table>
  <div class="total-row">Total: ${students.length} student(s)</div>
</body>
</html>`;

    printHTMLContent(htmlContent);
  } catch (error) {
    console.error("Error generating section student list:", error);
    throw error;
  }
}
