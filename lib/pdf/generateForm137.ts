import { buildDepEdHeaderWithLogos, DEPED_HEADER_LOGOS_STYLES, printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";
import {
  Enrollment,
  Grade,
  Section,
  Student,
  Subject,
} from "@/types/database";

interface Form137Data {
  student: Student;
  grades: (Grade & {
    subject: Subject;
    section: Section | null;
  })[];
  enrollments: (Enrollment & { section: Section })[];
  adviserNames: Record<string, string>;
}

export async function generateForm137Print(studentId: string): Promise<void> {
  try {
    // Fetch student data
    const { data: student, error: studentError } = await supabase
      .from("sms_students")
      .select("*")
      .eq("id", studentId)
      .single();

    if (studentError || !student) {
      throw new Error("Student not found");
    }

    // Fetch all grades with subject and section info
    const { data: grades } = await supabase
      .from("sms_grades")
      .select("*, subject:sms_subjects(*), section:sms_sections(*)")
      .eq("student_id", studentId)
      .order("school_year", { ascending: false })
      .order("grading_period", { ascending: true });

    // Fetch enrollments (basis for section assignment - approved only)
    const { data: enrollments } = await supabase
      .from("sms_enrollments")
      .select("*, section:sms_sections(*)")
      .eq("student_id", studentId)
      .eq("status", "approved")
      .order("school_year", { ascending: false });

    // Fetch adviser names for sections that have grades
    const adviserIds = new Set<string>();
    (grades || []).forEach((g) => {
      const adviserId = g.section?.section_adviser_id;
      if (adviserId) {
        adviserIds.add(String(adviserId));
      }
    });

    const adviserNames: Record<string, string> = {};
    if (adviserIds.size > 0) {
      const { data: advisers } = await supabase
        .from("sms_users")
        .select("id, name")
        .in("id", Array.from(adviserIds));
      (advisers || []).forEach((a) => {
        adviserNames[String(a.id)] = a.name || "";
      });
    }

    const form137Data: Form137Data = {
      student,
      grades: grades || [],
      enrollments: enrollments || [],
      adviserNames,
    };

    generateForm137HTML(form137Data);
  } catch (error) {
    console.error("Error generating Form 137:", error);
    alert("Failed to generate Form 137. Please try again.");
  }
}

function formatDateSF10(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

// Map subject name/code to DepEd SF10-ES learning area key (for matching)
function getDepEdLearningAreaKey(subject: Subject): string {
  const name = (subject.name || "").toLowerCase();
  const code = (subject.code || "").toLowerCase();
  const combined = `${name} ${code}`;
  if (combined.includes("filipino")) return "filipino";
  if (combined.includes("english")) return "english";
  if (combined.includes("math")) return "mathematics";
  if (combined.includes("science")) return "science";
  if (combined.includes("gmrc") || combined.includes("good manners")) return "gmrc";
  if (combined.includes("makabansa")) return "makabansa";
  if (combined.includes("araling panlipunan") || combined.includes("ap ")) return "araling_panlipunan";
  if (combined.includes("epp")) return "epp";
  if (combined.includes("mapeh")) return "mapeh";
  if (combined.includes("physical education") || combined.includes("pe ") || combined.includes("health")) return "pe_health";
  if (combined.includes("music") || combined.includes("arts")) return "music_arts";
  if (combined.includes("language") || combined.includes("mother tongue")) return "language";
  if (combined.includes("reading") || combined.includes("literacy")) return "reading_literacy";
  if (combined.includes("arabic")) return "arabic";
  if (combined.includes("islamic")) return "islamic_values";
  return "other";
}

// DepEd SF10-ES standard learning areas - Grades 1-3 (two columns: left has different names)
const GRADE_1_3_LEFT: string[] = [
  "Language",
  "Reading and Literacy",
  "Mathematics",
  "GMRC (Good Manners and Right Conduct)",
  "Makabansa",
  "*Arabic Language",
  "*Islamic Values Education",
  "General Average",
];

const GRADE_1_3_RIGHT: string[] = [
  "Filipino",
  "English",
  "Mathematics",
  "GMRC (Good Manners and Right Conduct)",
  "Makabansa",
  "*Arabic Language",
  "*Islamic Values Education",
  "General Average",
];

// Grades 4-6 learning areas
const GRADE_4_6_LEFT: string[] = [
  "Filipino",
  "English",
  "Mathematics",
  "Science",
  "GMRC (Good Manners and Right Conduct)",
  "Makabansa",
  "*Arabic Language",
  "*Islamic Values Education",
  "General Average",
];

const GRADE_4_6_RIGHT: string[] = [
  "Filipino",
  "English",
  "Mathematics",
  "Science",
  "GMRC (Good Manners and Right Conduct)",
  "Araling Panlipunan",
  "EPP",
  "MAPEH",
  "Music & Arts",
  "Physical Education & Health",
  "*Arabic Language",
  "*Islamic Values Education",
  "General Average",
];

// Map DepEd key to display name for each column (Grades 1-3)
const KEY_TO_LEFT_1_3: Record<string, string> = {
  language: "Language",
  reading_literacy: "Reading and Literacy",
  mathematics: "Mathematics",
  gmrc: "GMRC (Good Manners and Right Conduct)",
  makabansa: "Makabansa",
  arabic: "*Arabic Language",
  islamic_values: "*Islamic Values Education",
};
const KEY_TO_RIGHT_1_3: Record<string, string> = {
  filipino: "Filipino",
  english: "English",
  mathematics: "Mathematics",
  gmrc: "GMRC (Good Manners and Right Conduct)",
  makabansa: "Makabansa",
  arabic: "*Arabic Language",
  islamic_values: "*Islamic Values Education",
};

function generateForm137HTML(data: Form137Data): void {
  const { student, grades, adviserNames } = data;

  // Group grades by school year and grade level
  const gradesBySchoolYear: Record<
    string,
    Record<number, (typeof grades)[0][]>
  > = {};

  grades.forEach((grade) => {
    if (!gradesBySchoolYear[grade.school_year]) {
      gradesBySchoolYear[grade.school_year] = {};
    }
    const gradeLevel = grade.section?.grade_level || 0;
    if (!gradesBySchoolYear[grade.school_year][gradeLevel]) {
      gradesBySchoolYear[grade.school_year][gradeLevel] = [];
    }
    gradesBySchoolYear[grade.school_year][gradeLevel].push(grade);
  });

  // Get grades for a specific grade level from any school year
  const getGradeData = (gradeLevel: number): { yearGrades: (typeof grades)[0][]; schoolYear: string; sectionName: string; adviserName: string } | null => {
    const schoolYears = Object.keys(gradesBySchoolYear).sort().reverse();
    for (const sy of schoolYears) {
      const yearGrades = gradesBySchoolYear[sy]?.[gradeLevel];
      if (yearGrades && yearGrades.length > 0) {
        const section = yearGrades[0]?.section;
        const adviserName =
          section?.section_adviser_id && adviserNames[String(section.section_adviser_id)]
            ? adviserNames[String(section.section_adviser_id)]
            : "";
        return {
          yearGrades,
          schoolYear: sy,
          sectionName: section?.name || "",
          adviserName,
        };
      }
    }
    return null;
  };

  // Build a lookup: DepEdKey -> { q1, q2, q3, q4, finalGrade, remarks } for a grade dataset
  const buildGradeLookup = (yearGrades: (typeof grades)[0][]): Record<string, { q1: number | null; q2: number | null; q3: number | null; q4: number | null; finalGrade: number | null; remarks: string }> => {
    const lookup: Record<string, { q1: number | null; q2: number | null; q3: number | null; q4: number | null; finalGrade: number | null; remarks: string }> = {};
    const subjects = Array.from(
      new Map(yearGrades.map((g) => [g.subject.id, g.subject as Subject])).values(),
    );
    const finalGrades: number[] = [];
    subjects.forEach((subject) => {
      const q1 = yearGrades.find((g) => g.subject.id === subject.id && g.grading_period === 1)?.grade ?? null;
      const q2 = yearGrades.find((g) => g.subject.id === subject.id && g.grading_period === 2)?.grade ?? null;
      const q3 = yearGrades.find((g) => g.subject.id === subject.id && g.grading_period === 3)?.grade ?? null;
      const q4 = yearGrades.find((g) => g.subject.id === subject.id && g.grading_period === 4)?.grade ?? null;
      const finalGrade = q1 !== null && q2 !== null && q3 !== null && q4 !== null ? (q1 + q2 + q3 + q4) / 4 : null;
      if (finalGrade !== null) finalGrades.push(finalGrade);
      const key = getDepEdLearningAreaKey(subject);
      if (key !== "other") {
        lookup[key] = {
          q1, q2, q3, q4,
          finalGrade,
          remarks: finalGrade !== null ? (finalGrade >= 75 ? "Passed" : "Failed") : "",
        };
      }
    });
    return lookup;
  };

  // Build two-column scholastic + learning areas block (PDF layout)
  const renderTwoColumnBlock = (
    leftData: ReturnType<typeof getGradeData>,
    rightData: ReturnType<typeof getGradeData>,
    leftLabels: string[],
    rightLabels: string[],
    keyMap: { left: Record<string, string>; right: Record<string, string> },
  ): string => {
    const leftLookup = leftData ? buildGradeLookup(leftData.yearGrades) : {};
    const rightLookup = rightData ? buildGradeLookup(rightData.yearGrades) : {};
    const maxRows = Math.max(leftLabels.length, rightLabels.length);

    const getRowData = (label: string, lookup: Record<string, { q1: number | null; q2: number | null; q3: number | null; q4: number | null; finalGrade: number | null; remarks: string }>, keyMapSide: Record<string, string>, hasData: boolean) => {
      const isGeneralAvg = label === "General Average";
      const key = Object.entries(keyMapSide).find(([, v]) => v === label)?.[0] ?? "";
      const data = !isGeneralAvg ? lookup[key] : null;
      const generalAvg = hasData && Object.values(lookup).some((d) => d.finalGrade !== null)
        ? Math.round(
            Object.values(lookup).filter((d) => d.finalGrade !== null).reduce((a, d) => a + (d.finalGrade ?? 0), 0) /
            Object.values(lookup).filter((d) => d.finalGrade !== null).length,
          )
        : null;
      return { label, data, isGeneralAvg, generalAvg };
    };

    let learningRows = "";
    for (let i = 0; i < maxRows; i++) {
      const leftLabel = leftLabels[i] ?? "";
      const rightLabel = rightLabels[i] ?? "";
      const leftRow = leftLabel ? getRowData(leftLabel, leftLookup, keyMap.left, !!leftData) : null;
      const rightRow = rightLabel ? getRowData(rightLabel, rightLookup, keyMap.right, !!rightData) : null;
      const lQ1 = leftRow?.data?.q1;
      const lQ2 = leftRow?.data?.q2;
      const lQ3 = leftRow?.data?.q3;
      const lQ4 = leftRow?.data?.q4;
      const lFinal = leftRow?.isGeneralAvg ? leftRow.generalAvg : leftRow?.data?.finalGrade;
      const lRem = leftRow?.data?.remarks ?? "";
      const rQ1 = rightRow?.data?.q1;
      const rQ2 = rightRow?.data?.q2;
      const rQ3 = rightRow?.data?.q3;
      const rQ4 = rightRow?.data?.q4;
      const rFinal = rightRow?.isGeneralAvg ? rightRow.generalAvg : rightRow?.data?.finalGrade;
      const rRem = rightRow?.data?.remarks ?? "";
      learningRows += `<tr>
        <td class="la-label">${leftLabel}</td>
        <td class="text-center">${lQ1 !== null && lQ1 !== undefined ? lQ1.toFixed(2) : ""}</td>
        <td class="text-center">${lQ2 !== null && lQ2 !== undefined ? lQ2.toFixed(2) : ""}</td>
        <td class="text-center">${lQ3 !== null && lQ3 !== undefined ? lQ3.toFixed(2) : ""}</td>
        <td class="text-center">${lQ4 !== null && lQ4 !== undefined ? lQ4.toFixed(2) : ""}</td>
        <td class="text-center">${lFinal !== null && lFinal !== undefined ? lFinal.toFixed(2) : ""}</td>
        <td class="text-center">${lRem}</td>
        <td class="la-label">${rightLabel}</td>
        <td class="text-center">${rQ1 !== null && rQ1 !== undefined ? rQ1.toFixed(2) : ""}</td>
        <td class="text-center">${rQ2 !== null && rQ2 !== undefined ? rQ2.toFixed(2) : ""}</td>
        <td class="text-center">${rQ3 !== null && rQ3 !== undefined ? rQ3.toFixed(2) : ""}</td>
        <td class="text-center">${rQ4 !== null && rQ4 !== undefined ? rQ4.toFixed(2) : ""}</td>
        <td class="text-center">${rFinal !== null && rFinal !== undefined ? rFinal.toFixed(2) : ""}</td>
        <td class="text-center">${rRem}</td>
      </tr>`;
    }
    const leftInfo = leftData ? { grade: leftData.yearGrades[0]?.section?.grade_level ?? 0, section: leftData.sectionName, sy: leftData.schoolYear, adviser: leftData.adviserName } : null;
    const rightInfo = rightData ? { grade: rightData.yearGrades[0]?.section?.grade_level ?? 0, section: rightData.sectionName, sy: rightData.schoolYear, adviser: rightData.adviserName } : null;
    return `
      <table class="scholastic-two-col">
        <tr><td class="info-label">School:</td><td></td><td class="info-label">School ID:</td><td></td><td class="info-label">School:</td><td></td><td class="info-label">School ID:</td><td></td></tr>
        <tr><td class="info-label">District:</td><td></td><td class="info-label">Division</td><td></td><td class="info-label">Region:</td><td></td><td class="info-label">District:</td><td></td><td class="info-label">Division:</td><td></td><td class="info-label">Region:</td><td></td></tr>
        <tr><td class="info-label">Classified as Grade:</td><td>${leftInfo?.grade ?? ""}</td><td class="info-label">Section:</td><td>${leftInfo?.section ?? ""}</td><td class="info-label">School Year:</td><td>${leftInfo?.sy ?? ""}</td><td class="info-label">Classified as Grade:</td><td>${rightInfo?.grade ?? ""}</td><td class="info-label">Section:</td><td>${rightInfo?.section ?? ""}</td><td class="info-label">School Year:</td><td>${rightInfo?.sy ?? ""}</td></tr>
        <tr><td class="info-label">Name of Adviser/Teacher:</td><td>${leftInfo?.adviser ?? ""}</td><td class="info-label">Signature:</td><td></td><td class="info-label">Name of Adviser/Teacher:</td><td>${rightInfo?.adviser ?? ""}</td><td class="info-label">Signature:</td><td></td></tr>
      </table>
      <table class="grades-two-col">
        <thead><tr><th rowspan="2" class="la-label">LEARNING AREAS</th><th colspan="4">Quarterly Rating</th><th rowspan="2">Final<br>Rating</th><th rowspan="2">Remarks</th><th rowspan="2" class="la-label">Learning Areas</th><th colspan="4">Quarterly Rating</th><th rowspan="2">Final<br>Rating</th><th rowspan="2">Remarks</th></tr>
        <tr><th>1</th><th>2</th><th>3</th><th>4</th><th>1</th><th>2</th><th>3</th><th>4</th></tr></thead>
        <tbody>${learningRows}</tbody>
      </table>
      <table class="remedial-two-col"><tr><td class="info-label">Remedial Classes</td><td>Conducted from:</td><td></td><td>to</td><td></td><td class="info-label">Remedial Classes</td><td>Conducted from:</td><td></td><td>to</td><td></td></tr>
        <tr><td class="info-label">Learning Areas</td><td class="info-label">Final Rating</td><td class="info-label">Remedial Class Mark</td><td class="info-label">Recomputed Final Grade</td><td class="info-label">Remarks</td><td class="info-label">Learning Areas</td><td class="info-label">Final Rating</td><td class="info-label">Remedial Class Mark</td><td class="info-label">Recomputed Final Grade</td><td class="info-label">Remarks</td></tr>
        <tr><td colspan="5" style="height:20px;"></td><td colspan="5" style="height:20px;"></td></tr>
      </table>`;
  };

  const keyMap13 = { left: KEY_TO_LEFT_1_3, right: KEY_TO_RIGHT_1_3 };
  const left1 = getGradeData(1);
  const right1 = getGradeData(2);
  const left3 = getGradeData(4);
  const right4 = getGradeData(5);

  const KEY_TO_LEFT_46: Record<string, string> = { filipino: "Filipino", english: "English", mathematics: "Mathematics", science: "Science", gmrc: "GMRC (Good Manners and Right Conduct)", makabansa: "Makabansa", arabic: "*Arabic Language", islamic_values: "*Islamic Values Education" };
  const KEY_TO_RIGHT_46: Record<string, string> = { ...KEY_TO_LEFT_46, araling_panlipunan: "Araling Panlipunan", epp: "EPP", mapeh: "MAPEH", music_arts: "Music & Arts", pe_health: "Physical Education & Health" };
  const keyMap46 = { left: KEY_TO_LEFT_46, right: KEY_TO_RIGHT_46 };

  let gradesHTML = `<div class="scholastic-record-header"><strong>SCHOLASTIC RECORD</strong></div>`;
  gradesHTML += renderTwoColumnBlock(left1, right1, GRADE_1_3_LEFT, GRADE_1_3_RIGHT, keyMap13);
  gradesHTML += `<div class="scholastic-record-header" style="margin-top:20px;"><strong>SCHOLASTIC RECORD</strong></div>`;
  gradesHTML += renderTwoColumnBlock(left3, right4, GRADE_4_6_LEFT, GRADE_4_6_RIGHT, keyMap46);

  const studentName =
    `${student.last_name}, ${student.first_name} ${student.middle_name || ""} ${student.suffix || ""}`.trim();
  const dob = formatDateSF10(student.date_of_birth);
  const gender = student.gender === "male" ? "Male" : "Female";
  const currentDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SF10-ES - ${studentName}</title>
  <style>
    @page {
      size: 8.5in 13in;
      margin-top: 0.5in;
      margin-bottom: 0.5in;
      margin-left: 0.75in;
      margin-right: 0.75in;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: "Times New Roman", serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #000;
      background: #fff;
    }
    
    .header {
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
    }
    
    .deped-logo {
      width: 60px;
      height: 60px;
      margin-bottom: 5px;
    }
    
    .school-name {
      font-size: 14pt;
      font-weight: bold;
      margin-bottom: 3px;
      text-transform: uppercase;
    }
    
    .school-address {
      font-size: 10pt;
      margin-bottom: 3px;
    }
    
    .form-title {
      font-size: 12pt;
      font-weight: bold;
      margin-top: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .form-subtitle {
      font-size: 10pt;
      margin-top: 4px;
      font-style: italic;
    }
    
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 5px;
    }
    
    .header-left { font-weight: bold; font-size: 12pt; }
    .header-center { text-align: center; flex: 1; }
    .header-right { text-align: right; }
    
    ${DEPED_HEADER_LOGOS_STYLES}
    
    .personal-info-section {
      font-weight: bold;
      font-size: 10pt;
      margin: 15px 0 8px 0;
      border-bottom: 1px solid #ccc;
      padding-bottom: 4px;
    }
    
    .scholastic-record-header {
      font-weight: bold;
      font-size: 10pt;
      margin: 20px 0 8px 0;
      padding: 4px 0;
    }
    
    .scholastic-info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 9pt;
    }
    
    .scholastic-info-table td {
      padding: 4px 6px;
      border: 1px solid #000;
      vertical-align: top;
    }
    
    .remedial-section {
      margin-top: 15px;
      font-size: 9pt;
    }
    
    .remedial-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .remedial-table td {
      padding: 4px 6px;
      border: 1px solid #000;
    }
    
    .general-average-row {
      background-color: #f5f5f5;
    }
    
    .scholastic-two-col,
    .grades-two-col,
    .remedial-two-col {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-bottom: 8px;
    }
    
    .scholastic-two-col td,
    .grades-two-col td,
    .grades-two-col th,
    .remedial-two-col td {
      border: 1px solid #000;
      padding: 3px 5px;
      vertical-align: middle;
    }
    
    .grades-two-col th {
      background-color: #f0f0f0;
      font-weight: bold;
      text-align: center;
    }
    
    .la-label {
      font-weight: bold;
    }
    
    .student-info {
      margin-top: 20px;
      margin-bottom: 15px;
    }
    
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    
    .info-table td {
      padding: 6px;
      border: 1px solid #000;
      font-size: 10pt;
    }
    
    .info-label {
      font-weight: bold;
      width: 25%;
      background-color: #f0f0f0;
    }
    
    .school-year-section {
      margin-top: 25px;
      page-break-inside: avoid;
    }
    
    .school-year-title {
      font-size: 11pt;
      font-weight: bold;
      margin-bottom: 8px;
      text-align: center;
      background-color: #e0e0e0;
      padding: 5px;
      border: 1px solid #000;
    }
    
    .grades-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    
    .grades-table th,
    .grades-table td {
      border: 1px solid #000;
      padding: 5px;
      font-size: 9pt;
      text-align: left;
    }
    
    .grades-table th {
      background-color: #f0f0f0;
      font-weight: bold;
      text-align: center;
    }
    
    .text-center {
      text-align: center;
    }
    
    .footer {
      margin-top: 30px;
      border-top: 2px solid #000;
      padding-top: 15px;
    }
    
    .signature-section {
      display: table;
      width: 100%;
      margin-top: 20px;
    }
    
    .signature-box {
      display: table-cell;
      text-align: center;
      width: 50%;
      padding: 0 20px;
    }
    
    .signature-line {
      border-top: 1px solid #000;
      margin-top: 50px;
      padding-top: 5px;
    }
    
    .signature-name {
      font-weight: bold;
      font-size: 10pt;
      text-transform: uppercase;
    }
    
    .signature-title {
      font-size: 9pt;
      margin-top: 3px;
    }
    
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  ${buildDepEdHeaderWithLogos(`
    <div>Republic of the Philippines</div>
    <div class="school-name">Department of Education</div>
    <div class="form-title" style="margin-top:10px">Learner Permanent Academic Record for Elementary School (SF10-ES)</div>
    <div class="form-subtitle">(Formerly Form 137)</div>
  `)}

  <div class="personal-info-section">LEARNER'S PERSONAL INFORMATION</div>
  <div class="student-info">
    <table class="info-table">
      <tr>
        <td class="info-label">LAST NAME:</td>
        <td>${student.last_name}</td>
        <td class="info-label">FIRST NAME:</td>
        <td>${student.first_name}</td>
        <td class="info-label">NAME EXTN. (Jr,I,II)</td>
        <td>${student.suffix || ""}</td>
        <td class="info-label">MIDDLE NAME:</td>
        <td>${student.middle_name || ""}</td>
      </tr>
      <tr>
        <td class="info-label">Learner Reference Number (LRN):</td>
        <td>${student.lrn}</td>
        <td class="info-label">Birthdate (mm/dd/yyyy):</td>
        <td>${dob}</td>
        <td class="info-label">Sex:</td>
        <td>${gender}</td>
        <td colspan="2"></td>
      </tr>
    </table>
    <div class="personal-info-section">ELIGIBILITY FOR ELEMENTARY SCHOOL ENROLLMENT</div>
    <table class="info-table">
      <tr>
        <td class="info-label">Credential Presented for Grade 1:</td>
        <td>Kinder Progress Report</td>
        <td>ECCD Checklist</td>
        <td colspan="2"></td>
      </tr>
      <tr>
        <td class="info-label">Name of School:</td>
        <td></td>
        <td class="info-label">School ID:</td>
        <td></td>
        <td class="info-label">Address of School:</td>
        <td colspan="2"></td>
      </tr>
      <tr>
        <td class="info-label" colspan="6">Other Credential Presented</td>
      </tr>
      <tr>
        <td class="info-label">PEPT Passer Rating:</td>
        <td></td>
        <td class="info-label">Date of Examination/Assessment (mm/dd/yyyy):</td>
        <td></td>
        <td class="info-label">Others (Pls. Specify):</td>
        <td></td>
      </tr>
      <tr>
        <td class="info-label">Name and Address of Testing Center:</td>
        <td colspan="3"></td>
        <td class="info-label">Remark:</td>
        <td></td>
      </tr>
    </table>
  </div>

  ${gradesHTML || "<p>No grades available.</p>"}

  <div class="footer">
    <p style="text-align: center; font-size: 9pt; margin-top: 20px; color: #666;">
      Revised 2025 based on DepEd Order No. 10, s. 2024
    </p>
  </div>
</body>
</html>
  `;

  printHTMLContent(htmlContent);
}
