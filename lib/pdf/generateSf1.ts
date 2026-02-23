import { printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface Sf1Params {
  schoolId: string;
  sectionId?: string | null;
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

export async function generateSf1Print(params: Sf1Params): Promise<void> {
  try {
    const { schoolId, sectionId, schoolYear } = params;

    // Fetch school
    const { data: school, error: schoolError } = await supabase
      .from("sms_schools")
      .select("id, school_id, name, address, district, region")
      .eq("id", schoolId)
      .single();

    if (schoolError || !school) {
      throw new Error("School not found");
    }

    // Build sections query
    let sectionsQuery = supabase
      .from("sms_sections")
      .select("id, name, grade_level, section_adviser_id")
      .eq("school_id", schoolId)
      .eq("school_year", schoolYear)
      .eq("is_active", true)
      .order("grade_level")
      .order("name");

    if (sectionId) {
      sectionsQuery = sectionsQuery.eq("id", sectionId);
    }

    const { data: sections } = await sectionsQuery;

    if (!sections || sections.length === 0) {
      throw new Error("No sections found for the selected criteria");
    }

    // Fetch adviser names
    const adviserIds = new Set<string>();
    sections.forEach((s) => {
      if (s.section_adviser_id) adviserIds.add(String(s.section_adviser_id));
    });
    const adviserMap: Record<string, string> = {};
    if (adviserIds.size > 0) {
      const { data: advisers } = await supabase
        .from("sms_users")
        .select("id, name")
        .in("id", Array.from(adviserIds));
      (advisers || []).forEach((a) => {
        adviserMap[String(a.id)] = a.name || "";
      });
    }

    let tablesHTML = "";

    for (const section of sections) {
      const { data: enrollments } = await supabase
        .from("sms_enrollments")
        .select("student_id")
        .eq("section_id", section.id)
        .eq("school_year", schoolYear)
        .eq("status", "approved");

      const studentIds = (enrollments || []).map((e) => e.student_id);
      let students: { id: string; lrn: string; first_name: string; middle_name: string | null; last_name: string; suffix: string | null; gender: string; date_of_birth: string }[] = [];

      if (studentIds.length > 0) {
        const { data: studentList } = await supabase
          .from("sms_students")
          .select("id, lrn, first_name, middle_name, last_name, suffix, gender, date_of_birth")
          .in("id", studentIds)
          .order("last_name")
          .order("first_name");
        students = studentList || [];
      }

      const adviserName = section.section_adviser_id
        ? adviserMap[String(section.section_adviser_id)] || ""
        : "";

      const gradeLabel = section.grade_level === 0 ? "Kindergarten" : `Grade ${section.grade_level}`;

      let rows = "";
      students.forEach((s, idx) => {
        const fullName = `${s.last_name}, ${s.first_name} ${s.middle_name || ""} ${s.suffix || ""}`.trim();
        const gender = s.gender === "male" ? "M" : "F";
        rows += `<tr>
          <td class="text-center">${idx + 1}</td>
          <td>${s.lrn}</td>
          <td>${fullName}</td>
          <td class="text-center">${gender}</td>
          <td class="text-center">${formatDate(s.date_of_birth)}</td>
        </tr>`;
      });

      tablesHTML += `
        <div class="section-block">
          <div class="section-title">${gradeLabel} - ${section.name}</div>
          <div class="section-info">Adviser: ${adviserName}</div>
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
        </div>
      `;
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SF1 - School Register</title>
  <style>
    @page { size: 8.5in 13in; margin: 0.5in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Times New Roman", serif; font-size: 11pt; color: #000; background: #fff; }
    .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .school-name { font-size: 14pt; font-weight: bold; text-transform: uppercase; }
    .school-address { font-size: 10pt; margin-top: 4px; }
    .form-title { font-size: 12pt; font-weight: bold; margin-top: 10px; text-transform: uppercase; }
    .form-subtitle { font-size: 10pt; margin-top: 4px; }
    .section-block { margin-top: 25px; page-break-inside: avoid; }
    .section-title { font-weight: bold; font-size: 11pt; margin-bottom: 4px; }
    .section-info { font-size: 10pt; margin-bottom: 8px; color: #333; }
    .form-table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-bottom: 15px; }
    .form-table th, .form-table td { border: 1px solid #000; padding: 4px 6px; }
    .form-table th { background-color: #f0f0f0; font-weight: bold; }
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
    <div class="form-title" style="margin-top:12px">SF1 - School Register</div>
    <div class="form-subtitle">School Year ${schoolYear}</div>
  </div>
  ${tablesHTML}
</body>
</html>`;

    printHTMLContent(htmlContent);
  } catch (error) {
    console.error("Error generating SF1:", error);
    throw error;
  }
}
