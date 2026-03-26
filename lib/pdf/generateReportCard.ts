import { printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface ReportCardParams {
  schoolId: string;
  studentId: string;
  sectionId: string;
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

interface MonthAttendance {
  label: string;
  present: number;
  absent: number;
  tardy: number;
}

function aggregateAttendance(
  records: Array<{ date: string; status: string }>,
  schoolYear: string,
): MonthAttendance[] {
  const [startYear, endYear] = schoolYear.split("-").map(Number);
  const months = [
    { month: 6, year: startYear, label: "Jun" },
    { month: 7, year: startYear, label: "Jul" },
    { month: 8, year: startYear, label: "Aug" },
    { month: 9, year: startYear, label: "Sep" },
    { month: 10, year: startYear, label: "Oct" },
    { month: 11, year: startYear, label: "Nov" },
    { month: 12, year: startYear, label: "Dec" },
    { month: 1, year: endYear, label: "Jan" },
    { month: 2, year: endYear, label: "Feb" },
    { month: 3, year: endYear, label: "Mar" },
    { month: 4, year: endYear, label: "Apr" },
    { month: 5, year: endYear, label: "May" },
    { month: 6, year: endYear, label: "Jun" },
  ];

  return months.map(({ month, year, label }) => {
    const monthRecords = records.filter((r) => {
      const d = new Date(r.date);
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    });
    return {
      label,
      present: monthRecords.filter((r) => r.status === "present").length,
      absent: monthRecords.filter((r) => r.status === "absent").length,
      tardy: monthRecords.filter((r) => r.status === "tardy").length,
    };
  });
}

export async function generateReportCardPrint(
  params: ReportCardParams,
): Promise<void> {
  const { schoolId, studentId, sectionId, schoolYear } = params;

  // Fetch school
  const { data: school, error: schoolError } = await supabase
    .from("sms_schools")
    .select("id, school_id, name, address, district, region")
    .eq("id", schoolId)
    .single();
  if (schoolError || !school) throw new Error("School not found");

  // Fetch student
  const { data: student, error: studentError } = await supabase
    .from("sms_students")
    .select("*")
    .eq("id", studentId)
    .single();
  if (studentError || !student) throw new Error("Student not found");

  // Fetch section
  const { data: section } = await supabase
    .from("sms_sections")
    .select("id, name, grade_level, section_adviser_id")
    .eq("id", sectionId)
    .single();
  if (!section) throw new Error("Section not found");

  // Fetch adviser name
  let adviserName = "";
  if (section.section_adviser_id) {
    const { data: adviser } = await supabase
      .from("sms_users")
      .select("name")
      .eq("id", section.section_adviser_id)
      .single();
    adviserName = adviser?.name || "";
  }

  // Fetch grades
  const { data: grades } = await supabase
    .from("sms_grades")
    .select("subject_id, grading_period, grade")
    .eq("student_id", studentId)
    .eq("section_id", sectionId)
    .eq("school_year", schoolYear)
    .order("grading_period");

  const subjectIds = [...new Set((grades || []).map((g) => g.subject_id))];
  const subjectMap = new Map<string, string>();
  if (subjectIds.length > 0) {
    const { data: subjects } = await supabase
      .from("sms_subjects")
      .select("id, name")
      .in("id", subjectIds);
    (subjects || []).forEach((s) =>
      subjectMap.set(String(s.id), s.name || "—"),
    );
  }

  // Build grades by subject
  const subjectsMap = new Map<
    string,
    {
      name: string;
      q1: number | null;
      q2: number | null;
      q3: number | null;
      q4: number | null;
    }
  >();
  (grades || []).forEach((g) => {
    const subjId = String(g.subject_id);
    if (!subjectsMap.has(subjId)) {
      subjectsMap.set(subjId, {
        name: subjectMap.get(subjId) || "—",
        q1: null,
        q2: null,
        q3: null,
        q4: null,
      });
    }
    const row = subjectsMap.get(subjId)!;
    if (g.grading_period === 1) row.q1 = g.grade;
    if (g.grading_period === 2) row.q2 = g.grade;
    if (g.grading_period === 3) row.q3 = g.grade;
    if (g.grading_period === 4) row.q4 = g.grade;
  });

  // Fetch attendance
  const { data: attendanceRecords } = await supabase
    .from("sms_attendance")
    .select("date, status")
    .eq("student_id", studentId)
    .eq("section_id", sectionId)
    .eq("school_year", schoolYear);

  const monthlyAttendance = aggregateAttendance(
    attendanceRecords || [],
    schoolYear,
  );

  // Build HTML
  const studentName =
    `${student.last_name}, ${student.first_name} ${student.middle_name || ""} ${student.suffix || ""}`.trim();
  const gradeLabel =
    section.grade_level === -1 ? "SNED" : section.grade_level === 0 ? "Kindergarten" : `Grade ${section.grade_level}`;
  const genderLabel =
    student.gender === "male"
      ? "Male"
      : student.gender === "female"
        ? "Female"
        : "N/A";

  // --- Attendance rows ---
  let attendanceRows = "";
  let totalPresent = 0,
    totalAbsent = 0,
    totalTardy = 0;
  monthlyAttendance.forEach((m) => {
    totalPresent += m.present;
    totalAbsent += m.absent;
    totalTardy += m.tardy;
    attendanceRows += `<tr>
      <td>${m.label}</td>
      <td class="tc"></td>
      <td class="tc">${m.present || ""}</td>
      <td class="tc">${m.absent || ""}</td>
      <td class="tc">${m.tardy || ""}</td>
    </tr>`;
  });
  attendanceRows += `<tr class="total-row">
    <td><strong>Total</strong></td>
    <td class="tc"></td>
    <td class="tc"><strong>${totalPresent || ""}</strong></td>
    <td class="tc"><strong>${totalAbsent || ""}</strong></td>
    <td class="tc"><strong>${totalTardy || ""}</strong></td>
  </tr>`;

  // --- Grade rows ---
  let gradeRows = "";
  const subjectRows = Array.from(subjectsMap.values());
  subjectRows.forEach((row) => {
    const q1 = row.q1 != null ? Math.round(row.q1) : "";
    const q2 = row.q2 != null ? Math.round(row.q2) : "";
    const q3 = row.q3 != null ? Math.round(row.q3) : "";
    const q4 = row.q4 != null ? Math.round(row.q4) : "";
    const all = [row.q1, row.q2, row.q3, row.q4].filter(
      (v): v is number => v != null,
    );
    const finalGrade =
      all.length >= 1
        ? Math.round(all.reduce((a, b) => a + b, 0) / all.length)
        : "";
    const remarks =
      all.length >= 1 ? (all.every((v) => v >= 75) ? "Passed" : "Failed") : "";
    gradeRows += `<tr>
      <td>${row.name}</td>
      <td class="tc">${q1}</td>
      <td class="tc">${q2}</td>
      <td class="tc">${q3}</td>
      <td class="tc">${q4}</td>
      <td class="tc">${finalGrade}</td>
      <td class="tc">${remarks}</td>
    </tr>`;
  });

  // General average
  const subjectFinals = subjectRows
    .map((r) => {
      const all = [r.q1, r.q2, r.q3, r.q4].filter(
        (v): v is number => v != null,
      );
      return all.length >= 1
        ? all.reduce((a, b) => a + b, 0) / all.length
        : null;
    })
    .filter((v): v is number => v != null);
  const generalAverage =
    subjectFinals.length >= 1
      ? Math.round(
          subjectFinals.reduce((a, b) => a + b, 0) / subjectFinals.length,
        )
      : "";
  const generalRemarks =
    subjectFinals.length >= 1
      ? subjectFinals.every((v) => v >= 75)
        ? "Passed"
        : "Failed"
      : "";

  gradeRows += `<tr class="total-row">
    <td><strong>General Average</strong></td>
    <td class="tc" colspan="4"></td>
    <td class="tc"><strong>${generalAverage}</strong></td>
    <td class="tc"><strong>${generalRemarks}</strong></td>
  </tr>`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Report Card - ${studentName}</title>
  <style>
    @page {
      size: 13in 8.5in;
      margin: 0.25in;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Times New Roman", serif;
      font-size: 7.5pt;
      color: #000;
      background: #fff;
    }
    .page {
      width: 100%;
      height: 7.9in;
      display: flex;
      page-break-after: always;
    }
    .page:last-child { page-break-after: auto; }
    .panel {
      width: 33.33%;
      padding: 10px 12px;
      border-right: 1px dashed #ccc;
      overflow: hidden;
    }
    .panel:last-child { border-right: none; }
    .panel-title {
      font-size: 8.5pt;
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
      margin-bottom: 6px;
      border-bottom: 1px solid #000;
      padding-bottom: 3px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 7pt;
    }
    th, td {
      border: 1px solid #000;
      padding: 2px 3px;
    }
    th {
      background-color: #e8e8e8;
      font-weight: bold;
      font-size: 6.5pt;
    }
    .tc { text-align: center; }
    .total-row { background-color: #f5f5f5; }
    .no-border { border: none; }
    .no-border td { border: none; padding: 1px 2px; }

    /* Header in center panel */
    .card-header {
      text-align: center;
      margin-bottom: 6px;
    }
    .card-header img {
      width: 50px;
      height: 50px;
      object-fit: contain;
      vertical-align: middle;
    }
    .header-top {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .header-text {
      font-size: 7pt;
      line-height: 1.3;
    }
    .header-text .school-name {
      font-size: 8pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    .card-title {
      font-size: 9pt;
      font-weight: bold;
      text-transform: uppercase;
      margin: 6px 0 4px;
      letter-spacing: 0.5px;
    }
    .info-block {
      font-size: 7pt;
      margin-bottom: 6px;
    }
    .info-block table td {
      padding: 2px 4px;
      font-size: 7pt;
    }
    .info-label {
      font-weight: bold;
      white-space: nowrap;
    }
    .sig-line {
      border-bottom: 1px solid #000;
      width: 100%;
      display: inline-block;
      min-width: 140px;
    }
    .sig-section {
      margin-top: 4px;
      font-size: 7pt;
      line-height: 1.8;
    }
    .sig-section .quarter-line {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .transfer-section {
      margin-top: 6px;
      font-size: 6.5pt;
      border-top: 1px solid #000;
      padding-top: 4px;
    }

    /* Instructions panel */
    .instructions ol {
      padding-left: 14px;
      font-size: 7pt;
      line-height: 1.5;
    }
    .instructions li {
      margin-bottom: 3px;
    }

    /* Observed values */
    .observed-table th, .observed-table td {
      font-size: 6pt;
      padding: 1.5px 2px;
    }
    .core-value {
      font-weight: bold;
      background-color: #e8e8e8;
    }
    .behavior-stmt { font-size: 5.5pt; }

    /* Descriptors legend */
    .descriptors {
      margin-top: 6px;
      font-size: 6.5pt;
    }
    .descriptors table td {
      font-size: 6.5pt;
      padding: 1px 3px;
    }
    .descriptors .dt-header {
      font-weight: bold;
      text-decoration: underline;
      margin-bottom: 2px;
    }

    /* Right panel page 2 */
    .name-panel {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      padding-top: 20px;
    }
    .name-panel .student-name-display {
      font-size: 10pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    .name-panel .lrn-display {
      font-size: 8pt;
      margin-top: 4px;
    }

    .form-label {
      font-size: 6pt;
      color: #555;
      text-align: right;
      margin-bottom: 2px;
    }

    .purpose-text {
      font-size: 6.5pt;
      text-align: justify;
      margin: 4px 0;
      line-height: 1.4;
    }

    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>

<!-- ==================== PAGE 1: FRONT ==================== -->
<div class="page">

  <!-- LEFT PANEL: Attendance -->
  <div class="panel">
    <div class="form-label">School Form No. 9-A</div>
    <div class="panel-title">Report on Attendance</div>
    <table>
      <thead>
        <tr>
          <th>Month</th>
          <th class="tc" style="font-size:5.5pt;">No. of<br>School<br>Days</th>
          <th class="tc" style="font-size:5.5pt;">Days<br>Present</th>
          <th class="tc" style="font-size:5.5pt;">Days<br>Absent</th>
          <th class="tc" style="font-size:5.5pt;">Times<br>Tardy</th>
        </tr>
      </thead>
      <tbody>
        ${attendanceRows}
      </tbody>
    </table>
  </div>

  <!-- CENTER PANEL: Header + Student Info -->
  <div class="panel">
    <div class="card-header">
      <div class="header-top">
        <img src="/deped_logo_1.png" alt="DepEd" onerror="this.style.display='none'" />
        <div class="header-text">
          <div>Republic of the Philippines</div>
          <div class="school-name">Department of Education</div>
          <div>SCHOOLS DIVISION OF BAYUGAN CITY</div>
        </div>
        <img src="/deped_logo_2.png" alt="DepEd" onerror="this.style.display='none'" />
      </div>
      <div style="font-size:7.5pt;font-weight:bold;text-transform:uppercase;">${school.name}</div>
      <div style="font-size:6.5pt;">School ID: ${school.school_id || ""}</div>
      <div class="card-title">Learner's Progress Report Card</div>
      <div style="font-size:7.5pt;">School Year: ${schoolYear}</div>
    </div>

    <div class="info-block">
      <table class="no-border" style="width:100%;">
        <tr>
          <td class="info-label">Name:</td>
          <td>${studentName}</td>
          <td class="info-label" style="text-align:right;">Sex:</td>
          <td>${genderLabel}</td>
        </tr>
        <tr>
          <td class="info-label">Grade:</td>
          <td>${gradeLabel}</td>
          <td class="info-label" style="text-align:right;">Section:</td>
          <td>${section.name}</td>
        </tr>
        <tr>
          <td class="info-label">LRN:</td>
          <td>${student.lrn}</td>
          <td class="info-label" style="text-align:right;">DOB:</td>
          <td>${formatDate(student.date_of_birth)}</td>
        </tr>
      </table>
    </div>

    <div class="purpose-text">
      This report card shows the ability and progress your child has made in the
      different learning areas as well as his/her core values.
    </div>
    <div class="purpose-text" style="margin-bottom:6px;">
      The school welcomes your desire to know more details about your child's progress.
    </div>

    <div style="font-size:7pt;font-weight:bold;margin-bottom:3px;">PARENT'S/GUARDIAN'S SIGNATURE</div>
    <div class="sig-section">
      <div class="quarter-line"><span>1st Quarter</span> <span class="sig-line" style="min-width:100px;"></span></div>
      <div class="quarter-line"><span>2nd Quarter</span> <span class="sig-line" style="min-width:100px;"></span></div>
      <div class="quarter-line"><span>3rd Quarter</span> <span class="sig-line" style="min-width:100px;"></span></div>
      <div class="quarter-line"><span>4th Quarter</span> <span class="sig-line" style="min-width:100px;"></span></div>
    </div>

    <div style="margin-top:8px;font-size:7pt;">
      <div style="text-align:center;margin-bottom:2px;">
        <strong>${adviserName}</strong>
      </div>
      <div style="text-align:center;border-top:1px solid #000;padding-top:1px;font-size:6.5pt;">Teacher</div>
    </div>

    <div style="margin-top:6px;font-size:7pt;">
      <div style="text-align:center;margin-bottom:2px;">
        <span class="sig-line" style="min-width:160px;"></span>
      </div>
      <div style="text-align:center;font-size:6.5pt;">Principal</div>
    </div>

    <div class="transfer-section">
      <div style="font-weight:bold;margin-bottom:2px;">Certificate of Transfer</div>
      <div>Admitted to Grade: <span class="sig-line" style="min-width:40px;"></span></div>
      <div>Section: <span class="sig-line" style="min-width:80px;"></span></div>
      <div style="margin-top:3px;">Eligibility for Admission to Grade: <span class="sig-line" style="min-width:30px;"></span></div>
      <div style="margin-top:3px;">Approved:</div>
      <div style="margin-top:6px;">
        <span class="sig-line" style="min-width:140px;"></span>
      </div>
      <div style="font-size:6pt;text-align:center;">Teacher</div>
      <div style="margin-top:3px;">Approved:</div>
      <div style="margin-top:6px;">
        <span class="sig-line" style="min-width:140px;"></span>
      </div>
      <div style="font-size:6pt;text-align:center;">Principal</div>
      <div style="margin-top:4px;font-weight:bold;">Cancellation of Eligibility to Transfer</div>
      <div style="margin-top:2px;">Admitted to: <span class="sig-line" style="min-width:80px;"></span></div>
      <div>Date: <span class="sig-line" style="min-width:50px;"></span></div>
      <div style="margin-top:4px;text-align:right;">
        <span class="sig-line" style="min-width:120px;"></span>
      </div>
      <div style="font-size:6pt;text-align:right;">Principal</div>
    </div>
  </div>

  <!-- RIGHT PANEL: Instructions -->
  <div class="panel">
    <div class="panel-title">Instructions</div>
    <div class="instructions">
      <ol>
        <li>Select the sex / gender of the learner on the dropdown menu.</li>
        <li>Select the name of the learner from the list on the dropdown menu.</li>
      </ol>
      <div style="margin-top:8px;font-weight:bold;font-size:6.5pt;">Notes:</div>
      <ul style="padding-left:14px;font-size:6.5pt;line-height:1.5;">
        <li>The list of the learners on the dropdown menu will be based on the selected sex / gender.</li>
      </ul>
    </div>
  </div>

</div>

<!-- ==================== PAGE 2: BACK ==================== -->
<div class="page">

  <!-- LEFT PANEL: Grades -->
  <div class="panel">
    <div class="panel-title">Report on Learning Progress and Achievement</div>
    <table>
      <thead>
        <tr>
          <th>Learning Areas</th>
          <th class="tc">1</th>
          <th class="tc">2</th>
          <th class="tc">3</th>
          <th class="tc">4</th>
          <th class="tc" style="font-size:5.5pt;">Final<br>Grade</th>
          <th class="tc" style="font-size:5.5pt;">Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${gradeRows || '<tr><td colspan="7" class="tc">No grades recorded</td></tr>'}
      </tbody>
    </table>

    <div class="descriptors">
      <table style="margin-top:8px;">
        <thead>
          <tr>
            <th>Descriptors</th>
            <th class="tc">Grading Scale</th>
            <th class="tc">Remarks</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Outstanding</td><td class="tc">90-100</td><td class="tc">Passed</td></tr>
          <tr><td>Very Satisfactory</td><td class="tc">85-89</td><td class="tc">Passed</td></tr>
          <tr><td>Satisfactory</td><td class="tc">80-84</td><td class="tc">Passed</td></tr>
          <tr><td>Fairly Satisfactory</td><td class="tc">75-79</td><td class="tc">Passed</td></tr>
          <tr><td>Did Not Meet Expectations</td><td class="tc">Below 75</td><td class="tc">Failed</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- CENTER PANEL: Observed Values -->
  <div class="panel">
    <div class="panel-title">Report on Learner's Observed Values</div>
    <table class="observed-table">
      <thead>
        <tr>
          <th style="width:18%;">Core Values</th>
          <th>Behavior Statements</th>
          <th class="tc" style="width:8%;">1</th>
          <th class="tc" style="width:8%;">2</th>
          <th class="tc" style="width:8%;">3</th>
          <th class="tc" style="width:8%;">4</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="core-value" rowspan="2">Maka-Diyos</td>
          <td class="behavior-stmt">Expresses one's spiritual beliefs while respecting the spiritual beliefs of others</td>
          <td class="tc"></td><td class="tc"></td><td class="tc"></td><td class="tc"></td>
        </tr>
        <tr>
          <td class="behavior-stmt">Shows adherence to ethical principles by upholding truth in all undertaking</td>
          <td class="tc"></td><td class="tc"></td><td class="tc"></td><td class="tc"></td>
        </tr>
        <tr>
          <td class="core-value" rowspan="2">Makatao</td>
          <td class="behavior-stmt">Is sensitive to individual, social and cultural differences and understanding, respecting diverse people</td>
          <td class="tc"></td><td class="tc"></td><td class="tc"></td><td class="tc"></td>
        </tr>
        <tr>
          <td class="behavior-stmt">Demonstrates contributions toward solidarity</td>
          <td class="tc"></td><td class="tc"></td><td class="tc"></td><td class="tc"></td>
        </tr>
        <tr>
          <td class="core-value">Maka-kalikasan</td>
          <td class="behavior-stmt">Cares for the environment and utilizes resources wisely, judiciously, and economically</td>
          <td class="tc"></td><td class="tc"></td><td class="tc"></td><td class="tc"></td>
        </tr>
        <tr>
          <td class="core-value" rowspan="2">Makabansa</td>
          <td class="behavior-stmt">Demonstrates pride in being a Filipino, exercises the rights and responsibilities of a Filipino citizen</td>
          <td class="tc"></td><td class="tc"></td><td class="tc"></td><td class="tc"></td>
        </tr>
        <tr>
          <td class="behavior-stmt">Demonstrates appropriate behavior in carrying out activities in the school, community and country</td>
          <td class="tc"></td><td class="tc"></td><td class="tc"></td><td class="tc"></td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:8px;">
      <div style="font-weight:bold;font-size:6.5pt;margin-bottom:2px;">OBSERVED VALUES</div>
      <table style="font-size:6pt;">
        <thead>
          <tr>
            <th>Marking</th>
            <th>Non-Numeric Rating</th>
          </tr>
        </thead>
        <tbody>
          <tr><td class="tc">AO</td><td>Always Observed</td></tr>
          <tr><td class="tc">SO</td><td>Sometimes Observed</td></tr>
          <tr><td class="tc">RO</td><td>Rarely Observed</td></tr>
          <tr><td class="tc">NO</td><td>Not Observed</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- RIGHT PANEL: Student Name & LRN -->
  <div class="panel name-panel">
    <div style="font-size:7pt;margin-bottom:4px;">Name: <strong class="student-name-display">${studentName}</strong></div>
    <div style="font-size:7pt;">LRN: <strong>${student.lrn}</strong></div>
  </div>

</div>

</body>
</html>`;

  printHTMLContent(htmlContent);
}
