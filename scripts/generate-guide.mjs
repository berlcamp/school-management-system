/**
 * SMS System Guide PDF Generator
 * Generates GUIDE.pdf — a comprehensive manual for the School Management System
 *
 * Usage: node scripts/generate-guide.mjs
 */

import { jsPDF } from "jspdf";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(__dirname, "..", "GUIDE.pdf");

// ─── Layout constants ─────────────────────────────────────────────────────────
const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const M_LEFT = 20;
const M_RIGHT = 20;
const M_TOP = 20;
const M_BOTTOM = 20;
const CONTENT_W = PAGE_W - M_LEFT - M_RIGHT;
const USABLE_H = PAGE_H - M_TOP - M_BOTTOM;

// Colors
const C_PRIMARY = [25, 66, 138]; // dark blue
const C_SECONDARY = [55, 120, 190]; // medium blue
const C_ACCENT = [34, 139, 94]; // green
const C_LIGHT_BG = [240, 245, 252]; // light blue bg
const C_DARK = [30, 30, 30];
const C_MUTED = [100, 100, 100];
const C_WHITE = [255, 255, 255];
const C_BORDER = [200, 210, 225];
const C_HIGHLIGHT = [255, 248, 220]; // light yellow

// ─── Helper class ──────────────────────────────────────────────────────────────
class GuideBuilder {
  constructor() {
    this.doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    this.y = M_TOP;
    this.pageNum = 0;
    this.tocEntries = [];
    this.currentChapter = 0;
  }

  // ─── Page management ───────────────────────────────────────────────
  ensureSpace(needed) {
    if (this.y + needed > PAGE_H - M_BOTTOM) {
      this.newPage();
    }
  }

  newPage() {
    this.doc.addPage();
    this.pageNum++;
    this.y = M_TOP;
    this._drawPageFooter();
  }

  _drawPageFooter() {
    this.doc.setFontSize(8);
    this.doc.setTextColor(...C_MUTED);
    this.doc.setFont("helvetica", "normal");
    this.doc.text(
      `SMS System Guide  |  Schools Division of Bayugan City  |  Page ${this.pageNum + 1}`,
      PAGE_W / 2,
      PAGE_H - 10,
      { align: "center" }
    );
  }

  // ─── Drawing primitives ────────────────────────────────────────────
  setColor(rgb) {
    this.doc.setTextColor(...rgb);
  }

  drawLine(y, color = C_BORDER) {
    this.doc.setDrawColor(...color);
    this.doc.setLineWidth(0.3);
    this.doc.line(M_LEFT, y, PAGE_W - M_RIGHT, y);
  }

  drawRect(x, y, w, h, fillColor, borderColor) {
    if (fillColor) {
      this.doc.setFillColor(...fillColor);
    }
    if (borderColor) {
      this.doc.setDrawColor(...borderColor);
      this.doc.setLineWidth(0.3);
      this.doc.roundedRect(x, y, w, h, 2, 2, fillColor ? "FD" : "D");
    } else if (fillColor) {
      this.doc.roundedRect(x, y, w, h, 2, 2, "F");
    }
  }

  // ─── Text helpers ──────────────────────────────────────────────────
  writeText(text, opts = {}) {
    const {
      size = 10,
      color = C_DARK,
      font = "helvetica",
      style = "normal",
      indent = 0,
      lineHeight = 1.4,
      maxWidth = CONTENT_W,
      align = "left",
    } = opts;

    this.doc.setFont(font, style);
    this.doc.setFontSize(size);
    this.setColor(color);

    const effectiveW = maxWidth - indent;
    const lines = this.doc.splitTextToSize(text, effectiveW);
    const lineH = (size * lineHeight * 0.352778); // pt to mm

    for (const line of lines) {
      this.ensureSpace(lineH + 1);
      if (align === "center") {
        this.doc.text(line, PAGE_W / 2, this.y, { align: "center" });
      } else {
        this.doc.text(line, M_LEFT + indent, this.y);
      }
      this.y += lineH;
    }
  }

  // ─── Structural elements ───────────────────────────────────────────
  chapterTitle(title) {
    this.currentChapter++;
    this.newPage();
    this.tocEntries.push({
      level: 0,
      title: `Chapter ${this.currentChapter}: ${title}`,
      page: this.pageNum + 1,
    });

    // Chapter band
    this.drawRect(M_LEFT, this.y - 4, CONTENT_W, 18, C_PRIMARY);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10);
    this.setColor(C_SECONDARY);
    this.doc.text(`CHAPTER ${this.currentChapter}`, M_LEFT + 8, this.y + 2);
    this.doc.setFontSize(16);
    this.setColor(C_WHITE);
    this.doc.text(title.toUpperCase(), M_LEFT + 8, this.y + 10);
    this.y += 22;
    this.drawLine(this.y, C_SECONDARY);
    this.y += 6;
  }

  sectionTitle(title) {
    this.ensureSpace(14);
    this.tocEntries.push({
      level: 1,
      title,
      page: this.pageNum + 1,
    });
    this.y += 3;
    this.drawRect(M_LEFT, this.y - 4, 3, 10, C_SECONDARY);
    this.writeText(title, { size: 12, style: "bold", color: C_PRIMARY, indent: 6 });
    this.y += 2;
  }

  subSection(title) {
    this.ensureSpace(10);
    this.y += 2;
    this.writeText(title, { size: 10, style: "bold", color: C_SECONDARY, indent: 4 });
    this.y += 1;
  }

  para(text, opts = {}) {
    this.writeText(text, { size: 9.5, color: C_DARK, indent: opts.indent || 0, ...opts });
    this.y += 2;
  }

  bullet(text, indent = 6) {
    this.ensureSpace(6);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9.5);
    this.setColor(C_SECONDARY);
    this.doc.text("\u2022", M_LEFT + indent, this.y);
    this.setColor(C_DARK);
    const lines = this.doc.splitTextToSize(text, CONTENT_W - indent - 5);
    const lh = 9.5 * 1.4 * 0.352778;
    for (let i = 0; i < lines.length; i++) {
      this.ensureSpace(lh + 1);
      this.doc.text(lines[i], M_LEFT + indent + 4, this.y);
      this.y += lh;
    }
    this.y += 1;
  }

  numberedItem(num, text, indent = 6) {
    this.ensureSpace(6);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9.5);
    this.setColor(C_ACCENT);
    this.doc.text(`${num}.`, M_LEFT + indent, this.y);
    this.doc.setFont("helvetica", "normal");
    this.setColor(C_DARK);
    const lines = this.doc.splitTextToSize(text, CONTENT_W - indent - 8);
    const lh = 9.5 * 1.4 * 0.352778;
    for (let i = 0; i < lines.length; i++) {
      this.ensureSpace(lh + 1);
      this.doc.text(lines[i], M_LEFT + indent + 7, this.y);
      this.y += lh;
    }
    this.y += 1;
  }

  infoBox(title, text) {
    this.ensureSpace(20);
    const lines = this.doc.splitTextToSize(text, CONTENT_W - 16);
    const boxH = 10 + lines.length * 4;
    this.drawRect(M_LEFT + 2, this.y - 2, CONTENT_W - 4, boxH, C_HIGHLIGHT, C_BORDER);
    this.y += 2;
    this.writeText(title, { size: 9, style: "bold", color: C_ACCENT, indent: 6 });
    for (const line of lines) {
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8.5);
      this.setColor(C_MUTED);
      this.doc.text(line, M_LEFT + 6, this.y);
      this.y += 3.8;
    }
    this.y += 4;
  }

  // simple table: headers[] and rows[][]
  simpleTable(headers, rows, opts = {}) {
    const { colWidths, indent = 0 } = opts;
    const startX = M_LEFT + indent;
    const totalW = colWidths
      ? colWidths.reduce((a, b) => a + b, 0)
      : CONTENT_W - indent;
    const cw = colWidths || headers.map(() => totalW / headers.length);
    const rowH = 6;

    // header
    this.ensureSpace(rowH + 2);
    this.drawRect(startX, this.y - 3.5, totalW, rowH, C_PRIMARY);
    let cx = startX + 2;
    for (let i = 0; i < headers.length; i++) {
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(8);
      this.setColor(C_WHITE);
      this.doc.text(headers[i], cx, this.y);
      cx += cw[i];
    }
    this.y += rowH - 1;

    // rows
    for (let r = 0; r < rows.length; r++) {
      this.ensureSpace(rowH + 1);
      if (r % 2 === 0) {
        this.drawRect(startX, this.y - 3.5, totalW, rowH, C_LIGHT_BG);
      }
      cx = startX + 2;
      for (let c = 0; c < rows[r].length; c++) {
        this.doc.setFont("helvetica", "normal");
        this.doc.setFontSize(8);
        this.setColor(C_DARK);
        const cellText = String(rows[r][c]);
        const truncated = this.doc.splitTextToSize(cellText, cw[c] - 4)[0];
        this.doc.text(truncated, cx, this.y);
        cx += cw[c];
      }
      this.y += rowH - 1;
    }
    this.y += 4;
  }

  // Arrow flow diagram (simple vertical)
  flowDiagram(steps) {
    const boxW = CONTENT_W - 20;
    const boxH = 10;
    const gap = 4;
    const arrowH = 6;
    const startX = M_LEFT + 10;

    for (let i = 0; i < steps.length; i++) {
      const needed = boxH + (i < steps.length - 1 ? arrowH + gap : 0);
      this.ensureSpace(needed + 2);

      // Box
      this.drawRect(startX, this.y, boxW, boxH, C_LIGHT_BG, C_SECONDARY);
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(8.5);
      this.setColor(C_PRIMARY);

      const stepLabel = `Step ${i + 1}: `;
      this.doc.text(stepLabel, startX + 4, this.y + 4);
      const labelW = this.doc.getTextWidth(stepLabel);

      this.doc.setFont("helvetica", "normal");
      this.setColor(C_DARK);
      const remaining = this.doc.splitTextToSize(steps[i], boxW - labelW - 10)[0];
      this.doc.text(remaining, startX + 4 + labelW, this.y + 4);

      this.y += boxH;

      // Arrow
      if (i < steps.length - 1) {
        const midX = startX + boxW / 2;
        this.doc.setDrawColor(...C_SECONDARY);
        this.doc.setLineWidth(0.5);
        this.doc.line(midX, this.y, midX, this.y + arrowH);
        // arrowhead
        this.doc.setFillColor(...C_SECONDARY);
        this.doc.triangle(
          midX - 2, this.y + arrowH - 2,
          midX + 2, this.y + arrowH - 2,
          midX, this.y + arrowH,
          "F"
        );
        this.y += arrowH + gap;
      }
    }
    this.y += 4;
  }

  // ─── Table of contents ─────────────────────────────────────────────
  buildToc() {
    // We'll insert TOC at page 2 (after cover)
    // For simplicity we build it at the end then note pages shifted
    // jsPDF doesn't support insert-before, so we append a note
    // Actually, let's just add TOC pages after cover using the entries we collected
  }

  // ─── Cover page ────────────────────────────────────────────────────
  coverPage() {
    this.pageNum = 0;

    // full page bg
    this.doc.setFillColor(...C_PRIMARY);
    this.doc.rect(0, 0, PAGE_W, PAGE_H, "F");

    // Decorative band
    this.doc.setFillColor(255, 255, 255, 0.08);
    this.doc.setGState(new this.doc.GState({ opacity: 0.08 }));
    this.doc.rect(0, 80, PAGE_W, 120, "F");
    this.doc.setGState(new this.doc.GState({ opacity: 1 }));

    // Title block
    this.y = 70;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(12);
    this.setColor(C_WHITE);
    this.doc.text("Schools Division of Bayugan City", PAGE_W / 2, this.y, {
      align: "center",
    });
    this.y += 8;

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(32);
    this.doc.text("SCHOOL MANAGEMENT", PAGE_W / 2, this.y, { align: "center" });
    this.y += 12;
    this.doc.text("SYSTEM", PAGE_W / 2, this.y, { align: "center" });
    this.y += 16;

    // Subtitle
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(14);
    this.doc.text("System Guide & User Manual", PAGE_W / 2, this.y, {
      align: "center",
    });
    this.y += 30;

    // Divider line
    this.doc.setDrawColor(255, 255, 255);
    this.doc.setLineWidth(0.5);
    this.doc.line(60, this.y, PAGE_W - 60, this.y);
    this.y += 12;

    // Info grid
    const infoItems = [
      ["Version", "1.0"],
      ["Date", "April 2026"],
      ["Platform", "Web Application (Next.js)"],
      ["Database", "Supabase (PostgreSQL)"],
    ];

    this.doc.setFontSize(10);
    for (const [label, value] of infoItems) {
      this.doc.setFont("helvetica", "normal");
      this.setColor([180, 200, 230]);
      this.doc.text(label + ":", PAGE_W / 2 - 25, this.y, { align: "right" });
      this.doc.setFont("helvetica", "bold");
      this.setColor(C_WHITE);
      this.doc.text(value, PAGE_W / 2 - 20, this.y);
      this.y += 7;
    }

    // Footer
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8);
    this.setColor([180, 200, 230]);
    this.doc.text(
      "Department of Education  \u2022  Schools Division of Bayugan City",
      PAGE_W / 2,
      PAGE_H - 20,
      { align: "center" }
    );

    this._drawPageFooter();
  }

  // ─── Build the full guide ──────────────────────────────────────────
  build() {
    this.coverPage();
    this.chapter1_Overview();
    this.chapter2_GettingStarted();
    this.chapter3_SchoolSetup();
    this.chapter4_AcademicStructure();
    this.chapter5_Enrollment();
    this.chapter6_TeacherModule();
    this.chapter7_GradesAndAssessments();
    this.chapter8_Attendance();
    this.chapter9_LearnerHealth();
    this.chapter10_Books();
    this.chapter11_Reports();
    this.chapter12_Evaluations();
    this.chapter13_TransferWorkflow();
    this.chapter14_RecordRequests();
    this.chapter15_StudentPortal();
    this.chapter16_PublicPages();
    this.chapter17_DivisionAdmin();
    this.chapter18_SettingsConfig();

    // Insert TOC after cover
    this._insertToc();

    return this;
  }

  _insertToc() {
    // We add TOC pages at the end and note them
    // jsPDF doesn't allow page insertion, so we use a workaround:
    // we regenerate with TOC. For simplicity, we add TOC as final pages
    // with a clear label.

    this.newPage();
    // TOC header
    this.drawRect(M_LEFT, this.y - 4, CONTENT_W, 14, C_PRIMARY);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(16);
    this.setColor(C_WHITE);
    this.doc.text("TABLE OF CONTENTS", M_LEFT + 8, this.y + 6);
    this.y += 18;

    for (const entry of this.tocEntries) {
      this.ensureSpace(7);
      const isChapter = entry.level === 0;
      this.doc.setFont("helvetica", isChapter ? "bold" : "normal");
      this.doc.setFontSize(isChapter ? 10 : 9);
      this.setColor(isChapter ? C_PRIMARY : C_DARK);

      const indent = isChapter ? 0 : 8;
      const label = entry.title;
      const pageStr = String(entry.page);

      this.doc.text(label, M_LEFT + indent, this.y);
      this.doc.text(pageStr, PAGE_W - M_RIGHT - 2, this.y, { align: "right" });

      if (isChapter) {
        this.y += 5.5;
      } else {
        this.y += 4.5;
      }
    }
  }

  save() {
    const buf = this.doc.output("arraybuffer");
    fs.writeFileSync(OUTPUT, Buffer.from(buf));
    console.log(`Guide saved to ${OUTPUT} (${Math.round(fs.statSync(OUTPUT).size / 1024)} KB)`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHAPTERS
  // ═══════════════════════════════════════════════════════════════════

  chapter1_Overview() {
    this.chapterTitle("System Overview");

    this.sectionTitle("What is the School Management System?");
    this.para(
      "The School Management System (SMS) is a comprehensive web-based application built for the Schools Division of Bayugan City under the Department of Education (DepEd). It manages the complete lifecycle of school operations including enrollment, academic records, attendance, learner health, book inventory, staff management, evaluations, and official DepEd School Forms (SF1\u2013SF10)."
    );

    this.sectionTitle("User Roles");
    this.simpleTable(
      ["Role", "Access Level", "Description"],
      [
        ["School Head", "Full school", "Principal \u2014 manages school settings, staff, all modules"],
        ["Admin", "Full school", "School-level administrative staff"],
        ["Registrar", "Full school", "Records management, enrollment processing, SF10 encoding"],
        ["Librarian", "Books module", "Book allocations, issuances, returns"],
        ["Teacher", "Restricted", "Own sections, grade entry, books, ECCD, evaluations"],
        ["Division Admin", "All schools", "Manages schools & users across the division"],
        ["Super Admin", "Full access", "System-wide administration"],
        ["Student", "Portal only", "Read-only grades, evaluations (LRN + DOB auth)"],
      ],
      { colWidths: [30, 25, 115] }
    );

    this.sectionTitle("Main Modules");
    this.simpleTable(
      ["Module", "Purpose"],
      [
        ["Enrollment", "Register new, existing, and transferee students"],
        ["Students", "Student registry, profiles, search"],
        ["Sections", "Class groupings by grade level and school year"],
        ["Subjects", "Academic courses per grade level"],
        ["Schedules", "Time slots \u2014 subjects, teachers, rooms, sections"],
        ["Attendance", "Monthly AM/PM daily attendance (SF2)"],
        ["Learner Health", "Height, weight, nutritional status (SF8)"],
        ["Books", "Allocations, issuances, returns tracking"],
        ["Staff", "Staff member management"],
        ["Rooms", "Room/facility management"],
        ["Evaluations", "Student-to-teacher & teacher-to-principal evaluations"],
        ["Reports", "DepEd School Forms SF1\u2013SF10 generation"],
        ["Manage Requests", "Transfer approvals & document requests"],
        ["Settings", "School configuration, locks, principal info, ECCD"],
        ["Student Portal", "Student-facing grades & evaluation portal"],
        ["Division Admin", "School & user management across the division"],
      ],
      { colWidths: [35, 135] }
    );

    this.sectionTitle("Technology Stack");
    this.simpleTable(
      ["Layer", "Technology"],
      [
        ["Framework", "Next.js (App Router)"],
        ["Frontend", "React, Tailwind CSS, shadcn/ui (Radix UI)"],
        ["Backend/DB", "Supabase (PostgreSQL + Auth)"],
        ["State", "Redux Toolkit"],
        ["Forms", "React Hook Form + Zod validation"],
        ["Auth (Staff)", "Supabase Auth"],
        ["Auth (Students)", "JWT cookie via jose (LRN + DOB)"],
        ["PDF Generation", "jsPDF"],
        ["Excel Export", "xlsx"],
      ],
      { colWidths: [35, 135] }
    );
  }

  chapter2_GettingStarted() {
    this.chapterTitle("Getting Started");

    this.sectionTitle("System Access");
    this.para(
      "The SMS is accessed through a web browser. Staff members log in using their email credentials via Supabase Auth. Students access a separate portal using their LRN and date of birth. Public users can browse schools, view enrollment statistics, and submit document requests without authentication."
    );

    this.sectionTitle("Authentication Flows");

    this.subSection("Staff Login");
    this.flowDiagram([
      "Staff navigates to the login page",
      "Enters email and password (Supabase Auth)",
      "AuthGuard checks session and looks up sms_users record",
      "User data (type, school_id) loaded into Redux store",
      "Redirected to role-appropriate dashboard",
    ]);

    this.subSection("Student Portal Login");
    this.flowDiagram([
      "Student navigates to /student-portal",
      "Enters LRN and Date of Birth",
      "Server action verifies against sms_students table",
      "JWT cookie set (24-hour expiry)",
      "Redirected to student dashboard",
    ]);

    this.sectionTitle("Navigation");
    this.para(
      "The sidebar provides role-based navigation. Staff users see all modules relevant to their role. Teachers see a dedicated Teacher Menu with sections, grades, books, and evaluations. Division admins see the Division menu for managing schools and users across the division."
    );

    this.infoBox(
      "Tip: SchoolIdGuard",
      "All school-scoped users must have a school_id assigned. Only division_admin users can operate without one. If a user lacks school_id, they will be blocked by the SchoolIdGuard component."
    );
  }

  chapter3_SchoolSetup() {
    this.chapterTitle("Initial School Setup");

    this.sectionTitle("Setup Workflow Overview");
    this.para(
      "Setting up a school in the SMS follows a structured process. The Division Admin creates the school and assigns users. Then the School Head configures school settings."
    );

    this.flowDiagram([
      "Division Admin creates the school record (school ID, name, type, contact info)",
      "Division Admin creates user accounts and assigns them to the school",
      "School Head logs in and configures school settings",
      "Admin/Registrar creates subjects for each grade level",
      "Admin/Registrar creates sections for the current school year",
      "Admin/Registrar creates schedules linking subjects to sections with teachers and rooms",
      "Enrollment can begin \u2014 students are enrolled into sections",
    ]);

    this.sectionTitle("Phase 1: Create the School (Division Admin)");
    this.para("Navigate to Division > Schools and click 'Add School'. Fill in the following:");
    this.simpleTable(
      ["Field", "Required", "Description"],
      [
        ["School ID", "Yes", "DepEd 6-digit code (immutable after creation)"],
        ["School Name", "Yes", "Official school name"],
        ["School Type", "No", "elementary, junior_high, senior_high, complete_secondary, integrated"],
        ["Address", "No", "Full street address"],
        ["District", "No", "North, South, East, West, Central"],
        ["Municipality/City", "No", "City or municipality name"],
        ["Region", "No", "Region identifier"],
        ["Email", "No", "School email address"],
        ["Phone Numbers", "No", "Landline and mobile numbers"],
        ["Facebook URL", "No", "School Facebook page URL"],
      ],
      { colWidths: [30, 18, 122] }
    );

    this.sectionTitle("Phase 2: Create Users (Division Admin)");
    this.para("Navigate to Division > Users and click 'Add User' for each staff member.");
    this.simpleTable(
      ["Field", "Required", "Description"],
      [
        ["School", "Yes", "Select the school (dropdown of active schools)"],
        ["Name", "Yes", "Full name of the staff member"],
        ["Email", "Yes", "Unique email (used for login)"],
        ["User Type", "Yes", "school_head, teacher, registrar, admin, or librarian"],
        ["Employee ID", "No", "Optional employee identification number"],
      ],
      { colWidths: [30, 18, 122] }
    );

    this.sectionTitle("Phase 3: Configure Settings (School Head)");
    this.para(
      "Once the School Head logs in, navigate to Settings (now labeled 'School') to configure:"
    );
    this.bullet("Record Editing Controls \u2014 Toggle whether previous school year records and promoted student grades can be edited");
    this.bullet("Promotion Deadline \u2014 Set a cutoff date after which the Promote button is disabled");
    this.bullet("School Principal \u2014 Enter the principal's name and title (used as signatories on report cards and official forms)");
    this.bullet("ECCD Settings \u2014 For schools with Kindergarten: configure assessment domains, competencies, and scale score mappings");
  }

  chapter4_AcademicStructure() {
    this.chapterTitle("Academic Structure");

    this.sectionTitle("Subjects");
    this.para(
      "Subjects represent academic courses at specific grade levels. They form the foundation of the scheduling and grading system."
    );
    this.para("Navigate to Subjects module to manage. Each subject has:");
    this.bullet("Code \u2014 Unique identifier (e.g., MATH-101), auto-uppercase");
    this.bullet("Name \u2014 Full subject name (e.g., Mathematics)");
    this.bullet("Grade Level \u2014 Which grade this subject belongs to (K through 12, or SNED)");
    this.bullet("Is Graded \u2014 Whether the subject appears in grade entry (uncheck for non-graded subjects)");
    this.bullet("Is Madrasah (MEP) \u2014 Islamic/religious education subjects with selective enrollment");

    this.infoBox(
      "Protection Rule",
      "If a subject has existing schedules, its grade level cannot be changed. If it has grades or schedules, it will be soft-deleted (deactivated) instead of hard-deleted."
    );

    this.sectionTitle("Sections");
    this.para(
      "Sections are class groupings (e.g., 'Grade 7-A'). Students are enrolled into sections for a specific school year."
    );
    this.bullet("Section Name \u2014 Descriptive name for the class");
    this.bullet("Grade Level \u2014 Matching grade level (must align with subjects)");
    this.bullet("School Year \u2014 Academic year (e.g., 2025-2026)");
    this.bullet("Section Type \u2014 heterogeneous, homogeneous_fast_learner, homogeneous_crack_section, or homogeneous_random");
    this.bullet("Section Adviser \u2014 The assigned teacher (determines who manages this section)");
    this.bullet("Max Students \u2014 Optional capacity limit");

    this.infoBox(
      "Protection Rule",
      "Grade level and school year become immutable once the section has enrolled students or assigned schedules. Sections with enrolled students cannot be deleted."
    );

    this.sectionTitle("Schedules");
    this.para(
      "Schedules link subjects to sections, assigning teachers, rooms, days, and times. They are the operational backbone of the school."
    );

    this.subSection("Creating a Schedule");
    this.para("There are two ways to create schedules:");
    this.numberedItem(1, "From the Schedules module directly \u2014 select subject, section, teacher, room, days, and times");
    this.numberedItem(2, "From the Sections page \u2014 click 'View Subjects' on a section, then 'Add Schedule' on a specific subject (subject and section are pre-filled and locked)");

    this.subSection("Conflict Detection");
    this.para(
      "The system performs real-time conflict detection at both client-side and database-trigger level. Three types of conflicts are checked:"
    );
    this.bullet("Room Conflict \u2014 Room already booked at the same time and day");
    this.bullet("Teacher Conflict \u2014 Teacher already teaching at the same time and day");
    this.bullet("Section Conflict \u2014 Section already has a class at the same time and day");

    this.subSection("Schedule Views");
    this.para("Schedules can be viewed in two modes:");
    this.bullet("Table View \u2014 Paginated list with filters (section, teacher, room, school year)");
    this.bullet("Calendar View \u2014 Visual calendar layout showing all schedules for the selected school year");
  }

  chapter5_Enrollment() {
    this.chapterTitle("Enrollment");

    this.sectionTitle("Enrollment Wizard");
    this.para(
      "The Enrollment Wizard is the core component for registering students. It supports three entry modes based on LRN lookup results."
    );

    this.subSection("Entry Mode Detection");
    this.flowDiagram([
      "User enters student LRN (minimum 4 characters)",
      "System performs debounced lookup (500ms) via lookup_student_by_lrn RPC",
      "No record found \u2192 'New Student' mode (full form required)",
      "Record found at same school \u2192 'Existing Student' mode (re-enrollment)",
      "Record found at different school \u2192 'Transferee' mode (triggers record request)",
    ]);

    this.sectionTitle("Wizard Steps by Grade Level");
    this.simpleTable(
      ["Grade Level", "Step 1", "Step 2", "Step 3"],
      [
        ["Grades 1\u201312", "Student Record", "Enrollment Details", "\u2014"],
        ["Kindergarten (K)", "Student Record", "Enrollment Details", "ECCD Checklist"],
        ["SNED (Special Ed)", "Student Record", "Enrollment Details", "Disability Information"],
      ],
      { colWidths: [35, 40, 45, 50] }
    );

    this.sectionTitle("Step 1: Student Record (New Students)");
    this.para("Required fields for new students:");
    this.bullet("LRN (Learner Reference Number)");
    this.bullet("Full name (first, middle, last, suffix)");
    this.bullet("Date of birth, Gender");
    this.bullet("Demographics: mother tongue, IP/ethnic group, religion");
    this.bullet("Address: purok, barangay, municipality, province");
    this.bullet("Contact information, Parent/guardian details");
    this.bullet("Document uploads: birth certificate, good moral (PDF/JPG/PNG)");

    this.sectionTitle("Step 2: Enrollment Details");
    this.para("Select the grade level, school year, and section for enrollment.");

    this.subSection("Smart Section Suggestion");
    this.para(
      "The system provides intelligent section recommendations using a weighted scoring algorithm:"
    );
    this.bullet("Section Type Match (40%) \u2014 Matches student GPA to section type");
    this.bullet("Gender Balance (25-30%) \u2014 Aims for 50-50 male/female split");
    this.bullet("GPA Distribution (20%) \u2014 Heterogeneous sections aim for equal thirds; homogeneous prefer clustering");
    this.bullet("Capacity Availability (15%) \u2014 Emptier sections score higher");

    this.sectionTitle("Step 3: ECCD Checklist (Kindergarten Only)");
    this.para(
      "For Kindergarten enrollees, an optional ECCD (Early Childhood Care and Development) checklist is presented. Teachers check competencies the student has demonstrated. This data is saved for the 1st semester assessment period."
    );

    this.sectionTitle("Step 3: Disability Info (SNED Only)");
    this.para(
      "For SNED (Special Education) enrollees, a multi-select list of disability categories is shown, aligned with DepEd classification standards."
    );

    this.sectionTitle("Enrollment Statuses");
    this.simpleTable(
      ["Status", "Meaning"],
      [
        ["active", "Currently enrolled and attending"],
        ["promoted", "Advanced to next grade level"],
        ["graduated", "Completed final grade level (6, 10, or 12)"],
        ["completed", "School year finished, no action taken"],
        ["retained", "Staying in same grade level"],
        ["dropped", "Formally dropped (NLIS)"],
        ["transferred_out", "Left for another school"],
        ["pending_transfer", "Transfer in progress"],
        ["pending_review", "Transferee awaiting record review"],
      ],
      { colWidths: [35, 135] }
    );
  }

  chapter6_TeacherModule() {
    this.chapterTitle("Teacher Module");

    this.sectionTitle("Overview");
    this.para(
      "Teachers have a dedicated interface with restricted access to their own sections, subjects, and students. The teacher module is accessible from the Teacher Menu in the sidebar."
    );

    this.sectionTitle("Teacher Dashboard");
    this.para("The dashboard shows four KPI cards:");
    this.bullet("Sections you manage (as adviser)");
    this.bullet("Subjects you teach (from schedules)");
    this.bullet("Total students across all sections");
    this.bullet("Current school year");

    this.sectionTitle("My Sections");
    this.para(
      "Shows sections where the teacher is the assigned section adviser. Clicking a section opens a detailed view with:"
    );
    this.bullet("Student roster with enrollment status badges and gender filter");
    this.bullet("Student actions: Edit, Print Card, Promote, Retain/NLIS, Transfer Out");
    this.bullet("Subject schedules with teacher and room assignments");
    this.bullet("Quick links to: School Forms, Attendance, Learner Health, ECCD Checklist (K only)");
    this.bullet("Export student list to Excel");

    this.subSection("Student Management Actions");
    this.simpleTable(
      ["Action", "Available When", "Description"],
      [
        ["Edit", "Not terminal status", "Modify student personal info"],
        ["Print Card", "Always", "Generate report card (PDF) or ECCD card (K)"],
        ["Promote", "Status = active", "Advance to next grade (or Graduate for terminal grades 6, 10, 12)"],
        ["Retain/NLIS", "Status = active", "Mark as retained or NLIS/dropped"],
        ["Transfer Out", "Status = active", "Initiate transfer to another school"],
      ],
      { colWidths: [28, 32, 110] }
    );

    this.sectionTitle("My Subjects");
    this.para(
      "Lists all subjects the teacher teaches (from sms_subject_schedules). Displayed as cards with section name, filterable by school year and grade level."
    );

    this.sectionTitle("My Students");
    this.para(
      "Aggregated view of all students the teacher interacts with, combining students from adviser sections and teaching schedules. Filterable by section, subject, and school year."
    );

    this.sectionTitle("Books (Teacher)");
    this.para("Teachers have three book-related pages:");
    this.numberedItem(1, "My Allocated Books \u2014 View books allocated by the book manager (quantity, status)");
    this.numberedItem(2, "Issue Books \u2014 Issue allocated books to students in their sections");
    this.numberedItem(3, "Return to Manager \u2014 Return held books back to the book manager for processing");

    this.sectionTitle("Teacher Evaluations");
    this.para(
      "Teachers can submit evaluations of the school principal. Each evaluation contains Likert-scale questions (1\u20135 stars). Teachers select an active evaluation, rate each question, and submit. Duplicate submissions are prevented."
    );
  }

  chapter7_GradesAndAssessments() {
    this.chapterTitle("Grades & Assessments");

    this.sectionTitle("Grade Entry");
    this.para(
      "Teachers enter quarterly grades (Q1\u2013Q4) for their assigned subjects. The grade entry interface validates that the teacher has the proper schedule or adviser assignment."
    );

    this.subSection("Grade Entry Flow");
    this.flowDiagram([
      "Teacher selects school year and subject (filtered to their schedules)",
      "System loads enrolled students for that section/subject",
      "Teacher enters numeric grades (60\u2013100) for each quarter",
      "Grades auto-calculate remarks: >= 75 = 'Passed', < 75 = 'Failed'",
      "Grades saved to sms_grades table per student/subject/quarter",
    ]);

    this.subSection("Grade Entry Rules");
    this.bullet("Only graded subjects (is_graded = true) appear in the grade entry list");
    this.bullet("Kindergarten is excluded \u2014 uses ECCD Checklist instead");
    this.bullet("Promoted students may be locked based on school settings");
    this.bullet("Previous school year grades may be locked based on school settings");

    this.sectionTitle("ECCD Assessment (Kindergarten)");
    this.para(
      "The ECCD (Early Childhood Care and Development) checklist replaces traditional grading for Kindergarten students."
    );

    this.subSection("ECCD Entry Flow");
    this.flowDiagram([
      "Teacher selects school year, K section, and assessment period (1st or 2nd semester)",
      "Opens full-screen ECCD checklist modal",
      "Checklist shows domains (e.g., Physical, Cognitive, Language, Socio-Emotional)",
      "Each domain has competency items with checkboxes per student",
      "Ratings auto-save on change \u2014 checked = demonstrated (1), unchecked = not yet (0)",
    ]);

    this.subSection("ECCD Structure");
    this.bullet("Domains \u2014 High-level assessment categories (configured in Settings > ECCD)");
    this.bullet("Competencies \u2014 Individual skills/behaviors within each domain");
    this.bullet("Scale Scores \u2014 Raw-to-scale score mappings for reporting");
    this.bullet("Periods \u2014 1st Semester and 2nd Semester assessments");

    this.sectionTitle("Report Cards");
    this.para(
      "Report cards are generated as PDFs showing quarterly grades, final averages, and core value ratings. The school principal's name and title (from Settings) appear as signatories."
    );
  }

  chapter8_Attendance() {
    this.chapterTitle("Attendance");

    this.sectionTitle("Monthly Class Attendance");
    this.para(
      "The attendance module records daily AM/PM attendance for each section, aligned with DepEd School Form 2 (SF2 \u2014 Learner's Daily Class Attendance)."
    );

    this.subSection("Recording Attendance");
    this.flowDiagram([
      "Select school year, section, and month",
      "Click 'View / Record Attendance' to open the modal",
      "Grid shows students (rows) x weekdays (columns) with AM/PM checkboxes",
      "Check AM and/or PM for each student's attendance",
      "Changes save automatically to the database",
    ]);

    this.subSection("Attendance Grid Features");
    this.bullet("Sticky student name column for easy navigation");
    this.bullet("Only weekdays (Monday\u2013Friday) are shown");
    this.bullet("Total attendance calculated as 0.5 per period (half-day each)");
    this.bullet("Month options span the school year: June through May");
    this.bullet("Previous school year data may be locked based on settings");

    this.sectionTitle("Accessing from Teacher Section Page");
    this.para(
      "Teachers can quickly access attendance for a specific section by clicking the 'Attendance' button on their section detail page. The school year and section are automatically pre-selected."
    );
  }

  chapter9_LearnerHealth() {
    this.chapterTitle("Learner Health");

    this.sectionTitle("Health Records (SF8)");
    this.para(
      "The learner health module records physical measurements and nutritional status, aligned with DepEd School Form 8 (SF8 \u2014 Learner Basic Health and Nutrition Report)."
    );

    this.subSection("Health Data Entry");
    this.para("Select school year and section to view the health entry table. For each student:");
    this.simpleTable(
      ["Field", "Type", "Description"],
      [
        ["Height", "Number (cm)", "Student height in centimeters"],
        ["Weight", "Number (kg)", "Student weight in kilograms"],
        ["Nutritional Status", "Dropdown", "Underweight, Normal, Overweight, Obese"],
        ["Height for Age", "Dropdown", "Severely Stunted, Stunted, Normal, Tall"],
        ["Remarks", "Text", "Additional notes"],
        ["Measured At", "Date", "Date the measurement was taken"],
      ],
      { colWidths: [32, 30, 108] }
    );

    this.para(
      "Changes are debounce-saved (500ms) automatically. Data uses student_id + section_id + school_year as unique key (upsert pattern)."
    );

    this.sectionTitle("Accessing from Teacher Section Page");
    this.para(
      "Teachers can quickly access learner health for a specific section by clicking the 'Learners Health' button on their section detail page. The school year and section are automatically pre-selected."
    );
  }

  chapter10_Books() {
    this.chapterTitle("Books Management");

    this.sectionTitle("Overview");
    this.para(
      "The books module tracks textbook inventory from school-level allocation through teacher-to-student issuance and returns. The flow is: School Inventory > Teacher Allocations > Student Issuances > Returns."
    );

    this.sectionTitle("Book Inventory");
    this.para("The main books page lists all textbooks in the school inventory with:");
    this.bullet("Title, Subject Area, Grade Level, ISBN");
    this.bullet("Active/Inactive status");
    this.bullet("Add, Edit, and Delete operations");

    this.sectionTitle("Allocations (Manager to Teacher)");
    this.para(
      "Book managers allocate books to teachers. Each allocation specifies the teacher, book, quantity, and school year. Navigate to Books > Allocations to manage."
    );

    this.sectionTitle("Issuances (Teacher to Student)");
    this.para(
      "Teachers issue books from their allocations to individual students. Navigate to Books > Issuances or use the teacher's 'Issue Books' page."
    );

    this.subSection("Issue Flow");
    this.flowDiagram([
      "Select section and school year",
      "Choose student from enrolled list",
      "Select available book (filtered by grade level)",
      "Confirm issuance \u2014 record created with issue date",
    ]);

    this.subSection("Return Flow");
    this.flowDiagram([
      "Locate the issuance record in the table",
      "Click Return \u2014 enter return date, condition, and return code",
      "Return codes: FM (Force Majeure), TDO (Transferred/Dropout), NEG (Negligence)",
      "Teacher submits returns to book manager via 'Return to Manager' page",
    ]);
  }

  chapter11_Reports() {
    this.chapterTitle("DepEd Reports (SF1\u2013SF10)");

    this.sectionTitle("Overview");
    this.para(
      "The Reports module generates all mandatory DepEd School Forms as PDFs. Forms are generated in the browser and can be saved via the print dialog (Ctrl/Cmd+P)."
    );

    this.sectionTitle("Available School Forms");
    this.simpleTable(
      ["Form", "Title", "Requires", "Description"],
      [
        ["SF1", "School Register", "Section", "Master list of class enrollment"],
        ["SF2", "Daily Attendance", "Section + Month", "Monthly attendance report"],
        ["SF3", "Books Issued/Returned", "Section", "Library movements tracking"],
        ["SF4", "Monthly Learner Movement", "School-wide", "Enrollment counts by grade"],
        ["SF5", "Report on Promotion", "Section (opt.)", "Promoted/retained breakdown"],
        ["SF6", "Summary of Promotion", "School-wide", "Grade-level promotion summary"],
        ["SF7", "School Personnel", "School-wide", "Staff and teaching loads"],
        ["SF8", "Learner Basic Health", "Section", "Health & nutrition metrics"],
        ["SF9", "Progress Report Card", "Student", "Quarter grades per subject"],
        ["SF10", "Permanent Record", "Student search", "Historical academic file"],
      ],
      { colWidths: [14, 38, 35, 83] }
    );

    this.sectionTitle("SF10 Special Features");
    this.para("The SF10 (Permanent Academic Record) has unique capabilities:");
    this.bullet("Auto-determines form variant: SF10-ES (K\u20136), SF10-JHS (7\u201310), SF10-SHS (11\u201312)");
    this.bullet("Search students by name or LRN within the school");
    this.bullet("'Encode Historical' button for registrars to add historical grade records");
    this.bullet("Displays complete academic history across school years");

    this.sectionTitle("Teacher Access to School Forms");
    this.para(
      "Teachers can generate school forms from their section detail page by clicking the 'School Forms' button. The section and school year are pre-filled automatically."
    );
  }

  chapter12_Evaluations() {
    this.chapterTitle("Evaluations");

    this.sectionTitle("Overview");
    this.para(
      "The evaluation system supports two types of evaluations using a Likert scale (1\u20135 stars):"
    );
    this.bullet("Student \u2192 Teacher \u2014 Students rate their teachers via the Student Portal");
    this.bullet("Teacher \u2192 Principal \u2014 Teachers evaluate the school principal");

    this.sectionTitle("Creating Evaluations (Admin)");
    this.para("Navigate to Evaluations module to create questionnaires:");
    this.numberedItem(1, "Click 'Add Evaluation' \u2014 set title, description, type, school year, and active status");
    this.numberedItem(2, "Click 'Manage Questions' \u2014 add, reorder, edit, or delete questions");
    this.numberedItem(3, "Toggle 'Active' when ready for respondents to see the evaluation");
    this.numberedItem(4, "View results \u2014 see aggregated ratings per question");

    this.sectionTitle("Teacher Submitting Evaluations");
    this.para(
      "Teachers navigate to Teacher > Evaluations. Active teacher-to-principal evaluations are shown as cards. The teacher clicks 'Start Evaluation', rates each question 1\u20135 stars, and submits. The system identifies the principal automatically based on the school_head/super admin at the teacher's school."
    );

    this.sectionTitle("Student Submitting Evaluations");
    this.para(
      "Students log into the Student Portal and navigate to Evaluations. They see a list of their teachers (from schedules/adviser relationships) and can rate each teacher. Once submitted, a 'Completed' badge appears. See Chapter 15 for more on the Student Portal."
    );
  }

  chapter13_TransferWorkflow() {
    this.chapterTitle("Transfer Enrollment Workflow");

    this.sectionTitle("Two-Stage Approval Process");
    this.para(
      "All inter-school transfers go through a mandatory two-stage approval process. There is no bypass \u2014 every transferee must follow the record request flow."
    );

    this.sectionTitle("Stage 1: Record Access Request");
    this.para("This stage handles requesting and granting access to the student's records.");

    this.subSection("At the Destination School (School B)");
    this.flowDiagram([
      "Registrar enters transferee's LRN in the Enrollment Wizard",
      "LRN lookup finds student at a different school \u2192 'Transferee' mode activated",
      "Registrar fills enrollment details (grade level, section)",
      "Clicks 'Enroll & Request Record' \u2192 calls enroll_student_with_record_request RPC",
      "Creates: enrollment (status: pending_transfer) + record request (status: pending)",
    ]);

    this.subSection("At the Origin School (School A)");
    this.flowDiagram([
      "Registrar sees pending request in Manage Requests > Incoming Requests tab",
      "Reviews student name, target grade, requesting school",
      "Clicks 'Approve' to grant record access (or 'Reject' with reason)",
      "On approve: record_access_granted = true, enrollment moves to pending_review",
    ]);

    this.sectionTitle("Stage 2: Enrollment Review");
    this.para("This stage handles the actual enrollment approval at the destination school.");

    this.subSection("Back at the Destination School (School B)");
    this.flowDiagram([
      "Registrar sees transfer in Manage Requests > Pending Reviews tab",
      "Clicks 'Review' \u2192 opens TransferRecordViewer with grades and enrollment history",
      "Reviews: student demographics, quarterly grades by year, previous enrollment records",
      "Approve \u2192 enrollment_status becomes 'active' (student can attend)",
      "Reject \u2192 enrollment rejected with reason, record access revoked",
    ]);

    this.sectionTitle("Transfer Status Flow");
    this.simpleTable(
      ["Stage", "Record Request Status", "Enrollment Status"],
      [
        ["1. Request sent", "pending", "pending_transfer"],
        ["1. Origin approves", "approved", "pending_review"],
        ["1. Origin rejects", "rejected", "pending_transfer (unchanged)"],
        ["2. Destination approves", "approved", "active"],
        ["2. Destination rejects", "approved", "dropped + access revoked"],
      ],
      { colWidths: [38, 50, 82] }
    );

    this.sectionTitle("Transfer Out (Teacher-Initiated)");
    this.para(
      "Teachers can initiate a transfer-out from the section detail page for active students. This marks the student as 'transferred_out' with a reason and optional destination school. The destination school then initiates the incoming transfer process as described above."
    );

    this.infoBox(
      "Important: No Pre-Released Bypass",
      "All transferees use the full record request flow, even if the student is already marked as 'transferred_out' at the origin school. The StudentEntryMode type only includes 'new', 'existing', and 'transferee'."
    );
  }

  chapter14_RecordRequests() {
    this.chapterTitle("Document Requests");

    this.sectionTitle("Public Request Submission");
    this.para(
      "Parents, students, and other schools can request official documents (Form 137 / SF10, Diploma) through the public request page at /requests."
    );

    this.subSection("Submission Flow");
    this.flowDiagram([
      "Requester navigates to /requests and selects 'Submit Request' tab",
      "Fills requester info: type (student/parent/school), name, contact, relationship",
      "Enters student LRN and clicks 'Verify' to auto-populate student details",
      "Selects document types: Form 137, Diploma (grayed out if already requested)",
      "Uploads signed authorization document (required)",
      "Submits \u2192 receives tracking number (e.g., REQ-20260101-AB1CD)",
    ]);

    this.sectionTitle("Tracking a Request");
    this.para(
      "Requesters can track their request status by entering the tracking number on the 'Track Request' tab. The result shows the current status, a timeline of actions, and a download link when the document is ready."
    );

    this.sectionTitle("Processing Requests (Staff)");
    this.para(
      "Staff members process document requests in Manage Requests > Document Requests tab."
    );
    this.simpleTable(
      ["Status", "Next Action", "Description"],
      [
        ["pending", "Mark Under Review", "Acknowledge receipt and begin processing"],
        ["under_review", "Approve or Reject", "Review completeness, prepare document"],
        ["approved", "Upload & Complete", "Upload the requested document (SF10 PDF)"],
        ["completed", "Done", "Requester can download via tracking page"],
        ["rejected", "Done", "Rejection reason visible to requester"],
      ],
      { colWidths: [28, 35, 107] }
    );
  }

  chapter15_StudentPortal() {
    this.chapterTitle("Student Portal");

    this.sectionTitle("Overview");
    this.para(
      "The Student Portal is a separate, read-only interface for students to view their academic records and submit evaluations. Authentication uses LRN + Date of Birth (JWT cookie, no Supabase Auth)."
    );

    this.sectionTitle("Login");
    this.para("Students navigate to /student-portal and enter:");
    this.bullet("Learner Reference Number (LRN)");
    this.bullet("Date of Birth");
    this.para("On successful verification, a 24-hour JWT session cookie is set.");

    this.sectionTitle("Dashboard");
    this.para("The student dashboard shows quick access cards:");
    this.bullet("Grade Records \u2014 Link to view grades");
    this.bullet("LRN Display \u2014 Shows the student's formatted LRN");

    this.sectionTitle("Grade Records");
    this.para(
      "Students can view their quarterly grades grouped by school year. For each year, a table shows subjects with Q1\u2013Q4 grades and averages. Grades are read-only."
    );

    this.sectionTitle("Evaluations");
    this.para(
      "Students can submit evaluations of their teachers. The page shows active evaluations with a list of the student's teachers. For each unevaluated teacher, the student can click 'Evaluate', rate each question 1\u20135 stars, and submit. Completed evaluations show a badge."
    );
  }

  chapter16_PublicPages() {
    this.chapterTitle("Public Landing Pages");

    this.sectionTitle("Landing Page (Home)");
    this.para("The public landing page at / provides:");
    this.bullet("Hero section with 'Explore Schools' and 'Request Record' call-to-action buttons");
    this.bullet("Enrollment Overview \u2014 Total enrollment statistics with school year selector, broken down by Elementary, Junior High, and Senior High (male, female, total)");
    this.bullet("Enrollment by Grade Level \u2014 Bar chart showing enrollment per grade (K through 12)");
    this.bullet("Quick Access Links \u2014 Cards linking to Schools, Learners, Document Requests, and Student Portal");

    this.sectionTitle("Public Schools Directory");
    this.para(
      "The /schools page lists all active schools with their School ID, Name, Type (color-coded badge), Address, and District. Clicking a school shows its detail page."
    );

    this.sectionTitle("Learners Statistics");
    this.para(
      "The /learners page shows enrollment counts by school, filterable by school year and district. Displays a table with columns for Kindergarten, Elementary, Junior High, and Senior High per school."
    );
  }

  chapter17_DivisionAdmin() {
    this.chapterTitle("Division Administration");

    this.sectionTitle("Overview");
    this.para(
      "Division admins manage schools and users across the entire Schools Division of Bayugan City. They are the only role that operates without a school_id, allowing cross-school visibility."
    );

    this.sectionTitle("Division Dashboard");
    this.para(
      "The division dashboard provides aggregate statistics across all schools: total enrollment, school count, staff count, and enrollment trends."
    );

    this.sectionTitle("Schools Management");
    this.para(
      "Create, edit, and manage all schools in the division (see Chapter 3: Initial School Setup for details). Schools cannot be deleted if they have assigned users."
    );

    this.sectionTitle("Users Management");
    this.para(
      "Create and manage staff accounts across all schools. Assign users to specific schools with appropriate roles. Users can be deactivated but not deleted if they have associated records."
    );

    this.sectionTitle("Division Reports");
    this.para(
      "Division admins can generate school forms for any school by first selecting a school from the dropdown, then proceeding with the normal report generation flow."
    );

    this.sectionTitle("Cross-Module Access");
    this.para(
      "When division admins access school-scoped modules (attendance, health, etc.), they see an additional 'School' dropdown to select which school's data to view. This allows monitoring and support across the division."
    );
  }

  chapter18_SettingsConfig() {
    this.chapterTitle("Settings & Configuration");

    this.sectionTitle("School Settings");
    this.para("Accessible to School Heads at Settings (labeled 'School'). Four configuration areas:");

    this.subSection("Record Editing Controls");
    this.bullet("Allow editing records from previous school years \u2014 When OFF, grades/attendance/health from past years are locked (default: OFF)");
    this.bullet("Allow editing grades for promoted students \u2014 When OFF, promoted student grades cannot be modified (default: ON)");

    this.subSection("Promotion Deadline");
    this.bullet("Set a cutoff date for student promotions");
    this.bullet("After the deadline, the Promote/Graduate button on section pages is disabled");
    this.bullet("Can be cleared to remove the restriction");

    this.subSection("School Principal Configuration");
    this.bullet("Principal Name \u2014 Full name with credentials (e.g., 'JUAN DELA CRUZ, PhD')");
    this.bullet("Principal Title \u2014 Official title (e.g., 'Principal III', default: 'Principal')");
    this.bullet("Used as signatories on report cards and official DepEd forms");

    this.subSection("ECCD Checklist Configuration");
    this.para("For schools with Kindergarten programs, navigate to Settings > ECCD:");
    this.bullet("Manage Domains \u2014 Add/edit/reorder assessment categories (e.g., Physical, Cognitive)");
    this.bullet("Manage Competencies \u2014 Add/edit/reorder individual skills within each domain");
    this.bullet("Scale Score Mapping \u2014 Map raw scores to scale scores for each domain");
    this.bullet("Activate/Deactivate \u2014 Toggle domains and competencies without deleting");

    this.sectionTitle("GPA Thresholds");
    this.para(
      "Accessible from the Enrollment page, GPA thresholds define the boundaries for the section assignment algorithm's student classification (high/mid/low GPA buckets)."
    );

    this.sectionTitle("Summary of Settings Impact");
    this.simpleTable(
      ["Setting", "Affects"],
      [
        ["Edit previous year records", "Grade Entry, Attendance, Health"],
        ["Edit promoted grades", "Grade Entry (teacher module)"],
        ["Promotion deadline", "Promote/Graduate buttons on section pages"],
        ["Principal name/title", "Report cards, SF forms"],
        ["ECCD domains/competencies", "ECCD Checklist (Kindergarten assessment)"],
        ["GPA thresholds", "Section assignment suggestions during enrollment"],
      ],
      { colWidths: [42, 128] }
    );

    // Final page - end of guide
    this.ensureSpace(30);
    this.y += 10;
    this.drawLine(this.y, C_PRIMARY);
    this.y += 8;
    this.writeText("End of System Guide", {
      size: 14,
      style: "bold",
      color: C_PRIMARY,
      align: "center",
    });
    this.y += 4;
    this.writeText(
      "For technical support, contact the Division ICT Office or the system administrator.",
      { size: 10, color: C_MUTED, align: "center" }
    );
    this.y += 3;
    this.writeText("Schools Division of Bayugan City  \u2022  Department of Education", {
      size: 9,
      color: C_MUTED,
      align: "center",
    });
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
const guide = new GuideBuilder();
guide.build();
guide.save();
