import { buildDepEdHeaderWithLogos, DEPED_HEADER_LOGOS_STYLES, printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface Sf5Params {
  schoolId: string;
  sectionId?: string | null;
  schoolYear: string;
}

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
        .select("student_id, enrollment_status")
        .eq("section_id", section.id)
        .eq("school_year", schoolYear)
        .eq("status", "approved");

      const enrollmentList = enrollments || [];
      if (enrollmentList.length === 0) {
        tablesHTML += `
          <div class="section-block">
            <div class="section-title">${section.grade_level === -1 ? "SNED" : section.grade_level === 0 ? "Kindergarten" : `Grade ${section.grade_level}`} - ${section.name}</div>
            <div class="section-info">Adviser: ${section.section_adviser_id ? adviserMap[String(section.section_adviser_id)] || "" : ""}</div>
            <p class="no-data">No learners enrolled.</p>
          </div>
        `;
        continue;
      }

      // Build enrollment status map from enrollment records (school-year specific)
      const enrollmentStatusMap = new Map<string, string>();
      enrollmentList.forEach((e) => {
        enrollmentStatusMap.set(e.student_id, e.enrollment_status || "active");
      });

      // Exclude transferred_out and dropped students from the promotion report
      const activeStudentIds = enrollmentList
        .filter((e) => e.enrollment_status !== "transferred_out" && e.enrollment_status !== "dropped")
        .map((e) => e.student_id);

      if (activeStudentIds.length === 0) {
        const droppedCount = enrollmentList.filter((e) => e.enrollment_status === "dropped").length;
        const transferredCount = enrollmentList.filter((e) => e.enrollment_status === "transferred_out").length;
        const gradeLabel =
          section.grade_level === -1 ? "SNED" : section.grade_level === 0 ? "Kindergarten" : `Grade ${section.grade_level}`;
        const adviserName = section.section_adviser_id
          ? adviserMap[String(section.section_adviser_id)] || ""
          : "";
        tablesHTML += `
          <div class="section-block">
            <div class="section-title">${gradeLabel} - ${section.name}</div>
            <div class="section-info">Adviser: ${adviserName}</div>
            <p class="no-data">No active learners.${transferredCount > 0 ? ` ${transferredCount} transferred out.` : ""}${droppedCount > 0 ? ` ${droppedCount} dropped.` : ""}</p>
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
        .in("id", activeStudentIds)
        .order("last_name")
        .order("first_name");

      // Compute final grades for display
      const gradesByStudent = new Map<string, number[]>();
      (grades || []).forEach((g) => {
        const subjKey = `${g.student_id}-${g.subject_id}`;
        if (!gradesByStudent.has(subjKey)) {
          gradesByStudent.set(subjKey, []);
        }
        const arr = gradesByStudent.get(subjKey)!;
        arr[g.grading_period - 1] = g.grade;
      });

      const computeFinalGrade = (studentId: string): number => {
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
            finals.push(valid.reduce((a, b) => a + b, 0) / valid.length);
          }
        });
        return finals.length > 0
          ? finals.reduce((a, b) => a + b, 0) / finals.length
          : 0;
      };

      // Categorize using enrollment_status set by teacher actions
      const promoted: { studentId: string; finalGrade: number }[] = [];
      const retained: { studentId: string; finalGrade: number }[] = [];
      const graduated: { studentId: string; finalGrade: number }[] = [];
      const active: { studentId: string; finalGrade: number }[] = [];

      (students || []).forEach((s) => {
        const status = enrollmentStatusMap.get(s.id) || "active";
        const finalGrade = computeFinalGrade(s.id);
        const entry = { studentId: s.id, finalGrade };

        if (status === "promoted") promoted.push(entry);
        else if (status === "retained") retained.push(entry);
        else if (status === "graduated") graduated.push(entry);
        else active.push(entry); // still active - not yet acted upon
      });

      const studentMap = new Map((students || []).map((s) => [s.id, s]));
      const getFullName = (id: string) => {
        const st = studentMap.get(id);
        if (!st) return "";
        return `${st.last_name}, ${st.first_name} ${st.middle_name || ""} ${st.suffix || ""}`.trim();
      };

      const buildRows = (list: { studentId: string; finalGrade: number }[]) => {
        if (list.length === 0) return "<tr><td colspan='3' class='text-center'>None</td></tr>";
        return list.map((s, idx) =>
          `<tr><td class="text-center">${idx + 1}</td><td>${getFullName(s.studentId)}</td><td class="text-center">${s.finalGrade > 0 ? Math.round(s.finalGrade) : "N/A"}</td></tr>`
        ).join("");
      };

      const gradeLabel =
        section.grade_level === -1 ? "SNED" : section.grade_level === 0 ? "Kindergarten" : `Grade ${section.grade_level}`;
      const adviserName = section.section_adviser_id
        ? adviserMap[String(section.section_adviser_id)] || ""
        : "";

      const droppedCount = enrollmentList.filter((e) => e.enrollment_status === "dropped").length;
      const transferredCount = enrollmentList.filter((e) => e.enrollment_status === "transferred_out").length;

      tablesHTML += `
        <div class="section-block">
          <div class="section-title">${gradeLabel} - ${section.name}</div>
          <div class="section-info">Adviser: ${adviserName}</div>
          <table class="form-table" style="margin-bottom:15px">
            <thead><tr><th style="width:50px">No.</th><th>Promoted</th><th style="width:80px" class="text-center">Final Grade</th></tr></thead>
            <tbody>${buildRows(promoted)}</tbody>
          </table>
          ${graduated.length > 0 ? `
          <table class="form-table" style="margin-bottom:15px">
            <thead><tr><th style="width:50px">No.</th><th>Graduated</th><th style="width:80px" class="text-center">Final Grade</th></tr></thead>
            <tbody>${buildRows(graduated)}</tbody>
          </table>
          ` : ""}
          <table class="form-table">
            <thead><tr><th style="width:50px">No.</th><th>Retained</th><th style="width:80px" class="text-center">Final Grade</th></tr></thead>
            <tbody>${buildRows(retained)}</tbody>
          </table>
          ${active.length > 0 ? `<p class="no-grade">${active.length} learner(s) with no promotion action yet (still active).</p>` : ""}
          ${transferredCount > 0 ? `<p class="no-grade">${transferredCount} learner(s) transferred out.</p>` : ""}
          ${droppedCount > 0 ? `<p class="no-grade">${droppedCount} learner(s) dropped/NLIS.</p>` : ""}
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
