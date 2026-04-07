import { printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface Sf2Params {
  schoolId: string;
  sectionId: string;
  schoolYear: string;
  month: number; // 1-12
  year: number;
}

interface WeekDays {
  m: number | null;
  t: number | null;
  w: number | null;
  th: number | null;
  f: number | null;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getWeeksForMonth(year: number, month: number): WeekDays[] {
  const daysInMonth = getDaysInMonth(year, month);
  const weeks: WeekDays[] = [];
  let currentWeek: WeekDays = { m: null, t: null, w: null, th: null, f: null };
  let hasDay = false;

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 1 && hasDay) {
      weeks.push(currentWeek);
      currentWeek = { m: null, t: null, w: null, th: null, f: null };
    }
    switch (dow) {
      case 1: currentWeek.m = d; hasDay = true; break;
      case 2: currentWeek.t = d; hasDay = true; break;
      case 3: currentWeek.w = d; hasDay = true; break;
      case 4: currentWeek.th = d; hasDay = true; break;
      case 5: currentWeek.f = d; hasDay = true; break;
    }
  }
  if (hasDay) weeks.push(currentWeek);
  return weeks;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** SF2 - Daily Attendance Report of Learners */
export async function generateSf2Print(params: Sf2Params): Promise<void> {
  const { schoolId, sectionId, schoolYear, month, year } = params;

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

  const schoolName = school?.name || "";
  const schoolIdVal = school?.id || "";
  const sectionName = section?.name || "";
  const gradeLevel = section?.grade_level;
  const gradeLabel = gradeLevel === -1 ? "SNED" : gradeLevel === 0 ? "Kindergarten" : `Grade ${gradeLevel ?? ""}`;

  // Fetch enrolled students
  const { data: enrollments } = await supabase
    .from("sms_enrollments")
    .select("student_id")
    .eq("section_id", sectionId)
    .eq("school_year", schoolYear)
    .eq("status", "approved");

  type Student = {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    gender: string | null;
  };
  let students: Student[] = [];

  if (enrollments && enrollments.length > 0) {
    const studentIds = enrollments.map((e) => e.student_id);
    const { data: studentList } = await supabase
      .from("sms_students")
      .select("id, first_name, middle_name, last_name, suffix, gender")
      .in("id", studentIds)
      .order("last_name")
      .order("first_name");
    students = studentList || [];
  }

  // Build weeks and day slots
  const weeks = getWeeksForMonth(year, month);
  const daySlots: (number | null)[] = [];
  weeks.forEach((w) => {
    daySlots.push(w.m, w.t, w.w, w.th, w.f);
  });

  const mm = String(month).padStart(2, "0");
  const slotDateStr = (d: number | null): string | null => {
    if (d === null) return null;
    return `${year}-${mm}-${String(d).padStart(2, "0")}`;
  };

  const schoolDaysCount = daySlots.filter((d) => d !== null).length;
  const totalDayColumns = weeks.length * 5;

  // Fetch attendance for the entire month
  const startDate = `${year}-${mm}-01`;
  const endDate = `${year}-${mm}-${String(getDaysInMonth(year, month)).padStart(2, "0")}`;

  const { data: attendanceData } = await supabase
    .from("sms_attendance")
    .select("student_id, date, am_present, pm_present")
    .eq("section_id", sectionId)
    .gte("date", startDate)
    .lte("date", endDate);

  // Store numeric day value: 1 = both AM+PM, 0.5 = one period, 0 = neither
  const attendanceMap: Record<string, Record<string, number>> = {};
  if (attendanceData) {
    attendanceData.forEach((a) => {
      if (!attendanceMap[a.student_id]) attendanceMap[a.student_id] = {};
      const am = a.am_present ?? false;
      const pm = a.pm_present ?? false;
      attendanceMap[a.student_id][a.date] = (am ? 0.5 : 0) + (pm ? 0.5 : 0);
    });
  }

  // Separate male / female
  const maleStudents = students.filter((s) => s.gender?.toLowerCase() === "male");
  const femaleStudents = students.filter((s) => s.gender?.toLowerCase() === "female");

  const monthName = MONTH_NAMES[month - 1];

  // ── Week separator helper ──────────────────────────────────────────
  const wsep = (slotIdx: number) => slotIdx % 5 === 0 && slotIdx > 0 ? ' class="wsep"' : "";

  // ── Build student row ──────────────────────────────────────────────
  const buildStudentRow = (s: Student, idx: number): { html: string; absent: number; tardy: number; presentPerDay: number[] } => {
    const fullName = `${s.last_name}, ${s.first_name} ${s.middle_name || ""} ${s.suffix || ""}`.trim();
    const studentAtt = attendanceMap[s.id] || {};
    let totalAbsent = 0;
    let totalTardy = 0;
    let totalPresent = 0;
    const presentPerDay: number[] = [];

    const dayCells = daySlots.map((d, i) => {
      if (d === null) {
        presentPerDay.push(0);
        return `<td${wsep(i)}></td>`;
      }
      const ds = slotDateStr(d)!;
      const sepClass = i % 5 === 0 && i > 0 ? "wsep " : "";
      // No DB row for this day = full day present (matches attendance entry: unchecked = present)
      const value: number = ds in studentAtt ? studentAtt[ds] : 1;
      if (value === 0) {
        totalAbsent++;
        presentPerDay.push(0);
        return `<td class="${sepClass}absent">0</td>`;
      } else if (value === 0.5) {
        totalTardy++;
        totalPresent += 0.5;
        presentPerDay.push(0.5);
        return `<td class="${sepClass}half">0.5</td>`;
      } else {
        // value === 1
        totalPresent += 1;
        presentPerDay.push(1);
        return `<td${wsep(i)}>1</td>`;
      }
    }).join("");

    const html = `<tr>
      <td class="nc">${idx + 1}</td>
      <td class="nm">${fullName}</td>
      ${dayCells}
      <td class="tc">${totalPresent % 1 === 0 ? totalPresent : totalPresent.toFixed(1)}</td>
      <td class="tc">${totalAbsent || ""}</td>
      <td class="rc"></td>
    </tr>`;
    return { html, absent: totalAbsent, tardy: totalTardy, presentPerDay };
  };

  // ── Build rows per gender ──────────────────────────────────────────
  const buildGenderSection = (genderStudents: Student[]) => {
    const rows: string[] = [];
    const dailyTotals = new Array(totalDayColumns).fill(0);
    let totalAbsent = 0;
    let totalPresent = 0;

    genderStudents.forEach((s, idx) => {
      const result = buildStudentRow(s, idx);
      rows.push(result.html);
      totalAbsent += result.absent;
      result.presentPerDay.forEach((v, i) => {
        dailyTotals[i] += v;
        totalPresent += v;
      });
    });

    return { rows, dailyTotals, totalAbsent, totalPresent, count: genderStudents.length };
  };

  const maleSection = buildGenderSection(maleStudents);
  const femaleSection = buildGenderSection(femaleStudents);
  const combinedDailyTotals = daySlots.map((_, i) => maleSection.dailyTotals[i] + femaleSection.dailyTotals[i]);

  const fmtVal = (v: number) => v === 0 ? "" : (v % 1 === 0 ? String(v) : v.toFixed(1));

  // ── Total Per Day row ──────────────────────────────────────────────
  const buildTotalRow = (label: string, dailyTotals: number[], totalAbs: number, totalPresent: number) => {
    const cells = dailyTotals.map((t, i) => {
      const cls = [i % 5 === 0 && i > 0 ? "wsep" : ""].filter(Boolean).join(" ");
      if (daySlots[i] === null) return `<td${cls ? ` class="${cls}"` : ""}></td>`;
      return `<td${cls ? ` class="${cls}"` : ""}>${fmtVal(t)}</td>`;
    }).join("");
    return `<tr class="tpr">
      <td class="nc">⟵</td>
      <td class="nm tpr-label">${label}</td>
      ${cells}
      <td class="tc">${fmtVal(totalPresent)}</td>
      <td class="tc">${totalAbs || ""}</td>
      <td class="rc">⟶</td>
    </tr>`;
  };

  const buildCombinedRow = (dailyTotals: number[], totalAbs: number, totalPresent: number) => {
    const cells = dailyTotals.map((t, i) => {
      const cls = [i % 5 === 0 && i > 0 ? "wsep" : ""].filter(Boolean).join(" ");
      if (daySlots[i] === null) return `<td${cls ? ` class="${cls}"` : ""}></td>`;
      return `<td${cls ? ` class="${cls}"` : ""}>${fmtVal(t)}</td>`;
    }).join("");
    return `<tr class="tpr">
      <td class="nc"></td>
      <td class="nm tpr-label">Combined TOTAL PER DAY</td>
      ${cells}
      <td class="tc">${fmtVal(totalPresent)}</td>
      <td class="tc">${totalAbs || ""}</td>
      <td class="rc"></td>
    </tr>`;
  };

  // ── Header rows ────────────────────────────────────────────────────
  // Row 1: merged "(1st row for date)" with actual date numbers inside
  const dateRow = weeks.map((w, wi) => {
    const days = [w.m, w.t, w.w, w.th, w.f];
    return days.map((d, di) => {
      const sep = wi > 0 && di === 0 ? ' class="wsep"' : "";
      return `<th${sep}>${d !== null ? d : ""}</th>`;
    }).join("");
  }).join("");

  // Row 2: M T W TH F labels
  const dowRow = weeks.map((_, wi) => {
    const labels = ["M", "T", "W", "TH", "F"];
    return labels.map((l, li) => {
      const sep = wi > 0 && li === 0 ? ' class="wsep"' : "";
      return `<th${sep}>${l}</th>`;
    }).join("");
  }).join("");

  // Total columns
  const colCount = 2 + totalDayColumns + 3;

  // Summary values
  const totalMale = maleStudents.length;
  const totalFemale = femaleStudents.length;
  const totalAll = totalMale + totalFemale;

  let totalDailyAttendanceSum = 0;
  let daysWithData = 0;
  combinedDailyTotals.forEach((t, i) => {
    if (daySlots[i] !== null) {
      totalDailyAttendanceSum += t;
      daysWithData++;
    }
  });
  const avgDailyAttendance = daysWithData > 0 ? (totalDailyAttendanceSum / daysWithData).toFixed(1) : "";
  const pctEnrollment = totalAll > 0 ? ((totalAll / totalAll) * 100).toFixed(1) : "";
  const pctAttendance = totalAll > 0 && avgDailyAttendance ? ((Number(avgDailyAttendance) / totalAll) * 100).toFixed(1) : "";

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SF2 - Daily Attendance Report of Learners</title>
  <style>
    @page { size: 13in 8.5in; margin: 0.25in 0.3in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #000; }

    /* Header */
    .sf2-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 4px; }
    .sf2-logo { width: 55px; height: 55px; object-fit: contain; }
    .sf2-header-center { flex: 1; text-align: center; }
    .sf2-header-center .title { font-size: 11pt; font-weight: bold; }
    .sf2-header-center .subtitle { font-size: 7pt; font-style: italic; }

    /* Info rows */
    .info-top { display: flex; border: 1px solid #000; font-size: 8pt; margin-bottom: 0; }
    .info-top .cell { flex: 1; padding: 2px 6px; border-right: 1px solid #000; }
    .info-top .cell:last-child { border-right: none; }
    .info-bot { display: flex; border: 1px solid #000; border-top: none; font-size: 8pt; margin-bottom: 4px; }
    .info-bot .cell { padding: 2px 6px; border-right: 1px solid #000; }
    .info-bot .cell:last-child { border-right: none; }
    .info-bot .cell-school { flex: 2; }
    .info-bot .cell-gl { flex: 1; }
    .info-bot .cell-sec { flex: 1; }

    /* Table */
    .sf2-table { width: 100%; border-collapse: collapse; font-size: 6.5pt; table-layout: fixed; }
    .sf2-table th, .sf2-table td { border: 1px solid #000; padding: 0 1px; text-align: center; vertical-align: middle; height: 13px; }
    .sf2-table thead th { background: none; font-weight: bold; }

    .nc { width: 18px; min-width: 18px; font-size: 6pt; }
    .nm { text-align: left !important; padding-left: 2px !important; font-size: 6.5pt; white-space: nowrap; min-width: 200px; width: 200px; }
    .tc { width: 24px; min-width: 24px; font-size: 6pt; }
    .rc { text-align: left !important; padding-left: 2px !important; font-size: 5.5pt; }
    .wsep { border-left: 2px solid #000 !important; }

    .absent { color: #000; }
    .half { color: #000; }

    /* Total per day rows */
    .tpr td { font-weight: bold; font-size: 6pt; }
    .tpr-label { font-size: 6.5pt !important; font-weight: bold; }

    /* Footer */
    .sf2-footer { page-break-inside: avoid; margin-top: 2px; font-size: 6.5pt; }
    .footer-grid { display: flex; gap: 0; border: 1px solid #000; }
    .footer-col { padding: 4px 5px; border-right: 1px solid #000; vertical-align: top; }
    .footer-col:last-child { border-right: none; }
    .footer-col-guidelines { flex: 2.5; }
    .footer-col-codes { flex: 2.2; }
    .footer-col-summary { flex: 1.8; }
    .footer-col h4 { font-size: 7pt; font-weight: bold; margin-bottom: 2px; text-decoration: underline; }
    .footer-col p, .footer-col div { font-size: 6pt; line-height: 1.3; margin-bottom: 1px; }
    .footer-col .indent { padding-left: 10px; }

    .summary-tbl { width: 100%; border-collapse: collapse; font-size: 6pt; margin-top: 3px; }
    .summary-tbl th, .summary-tbl td { border: 1px solid #000; padding: 1px 2px; text-align: center; }
    .summary-tbl td.lbl { text-align: left; font-weight: normal; }
    .summary-tbl td.val { font-weight: bold; }

    .sig-block { text-align: center; margin-top: 14px; }
    .sig-line { border-top: 1px solid #000; width: 100%; padding-top: 2px; }
    .page-label { font-size: 7pt; margin-top: 4px; }

    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="sf2-header">
    <img src="/deped_logo_1.png" alt="" class="sf2-logo" onerror="this.style.display='none'">
    <div class="sf2-header-center">
      <div class="title">School Form 2 (SF2) Daily Attendance Report of Learners</div>
      <div class="subtitle">(This replaces Form 1, Form 2 &amp; STS Form 4 - Absenteeism and Dropout Profile)</div>
    </div>
    <img src="/deped_logo_2.png" alt="" class="sf2-logo" onerror="this.style.display='none'">
  </div>

  <!-- INFO ROWS -->
  <div class="info-top">
    <div class="cell"><b>School ID</b> ${schoolIdVal}</div>
    <div class="cell"><b>School Year</b> ${schoolYear}</div>
    <div class="cell"><b>Report for the Month of</b> ${monthName} ${year}</div>
  </div>
  <div class="info-bot">
    <div class="cell cell-school"><b>Name of School</b> ${schoolName}</div>
    <div class="cell cell-gl"><b>Grade Level</b> ${gradeLabel}</div>
    <div class="cell cell-sec"><b>Section</b> ${sectionName}</div>
  </div>

  <!-- ATTENDANCE TABLE -->
  <table class="sf2-table">
    <thead>
      <!-- Row 1: Name header (rowspan 2), date numbers, Total for Month, Remarks -->
      <tr>
        <th class="nc" rowspan="2"></th>
        <th rowspan="2" style="text-align:left!important;padding-left:3px!important;font-size:6pt;line-height:1.2;min-width:200px;width:200px">
          LEARNER'S NAME<br><span style="font-weight:normal">(Last Name, First Name, Middle Name)</span>
        </th>
        ${dateRow}
        <th colspan="2" rowspan="1" style="font-size:6pt;line-height:1.1">Total for the Month</th>
        <th class="rc" rowspan="2" style="text-align:center!important;font-size:5pt;line-height:1.1;min-width:140px;width:140px">
          REMARKS <span style="font-weight:normal">(If DROPPED OUT, state reason,<br>please refer to legend number 2.<br>If TRANSFERRED IN/OUT, write the<br>name of School.)</span>
        </th>
      </tr>
      <!-- Row 2: Day-of-week labels, ABSENT/TARDY -->
      <tr>
        ${dowRow}
        <th class="tc" style="font-size:5pt;line-height:1.1">DAYS<br>PRESENT</th>
        <th class="tc" style="font-size:5pt;line-height:1.1">DAYS<br>ABSENT</th>
      </tr>
    </thead>
    <tbody>
      <!-- MALE student rows -->
      ${maleSection.rows.join("")}
      ${buildTotalRow("MALE | TOTAL Per Day", maleSection.dailyTotals, maleSection.totalAbsent, maleSection.totalPresent)}

      <!-- FEMALE student rows -->
      ${femaleSection.rows.join("")}
      ${buildTotalRow("FEMALE | TOTAL Per Day", femaleSection.dailyTotals, femaleSection.totalAbsent, femaleSection.totalPresent)}

      <!-- Combined -->
      ${buildCombinedRow(combinedDailyTotals, maleSection.totalAbsent + femaleSection.totalAbsent, maleSection.totalPresent + femaleSection.totalPresent)}
    </tbody>
  </table>

  <!-- FOOTER -->
  <div class="sf2-footer">
    <div class="footer-grid">
      <!-- GUIDELINES -->
      <div class="footer-col footer-col-guidelines">
        <h4>GUIDELINES:</h4>
        <p>1. The attendance shall be accomplished daily. Refer to the codes for checking learners' attendance.</p>
        <p>2. Dates shall be written in the columns after Learner's Name.</p>
        <p>3. To compute the following:</p>
        <div class="indent">
          <p>a. Percentage of Enrolment = <span style="font-size:5.5pt">Registered Learners as of end of the month / Enrolment as of 1st Friday of the school year × 100</span></p>
          <p>b. Average Daily Attendance = <span style="font-size:5.5pt">Total Daily Attendance / Number of School Days in reporting month</span></p>
          <p>c. Percentage of Attendance for the month = <span style="font-size:5.5pt">Average daily attendance / Registered Learners as of end of the month × 100</span></p>
        </div>
        <p>4. Every end of the month, the class adviser will submit this form to the office of the principal for recording of summary table into School Form 4. Once signed by the principal, this form should be returned to the adviser.</p>
        <p>5. The adviser will provide necessary interventions including but not limited to home visitation to learner/s who were absent for 5 consecutive days and/or those at risk of dropping out.</p>
        <p>6. Attendance performance of learners will be reflected in Form 137 and Form 138 every grading period.</p>
        <p style="font-size:5.5pt;margin-top:2px">* Beginning of School Year cut-off report is every 1st Friday of the School Year</p>
      </div>

      <!-- CODES + REASONS -->
      <div class="footer-col footer-col-codes">
        <h4>1. CODES FOR CHECKING ATTENDANCE</h4>
        <p>(blank) - Present; (✗) - Absent; Tardy (half shaded = Upper for Late Comer, Lower for Cutting Classes)</p>
        <p style="font-size:5.5pt;margin-top:2px;line-height:1.25"><b>Electronic entry (this system):</b> AM/PM periods are recorded in the app; a <b>checked</b> box marks that period <b>absent</b>, <b>unchecked</b> marks it <b>present</b>. This printout shows <b>1</b> = full school day present, <b>0.5</b> = half day present, <b>0</b> = absent. Days with no saved row are treated as full day present (<b>1</b>), consistent with default present in entry.</p>
        <h4 style="margin-top:4px">2. REASONS/CAUSES FOR DROPPING OUT</h4>
        <p><b>a. Domestic-Related Factors</b></p>
        <div class="indent">
          <p>a.1. Had to take care of siblings</p>
          <p>a.2. Early marriage/pregnancy</p>
          <p>a.3. Parents' attitude toward schooling</p>
          <p>a.4. Family problems</p>
        </div>
        <p><b>b. Individual-Related Factors</b></p>
        <div class="indent">
          <p>b.1. Illness &nbsp; b.2. Overage &nbsp; b.3. Death</p>
          <p>b.4. Drug Abuse &nbsp; b.5. Poor academic performance</p>
          <p>b.6. Lack of interest/Distractions</p>
          <p>b.7. Hunger/Malnutrition</p>
        </div>
        <p><b>c. School-Related Factors</b></p>
        <div class="indent">
          <p>c.1. Teacher Factor &nbsp; c.2. Physical condition of classroom &nbsp; c.3. Peer influence</p>
        </div>
        <p><b>d. Geographic/Environmental</b></p>
        <div class="indent">
          <p>d.1. Distance between home and school</p>
          <p>d.2. Armed conflict (incl. Tribal wars &amp; clan feuds)</p>
          <p>d.3. Calamities/Disasters</p>
        </div>
        <p><b>e. Financial-Related</b></p>
        <div class="indent"><p>e.1. Child labor, work</p></div>
        <p><b>f. Others (Specify)</b></p>
      </div>

      <!-- SUMMARY -->
      <div class="footer-col footer-col-summary">
        <table class="summary-tbl">
          <tr><td class="lbl" style="font-weight:bold">Month:</td><td colspan="3">${monthName}</td></tr>
          <tr><td class="lbl" style="font-weight:bold;font-size:5.5pt">No. of Days of Classes:</td><td colspan="3">${schoolDaysCount}</td></tr>
        </table>
        <table class="summary-tbl" style="margin-top:2px">
          <tr><th colspan="2" style="text-align:right;font-size:5pt">Summary</th><th style="width:22px">M</th><th style="width:22px">F</th><th style="width:30px">TOTAL</th></tr>
          <tr><td class="lbl" colspan="2" style="font-size:5pt">* Enrolment as of (1st Friday of June)</td><td class="val">${totalMale}</td><td class="val">${totalFemale}</td><td class="val">${totalAll}</td></tr>
          <tr><td class="lbl" colspan="2" style="font-size:5pt">Enrollment <i>during</i> the month (beyond cut-off)</td><td></td><td></td><td></td></tr>
          <tr><td class="lbl" colspan="2" style="font-size:5pt">Late Enrollment during the month</td><td></td><td></td><td></td></tr>
          <tr><td class="lbl" colspan="2" style="font-size:5pt">Registered Learners as of <i>end of the month</i></td><td class="val">${totalMale}</td><td class="val">${totalFemale}</td><td class="val">${totalAll}</td></tr>
          <tr><td class="lbl" colspan="2" style="font-size:5pt">Percentage of Enrolment as of <i>end of the month</i></td><td colspan="3">${pctEnrollment}%</td></tr>
          <tr><td class="lbl" colspan="2" style="font-size:5pt">Average Daily Attendance</td><td colspan="3">${avgDailyAttendance}</td></tr>
          <tr><td class="lbl" colspan="2" style="font-size:5pt">Percentage of Attendance for the month</td><td colspan="3">${pctAttendance}%</td></tr>
          <tr><td class="lbl" colspan="2" style="font-size:5pt">Number of students absent for 5 consecutive days:</td><td colspan="3"></td></tr>
          <tr><td class="lbl" colspan="2">Drop out</td><td></td><td></td><td></td></tr>
          <tr><td class="lbl" colspan="2">Transferred out</td><td></td><td></td><td></td></tr>
          <tr><td class="lbl" colspan="2">Transferred in</td><td></td><td></td><td></td></tr>
        </table>
        <div style="margin-top:6px;font-size:6pt;font-style:italic">I certify that this is a true and correct report.</div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div style="font-size:5.5pt">(Signature of Teacher over Printed Name)</div>
        </div>
        <div style="margin-top:4px;font-size:6pt">Attested by:</div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div style="font-size:5.5pt">(Signature of School Head over Printed Name)</div>
        </div>
      </div>
    </div>

    <div class="page-label">School Form 2 : Page ___ of ________</div>
  </div>

</body>
</html>`;

  printHTMLContent(htmlContent);
}
