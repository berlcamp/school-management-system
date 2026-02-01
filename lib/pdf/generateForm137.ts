import { supabase } from "@/lib/supabase/client";
import {
  Enrollment,
  Grade,
  Section,
  SectionStudent,
  Student,
  Subject,
} from "@/types/database";

// Helper function to safely print HTML content in an iframe
function printHTMLContent(htmlContent: string): void {
  if (typeof document === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  let isCleanedUp = false;
  let cleanupTimeout: NodeJS.Timeout | null = null;
  let afterPrintHandler: (() => void) | null = null;

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    try {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
        cleanupTimeout = null;
      }

      if (afterPrintHandler && iframe.contentWindow) {
        try {
          iframe.contentWindow.removeEventListener(
            "afterprint",
            afterPrintHandler,
          );
        } catch (e) {
          // Ignore errors when removing listener
        }
      }

      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    } catch (error) {
      console.warn("Error cleaning up iframe:", error);
    }
  };

  const printIframe = () => {
    if (isCleanedUp) return;

    try {
      if (!iframe.contentWindow || !iframe.parentNode) {
        cleanup();
        return;
      }

      cleanupTimeout = setTimeout(() => {
        cleanup();
      }, 5000);

      afterPrintHandler = () => {
        if (cleanupTimeout) {
          clearTimeout(cleanupTimeout);
          cleanupTimeout = null;
        }
        cleanup();
      };

      try {
        iframe.contentWindow.addEventListener("afterprint", afterPrintHandler, {
          once: true,
        });
        iframe.contentWindow.print();
      } catch (error) {
        console.error("Error setting up print listener:", error);
        cleanup();
      }
    } catch (error) {
      console.error("Error printing:", error);
      cleanup();
    }
  };

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (iframeDoc) {
    try {
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      let hasPrinted = false;

      iframe.onload = () => {
        setTimeout(() => {
          if (
            !hasPrinted &&
            !isCleanedUp &&
            iframe.contentWindow &&
            iframe.parentNode
          ) {
            hasPrinted = true;
            printIframe();
          }
        }, 250);
      };

      setTimeout(() => {
        if (
          !hasPrinted &&
          !isCleanedUp &&
          iframe.parentNode &&
          iframe.contentWindow
        ) {
          hasPrinted = true;
          printIframe();
        }
      }, 1000);
    } catch (error) {
      console.error("Error writing to iframe:", error);
      cleanup();
    }
  } else {
    cleanup();
  }
}

interface Form137Data {
  student: Student;
  grades: (Grade & { subject: Subject; section: Section })[];
  enrollments: (Enrollment & { section: Section })[];
  sectionStudents: (SectionStudent & { section: Section })[];
}

export async function generateForm137Print(studentId: string): Promise<void> {
  try {
    // Fetch student data
    const { data: student, error: studentError } = await supabase
      .from("sms_students")
      .select("*")
      .eq("id", studentId)
      .is("deleted_at", null)
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

    // Fetch enrollments
    const { data: enrollments } = await supabase
      .from("sms_enrollments")
      .select("*, section:sms_sections(*)")
      .eq("student_id", studentId)
      .eq("status", "approved")
      .order("school_year", { ascending: false });

    // Fetch section students
    const { data: sectionStudents } = await supabase
      .from("sms_section_students")
      .select("*, section:sms_sections(*)")
      .eq("student_id", studentId)
      .order("school_year", { ascending: false });

    const form137Data: Form137Data = {
      student,
      grades: grades || [],
      enrollments: enrollments || [],
      sectionStudents: sectionStudents || [],
    };

    generateForm137HTML(form137Data);
  } catch (error) {
    console.error("Error generating Form 137:", error);
    alert("Failed to generate Form 137. Please try again.");
  }
}

function generateForm137HTML(data: Form137Data): void {
  const { student, grades } = data;

  // Format date
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

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

  // Build grades HTML by school year
  let gradesHTML = "";
  const schoolYears = Object.keys(gradesBySchoolYear).sort().reverse();

  schoolYears.forEach((schoolYear) => {
    const gradeLevels = Object.keys(gradesBySchoolYear[schoolYear])
      .map(Number)
      .sort((a, b) => a - b);

    gradeLevels.forEach((gradeLevel) => {
      const yearGrades = gradesBySchoolYear[schoolYear][gradeLevel];
      const section = yearGrades[0]?.section;
      const sectionName = section?.name || "";

      // Get unique subjects for this grade level and school year
      const subjects = Array.from(
        new Map(
          yearGrades.map((g) => [g.subject.id, g.subject as Subject]),
        ).values(),
      ).sort((a, b) => a.code.localeCompare(b.code));

      gradesHTML += `
        <div class="school-year-section">
          <h3 class="school-year-title">${schoolYear} - Grade ${gradeLevel} - ${sectionName}</h3>
          <table class="grades-table">
            <thead>
              <tr>
                <th rowspan="2" style="width: 25%;">Subject</th>
                <th colspan="4" style="text-align: center;">Grading Periods</th>
                <th rowspan="2" style="width: 10%;">Final Grade</th>
                <th rowspan="2" style="width: 10%;">Remarks</th>
              </tr>
              <tr>
                <th style="width: 10%;">1st</th>
                <th style="width: 10%;">2nd</th>
                <th style="width: 10%;">3rd</th>
                <th style="width: 10%;">4th</th>
              </tr>
            </thead>
            <tbody>
      `;

      subjects.forEach((subject) => {
        const q1 = yearGrades.find(
          (g) => g.subject.id === subject.id && g.grading_period === 1,
        )?.grade;
        const q2 = yearGrades.find(
          (g) => g.subject.id === subject.id && g.grading_period === 2,
        )?.grade;
        const q3 = yearGrades.find(
          (g) => g.subject.id === subject.id && g.grading_period === 3,
        )?.grade;
        const q4 = yearGrades.find(
          (g) => g.subject.id === subject.id && g.grading_period === 4,
        )?.grade;

        const finalGrade =
          q1 && q2 && q3 && q4 ? ((q1 + q2 + q3 + q4) / 4).toFixed(2) : "";

        const passed = finalGrade
          ? parseFloat(finalGrade) >= 75
            ? "Passed"
            : "Failed"
          : "";

        gradesHTML += `
          <tr>
            <td>${subject.code} - ${subject.name}</td>
            <td class="text-center">${q1 ? q1.toFixed(2) : ""}</td>
            <td class="text-center">${q2 ? q2.toFixed(2) : ""}</td>
            <td class="text-center">${q3 ? q3.toFixed(2) : ""}</td>
            <td class="text-center">${q4 ? q4.toFixed(2) : ""}</td>
            <td class="text-center">${finalGrade}</td>
            <td class="text-center">${passed}</td>
          </tr>
        `;
      });

      gradesHTML += `
            </tbody>
          </table>
        </div>
      `;
    });
  });

  const studentName =
    `${student.last_name}, ${student.first_name} ${student.middle_name || ""} ${student.suffix || ""}`.trim();
  const dob = formatDate(student.date_of_birth);
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
  <title>Form 137 - ${studentName}</title>
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
  <div class="header">
    <div class="school-name">DEPARTMENT OF EDUCATION</div>
    <div class="school-address">REGION [REGION NUMBER]<br>SCHOOL NAME<br>SCHOOL ADDRESS</div>
    <div class="form-title">PERMANENT RECORD<br>(Form 137)</div>
  </div>

  <div class="student-info">
    <table class="info-table">
      <tr>
        <td class="info-label">Learner Reference Number (LRN):</td>
        <td>${student.lrn}</td>
        <td class="info-label">Date of Birth:</td>
        <td>${dob}</td>
      </tr>
      <tr>
        <td class="info-label">Name:</td>
        <td colspan="3">${studentName}</td>
      </tr>
      <tr>
        <td class="info-label">Gender:</td>
        <td>${gender}</td>
        <td class="info-label">Place of Birth:</td>
        <td></td>
      </tr>
      <tr>
        <td class="info-label">Address:</td>
        <td colspan="3">${student.address}</td>
      </tr>
      <tr>
        <td class="info-label">Parent/Guardian:</td>
        <td colspan="3">${student.parent_guardian_name} (${student.parent_guardian_relationship})</td>
      </tr>
      <tr>
        <td class="info-label">Contact Number:</td>
        <td>${student.parent_guardian_contact}</td>
        <td class="info-label">Previous School:</td>
        <td>${student.previous_school || ""}</td>
      </tr>
    </table>
  </div>

  ${gradesHTML || "<p>No grades available.</p>"}

  <div class="footer">
    <p style="text-align: center; font-size: 10pt; margin-bottom: 20px;">
      <strong>CERTIFICATION:</strong> This is to certify that this is a true and correct copy of the Permanent Record
      of the above-named student.
    </p>
    
    <div class="signature-section">
      <div class="signature-box">
        <div class="signature-line">
          <div class="signature-name">REGISTRAR'S SIGNATURE</div>
          <div class="signature-title">School Registrar</div>
        </div>
      </div>
      <div class="signature-box">
        <div class="signature-line">
          <div class="signature-name">PRINCIPAL'S SIGNATURE</div>
          <div class="signature-title">School Principal</div>
        </div>
      </div>
    </div>
    
    <p style="text-align: center; font-size: 9pt; margin-top: 15px;">
      Date: ${currentDate}
    </p>
  </div>
</body>
</html>
  `;

  printHTMLContent(htmlContent);
}
