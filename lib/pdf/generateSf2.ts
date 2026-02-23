import { printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface Sf2Params {
  schoolId: string;
  sectionId: string;
  schoolYear: string;
  date: string; // YYYY-MM-DD
}

/** SF2 - Learner's Daily Class Attendance. Uses sms_enrollments and sms_attendance. */
export async function generateSf2Print(params: Sf2Params): Promise<void> {
  const { schoolId, sectionId, schoolYear, date } = params;

  const { data: school } = await supabase
    .from("sms_schools")
    .select("id, name, address")
    .eq("id", schoolId)
    .single();

  const { data: section } = await supabase
    .from("sms_sections")
    .select("id, name, grade_level")
    .eq("id", sectionId)
    .single();

  const schoolName = school?.name || "—";
  const sectionName = section?.name || "—";
  const gradeLabel =
    section?.grade_level === 0 ? "Kindergarten" : `Grade ${section?.grade_level ?? ""}`;

  // Fetch students from sms_enrollments (approved) joined with sms_students
  const { data: enrollments } = await supabase
    .from("sms_enrollments")
    .select("student_id")
    .eq("section_id", sectionId)
    .eq("school_year", schoolYear)
    .eq("status", "approved");

  let students: { id: string; first_name: string; middle_name: string | null; last_name: string; suffix: string | null }[] = [];

  if (enrollments && enrollments.length > 0) {
    const studentIds = enrollments.map((e) => e.student_id);
    const { data: studentList } = await supabase
      .from("sms_students")
      .select("id, first_name, middle_name, last_name, suffix")
      .in("id", studentIds)
      .order("last_name")
      .order("first_name");
    students = studentList || [];
  }

  // Fetch attendance for this section and date
  const { data: attendanceData } = await supabase
    .from("sms_attendance")
    .select("student_id, status")
    .eq("section_id", sectionId)
    .eq("date", date);

  const attendanceMap: Record<string, "present" | "absent" | "tardy"> = {};
  if (attendanceData) {
    attendanceData.forEach((a) => {
      attendanceMap[a.student_id] = a.status as "present" | "absent" | "tardy";
    });
  }

  let rows = "";
  students.forEach((s, idx) => {
    const fullName = `${s.last_name}, ${s.first_name} ${s.middle_name || ""} ${s.suffix || ""}`.trim();
    const status = attendanceMap[s.id] ?? "present"; // Default to present if no record
    const presentCell = status === "present" ? "P" : "";
    const absentCell = status === "absent" ? "A" : "";
    const tardyCell = status === "tardy" ? "T" : "";
    rows += `<tr>
      <td class="text-center">${idx + 1}</td>
      <td>${fullName}</td>
      <td class="text-center">${presentCell}</td>
      <td class="text-center">${absentCell}</td>
      <td class="text-center">${tardyCell}</td>
    </tr>`;
  });

  const tbody = rows || "<tr><td colspan='5' class='text-center'>No learners enrolled</td></tr>";

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SF2 - Learner's Daily Class Attendance</title>
  <style>
    @page { size: 8.5in 13in; margin: 0.5in; }
    body { font-family: "Times New Roman", serif; font-size: 11pt; }
    .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; }
    .form-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .form-table th, .form-table td { border: 1px solid #000; padding: 4px; }
    .form-subtitle { font-size: 10pt; margin-top: 4px; }
    .text-center { text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>Republic of the Philippines</div>
    <div style="font-weight:bold">Department of Education</div>
    <div style="font-weight:bold; margin-top:6px">${schoolName}</div>
    <div style="font-size:10pt; margin-top:4px">SF2 - Learner's Daily Class Attendance</div>
    <div class="form-subtitle">${gradeLabel} - ${sectionName} | School Year ${schoolYear} | Date: ${date}</div>
  </div>
  <table class="form-table">
    <thead>
      <tr>
        <th style="width:40px">No.</th>
        <th>Name of Learner</th>
        <th style="width:60px">Present</th>
        <th style="width:60px">Absent</th>
        <th style="width:60px">Tardy</th>
      </tr>
    </thead>
    <tbody>${tbody}</tbody>
  </table>
</body>
</html>`;

  printHTMLContent(htmlContent);
}
