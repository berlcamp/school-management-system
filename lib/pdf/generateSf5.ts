import { buildDepEdHeaderWithLogos, DEPED_HEADER_LOGOS_STYLES, printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface Sf5Params {
  schoolId: string;
  sectionId?: string | null;
  schoolYear: string;
}

const PROMOTION_THRESHOLD = 75;

export async function generateSf5Print(params: Sf5Params): Promise<void> {
  try {
    const { schoolId, sectionId, schoolYear } = params;

    const { data: school, error: schoolError } = await supabase
      .from("sms_schools")
      .select("id, school_id, name, address, district, region")
      .eq("id", schoolId)
      .single();

    if (schoolError || !school) {
      throw new Error("School not found");
    }

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
      if (studentIds.length === 0) {
        tablesHTML += `
          <div class="section-block">
            <div class="section-title">Grade ${section.grade_level} - ${section.name}</div>
            <div class="section-info">Adviser: ${section.section_adviser_id ? adviserMap[String(section.section_adviser_id)] || "" : ""}</div>
            <p class="no-data">No learners enrolled.</p>
          </div>
        `;
        continue;
      }

      const { data: grades } = await supabase
        .from("sms_grades")
        .select("student_id, subject_id, grading_period, grade")
        .in("section_id", [section.id])
        .eq("school_year", schoolYear);

      const { data: students } = await supabase
        .from("sms_students")
        .select("id, lrn, first_name, middle_name, last_name, suffix")
        .in("id", studentIds)
        .order("last_name")
        .order("first_name");

      const gradesByStudent = new Map<string, number[]>();
      (grades || []).forEach((g) => {
        const subjKey = `${g.student_id}-${g.subject_id}`;
        if (!gradesByStudent.has(subjKey)) {
          gradesByStudent.set(subjKey, []);
        }
        const arr = gradesByStudent.get(subjKey)!;
        arr[g.grading_period - 1] = g.grade;
      });

      const studentAverages: { studentId: string; finalGrade: number }[] = [];
      (students || []).forEach((s) => {
        const subjectKeys = Array.from(gradesByStudent.keys()).filter((k) =>
          k.startsWith(`${s.id}-`),
        );
        const subjectIds = new Set(subjectKeys.map((k) => k.split("-")[1]));
        const finals: number[] = [];
        subjectIds.forEach((subjId) => {
          const key = `${s.id}-${subjId}`;
          const qGrades = gradesByStudent.get(key) || [];
          const valid = qGrades.filter((v) => v != null && !Number.isNaN(v));
          if (valid.length >= 1) {
            const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
            finals.push(avg);
          }
        });
        const overall =
          finals.length > 0
            ? finals.reduce((a, b) => a + b, 0) / finals.length
            : 0;
        studentAverages.push({ studentId: s.id, finalGrade: overall });
      });

      const promoted = studentAverages.filter(
        (s) => s.finalGrade >= PROMOTION_THRESHOLD,
      );
      const retained = studentAverages.filter(
        (s) => s.finalGrade > 0 && s.finalGrade < PROMOTION_THRESHOLD,
      );
      const noGrade = studentAverages.filter((s) => s.finalGrade === 0);

      const studentMap = new Map((students || []).map((s) => [s.id, s]));
      const getFullName = (id: string) => {
        const st = studentMap.get(id);
        if (!st) return "";
        return `${st.last_name}, ${st.first_name} ${st.middle_name || ""} ${st.suffix || ""}`.trim();
      };

      let promotedRows = "";
      promoted.forEach((s, idx) => {
        promotedRows += `<tr><td class="text-center">${idx + 1}</td><td>${getFullName(s.studentId)}</td><td class="text-center">${s.finalGrade.toFixed(2)}</td></tr>`;
      });
      let retainedRows = "";
      retained.forEach((s, idx) => {
        retainedRows += `<tr><td class="text-center">${idx + 1}</td><td>${getFullName(s.studentId)}</td><td class="text-center">${s.finalGrade.toFixed(2)}</td></tr>`;
      });

      const gradeLabel =
        section.grade_level === 0 ? "Kindergarten" : `Grade ${section.grade_level}`;
      const adviserName = section.section_adviser_id
        ? adviserMap[String(section.section_adviser_id)] || ""
        : "";

      tablesHTML += `
        <div class="section-block">
          <div class="section-title">${gradeLabel} - ${section.name}</div>
          <div class="section-info">Adviser: ${adviserName}</div>
          <table class="form-table" style="margin-bottom:15px">
            <thead><tr><th style="width:50px">No.</th><th>Promoted</th><th style="width:80px" class="text-center">Final Grade</th></tr></thead>
            <tbody>${promotedRows || "<tr><td colspan='3' class='text-center'>None</td></tr>"}</tbody>
          </table>
          <table class="form-table">
            <thead><tr><th style="width:50px">No.</th><th>Retained</th><th style="width:80px" class="text-center">Final Grade</th></tr></thead>
            <tbody>${retainedRows || "<tr><td colspan='3' class='text-center'>None</td></tr>"}</tbody>
          </table>
          ${noGrade.length > 0 ? `<p class="no-grade">${noGrade.length} learner(s) with no grades recorded.</p>` : ""}
        </div>
      `;
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SF5 - Report on Promotion</title>
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
    .form-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .form-table th, .form-table td { border: 1px solid #000; padding: 4px 6px; }
    .form-table th { background-color: #f0f0f0; font-weight: bold; }
    .no-data, .no-grade { font-size: 10pt; margin-top: 8px; color: #555; }
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
    <div class="form-title" style="margin-top:12px">SF5 - Report on Promotion and Learning Progress</div>
    <div class="form-subtitle">School Year ${schoolYear}</div>
  `)}
  ${tablesHTML}
</body>
</html>`;

    printHTMLContent(htmlContent);
  } catch (error) {
    console.error("Error generating SF5:", error);
    throw error;
  }
}
