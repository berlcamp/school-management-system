/**
 * SMS Orientation deck 3 — Instructional Supervision (PMES / COT)
 *
 * Companion to SMS-Orientation-1-School-Heads.pdf and -2-Teachers.pdf, which
 * were rendered by Chrome at 960x540pt. This reproduces that deck's design
 * system exactly — palette sampled from the source PDFs, Avenir Next, the same
 * kicker / rule / callout / footer furniture — so the three read as one set.
 *
 * Usage: node scripts/generate-supervision-orientation.mjs [outputDir]
 *
 * Renders through headless Chrome rather than jsPDF (which is what
 * generate-guide.mjs uses for the A4 manual): these are 16:9 slides, and the
 * source decks were themselves Chrome print-to-PDF output.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT_DIR =
  process.argv[2] ?? path.join(os.homedir(), "Desktop", "SMS-Orientation");
const OUT_PDF = path.join(OUT_DIR, "SMS-Orientation-3-Instructional-Supervision.pdf");

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const FOOTER = "SMS Orientation · Instructional Supervision";

// ─── Palette, sampled from the two existing decks ────────────────────────────
const C = {
  navy: "#0B3B63",
  ink: "#22384A",
  gold: "#D99E2B",
  goldInk: "#B07E13",
  muted: "#8CA0B2",
  cardBg: "#F4F7FA",
  border: "#E4EBF1",
  noteBar: "#2F7DBE",
  noteBg: "#EAF0F5",
  tipBg: "#FBF3E1",
  tipInk: "#5A4210",
  redBar: "#C7452F",
  redBg: "#FCEEEC",
  redInk: "#5A1F16",
};

// ─── Escaping ────────────────────────────────────────────────────────────────
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Inline markup: **bold** and `code`. Escaped first, so content stays safe. */
const rich = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");

// ─── Slide builders ──────────────────────────────────────────────────────────
const slides = [];

function cover({ kicker, eyebrow, title, subtitle, footnote }) {
  slides.push({
    numbered: false,
    html: `<section class="slide cover">
      <div class="cover-ring"></div>
      <div class="cover-body">
        <div class="cover-kicker">${esc(kicker)}</div>
        <div class="cover-eyebrow">${esc(eyebrow)}</div>
        <h1 class="cover-title">${esc(title)}</h1>
        <div class="cover-rule"></div>
        <p class="cover-sub">${esc(subtitle)}</p>
        <p class="cover-foot">${esc(footnote)}</p>
      </div>
      <div class="cover-edge"><i></i><i></i><i></i><i></i></div>
    </section>`,
  });
}

function divider({ n, word, title, subtitle }) {
  slides.push({
    numbered: false,
    html: `<section class="slide divider">
      <div class="divider-num">${esc(n)}</div>
      <div class="divider-body">
        <div class="divider-kicker">SECTION ${esc(word)}</div>
        <h1 class="divider-title">${esc(title)}</h1>
        <p class="divider-sub">${esc(subtitle)}</p>
      </div>
      <div class="divider-edge"></div>
    </section>`,
  });
}

function slide({ kicker, title, pill, body }) {
  slides.push({
    numbered: true,
    html: `<section class="slide">
      <div class="kicker">${esc(kicker)}</div>
      <h1>${esc(title)}</h1>
      ${pill ? `<div class="pill">${esc(pill)}</div>` : ""}
      <div class="rule"></div>
      <div class="content">${body}</div>
      <div class="footer"><span>${esc(FOOTER)}</span><span class="pageno"></span></div>
    </section>`,
  });
}

// ─── Content blocks ──────────────────────────────────────────────────────────
const lead = (t) => `<p class="lead">${rich(t)}</p>`;
const para = (t) => `<p class="para">${rich(t)}</p>`;

const bullets = (items) =>
  `<ul class="bullets">${items.map((i) => `<li>${rich(i)}</li>`).join("")}</ul>`;

const steps = (items) =>
  `<ol class="steps">${items
    .map((i, n) => `<li><span class="stepnum">${n + 1}</span><span>${rich(i)}</span></li>`)
    .join("")}</ol>`;

const callout = (kind, label, text) =>
  `<div class="callout ${kind}"><div class="callout-label">${esc(label)}</div><div>${rich(text)}</div></div>`;

const note = (t) => callout("note", "NOTE", t);
const tip = (t) => callout("tip", "TIP", t);
const important = (t) => callout("important", "IMPORTANT", t);

const table = (head, rows, widths) =>
  `<table class="tbl">
    <thead><tr>${head
      .map((h, i) => `<th${widths?.[i] ? ` style="width:${widths[i]}"` : ""}>${esc(h)}</th>`)
      .join("")}</tr></thead>
    <tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${rich(c)}</td>`).join("")}</tr>`)
      .join("")}</tbody>
  </table>`;

const cards = (items, cols = 3) =>
  `<div class="cards cols-${cols}">${items
    .map(
      (c) =>
        `<div class="card"><div class="card-title">${rich(c.title)}</div><div class="card-text">${rich(c.text)}</div></div>`,
    )
    .join("")}</div>`;

const twoCol = (left, right) =>
  `<div class="twocol"><div>${left}</div><div>${right}</div></div>`;

const colHead = (t) => `<div class="colhead">${esc(t)}</div>`;

const flow = (items) =>
  `<div class="flow">${items
    .map(
      (t, i) =>
        `<div class="flow-step"><span class="flow-n">${i + 1}</span>${rich(t)}</div>${
          i < items.length - 1 ? '<div class="flow-arrow">→</div>' : ""
        }`,
    )
    .join("")}</div>`;

// ═════════════════════════════════════════════════════════════════════════════
// THE DECK
// ═════════════════════════════════════════════════════════════════════════════

cover({
  kicker: "SCHOOLS DIVISION OF BAYUGAN CITY",
  eyebrow: "SYSTEM ORIENTATION",
  title: "Instructional Supervision",
  subtitle:
    "The PMES observation cycle in the SMS — planning, scheduling, and the COT forms, for School Heads, observers and teachers.",
  footnote: "Department of Education · Schools Division of Bayugan City",
});

slide({
  kicker: "ORIENTATION",
  title: "What we will cover today",
  body:
    cards(
      [
        { title: "1 · Before You Start", text: "Designating observers and who may do what." },
        { title: "2 · The Supervisory Plan", text: "The term plan the School Head writes." },
        { title: "3 · Scheduling", text: "Suggest, approve, and the two axes of a COT form." },
        { title: "4 · Calendar", text: "Getting an approved slot into your own calendar." },
        { title: "5 · The COT Forms", text: "Annex E-2, E-3 and E-4, and who may fill them." },
        { title: "6 · The Board", text: "Reading the schedule list and printing." },
      ],
      3,
    ) +
    note(
      "This module reproduces a paper cycle you already follow. Nothing here changes DepEd policy — it changes where the paper lives.",
    ),
});

slide({
  kicker: "ORIENTATION",
  title: "What the module replaces",
  body:
    lead("The observation cycle, from the term plan to the signed rating sheet, in one place.") +
    twoCol(
      colHead("BEFORE") +
        bullets([
          "Supervisory plan typed in Word each term",
          "Observation dates agreed by text message",
          "COT forms photocopied from the annex",
          "Rating scale chosen by hand per teacher",
          "Filed forms kept in a folder per teacher",
        ]),
      colHead("NOW") +
        bullets([
          "Plan written once, printed landscape",
          "Teacher suggests, School Head approves in-system",
          "E-2 / E-3 / E-4 generated with the right indicators",
          "Scale set from the career stage and frozen",
          "Every filed form attached to its observation",
        ]),
    ),
});

slide({
  kicker: "ORIENTATION",
  title: "The cycle, end to end",
  body:
    flow([
      "School Head writes the term **plan**",
      "Teacher or Head **suggests** a slot",
      "School Head **approves** it",
      "Participants **export** to their calendar",
      "Observers **file** the COT forms",
    ]) +
    para(
      "Each step is a page in the module. You can enter at any point, but a form cannot be filed against a slot that does not exist.",
    ) +
    tip(
      "Open **Instructional Supervision** in the sidebar. The Supervisory Plan and Observers pages are buttons at the top right of that screen.",
    ),
});

// ─── Section 1 ───────────────────────────────────────────────────────────────
divider({
  n: "1",
  word: "ONE",
  title: "Before You Start",
  subtitle: "Designating observers, and who may do what.",
});

slide({
  kicker: "BEFORE YOU START",
  title: "Designate your observers first",
  pill: "School Head · Admin",
  body:
    lead(
      "An **observer is a designation, not a role.** Master teachers routinely observe; the School Head is not required to.",
    ) +
    steps([
      "Open **Instructional Supervision → Observers**.",
      "Choose the school year — designations are per school year, not permanent.",
      "Tick the staff who will observe this year. Any staff member can be designated.",
      "A designated observer sees a second tab on their own supervision page.",
    ]) +
    important(
      "Until at least one observer is designated, a schedule can be created but nobody can be assigned to it. The board warns you when the list is empty.",
    ),
});

slide({
  kicker: "BEFORE YOU START",
  title: "Who can do what",
  body:
    table(
      ["Who", "What they can do"],
      [
        [
          "School Head · Admin",
          "Everything: write the plan, designate observers, create and approve slots, and fill or correct any COT form.",
        ],
        [
          "Designated observer",
          "See the observations they are assigned to, and fill **only their own** rating sheet. May join the Annex E-3.",
        ],
        [
          "Teacher (observed)",
          "Suggest a slot for themselves, attach their ILAW lesson plan, and view their own observations.",
        ],
      ],
      ["26%", "74%"],
    ) +
    important(
      "A teacher can never edit the rating sheet written about them, and can never approve their own slot. Both are enforced by the system, not by convention.",
    ),
});

// ─── Section 2 ───────────────────────────────────────────────────────────────
divider({
  n: "2",
  word: "TWO",
  title: "The Supervisory Plan",
  subtitle: "The term matrix the School Head prepares.",
});

slide({
  kicker: "THE PLAN",
  title: "Writing the term plan",
  pill: "School Head · Admin",
  body:
    lead("One **Instructional Supervisory Plan** per term, at Supervision → Supervisory Plan.") +
    twoCol(
      colHead("THE THREE TERMS") +
        bullets([
          "**Term 1** — June to August",
          "**Term 2** — September to November",
          "**Term 3** — January to March",
        ]) +
        para("December is not covered by any term, exactly as the printed plan reads."),
      colHead("EACH ROW") +
        bullets([
          "Objective and priority strand",
          "Teachers — a name, or a group",
          "Strategy, resources, time frame",
          "Expected output and remarks",
        ]),
    ) +
    tip(
      "The **Teachers** column is free text on purpose: a row may name one teacher or a group such as “All Primary Grade Teachers”. Print it landscape.",
    ),
});

// ─── Section 3 ───────────────────────────────────────────────────────────────
divider({
  n: "3",
  word: "THREE",
  title: "Scheduling an Observation",
  subtitle: "Suggest, approve, and the two things that fix the form.",
});

slide({
  kicker: "SCHEDULING",
  title: "Suggest, then approve",
  body:
    steps([
      "A **teacher** proposes a slot from their own Supervision page — or the **School Head** creates one from the board.",
      "The slot starts as **Proposed**. Nothing is committed yet.",
      "The School Head reviews the date and clicks **Approve**, or **Reject** with a reason.",
      "Only an **Approved** slot offers calendar actions and expects COT forms.",
    ]) +
    important(
      "**Editing an approved slot returns it to Proposed and clears the decision.** An approval refers to a specific date, so a moved observation must be approved again. This is deliberate, not a bug.",
    ),
});

slide({
  kicker: "SCHEDULING",
  title: "What the slot records",
  body:
    twoCol(
      colHead("ABOUT THE TEACHER") +
        bullets([
          "Position, and the **career stage** confirmed from it",
          "Rated, or non-rated (fleeting)",
          "Term and observation round",
          "Grade and section being observed",
        ]),
      colHead("ABOUT THE OBSERVATION") +
        bullets([
          "Pre-conference date and time",
          "Actual observation date and time",
          "Focus KRA and focus indicator",
          "The **ILAW lesson plan**, attached as a file",
        ]),
    ) +
    note(
      "The lesson plan is a real upload — PDF, Word, PowerPoint or an image, up to 15 MB. Anyone given the file's link can open it, so do not attach anything confidential.",
    ),
});

slide({
  kicker: "SCHEDULING",
  title: "The two axes of a COT form",
  body:
    lead("Two different things decide what the form looks like. Confusing them is the classic error.") +
    twoCol(
      colHead("CAREER STAGE") +
        para("Fixes the **rating scale only**.") +
        para(
          "The indicator wording is written in Proficient Teacher language for everyone, whatever their stage.",
        ),
      colHead("SCHOOL YEAR") +
        para("Fixes **which indicators appear**.") +
        para(
          "The PMES rotates a 9 / 9 / 8 set of indicators on a three-year cycle, the same for every teacher.",
        ),
    ) +
    important(
      "A Master Teacher and a Teacher I observed in the same year answer the **same indicators** — only the numbers they can be scored against differ.",
    ),
});

slide({
  kicker: "SCHEDULING",
  title: "Career stage sets the scale",
  body:
    table(
      ["Career stage", "Plantilla", "Scale", "“NO” scores"],
      [
        ["Proficient Teacher A", "Teacher I – III", "2 – 6", "2"],
        ["Proficient Teacher B", "Teacher IV – VII", "3 – 7", "3"],
        ["Highly Proficient Teacher", "Master Teacher I – II", "4 – 8", "4"],
        ["Distinguished Teacher", "Master Teacher III – V", "5 – 9", "5"],
      ],
      ["30%", "26%", "18%", "26%"],
    ) +
    para(
      "The system suggests a stage from the teacher's recorded position, but the School Head always confirms it on the scheduling form.",
    ) +
    important(
      "The stage is **frozen onto each form when it is first filed.** A teacher promoted mid-year does not retroactively change the scale of a form already signed on paper.",
    ),
});

slide({
  kicker: "SCHEDULING",
  title: "School year sets the indicators",
  body:
    lead("The indicator set rotates on a three-year cycle and then repeats.") +
    table(
      ["Cycle year", "School year", "Indicators"],
      [
        ["Year 1", "S.Y. 2025–2026", "9 indicators"],
        ["Year 2", "S.Y. 2026–2027", "9 indicators"],
        ["Year 3", "S.Y. 2027–2028", "8 indicators"],
        ["Repeats", "S.Y. 2028–2029 onward", "Back to the Year 1 set"],
      ],
      ["18%", "42%", "40%"],
    ) +
    note(
      "Like the career stage, the year's indicator set is stored on the form when it is filed — so reprinting an old form reproduces the form that was signed, not this year's one.",
    ),
});

// ─── Section 4 ───────────────────────────────────────────────────────────────
divider({
  n: "4",
  word: "FOUR",
  title: "Calendar",
  subtitle: "Getting an approved slot into your own calendar.",
});

slide({
  kicker: "CALENDAR",
  title: "Exporting an approved slot",
  body:
    twoCol(
      colHead("ADD TO GOOGLE CALENDAR") +
        para("Opens the event pre-filled in your own Google Calendar. You still press save."),
      colHead("DOWNLOAD INVITE (.ICS)") +
        para(
          "A standards file that imports into Google, Outlook and Apple Calendar — and carries the pre-conference as its own event.",
        ),
    ) +
    important(
      "The system **never writes to anyone's calendar.** There is no Google sign-in, and each participant exports for themselves. “Last exported” only records that someone took the file — not that an event exists in anybody's calendar.",
    ),
});

// ─── Section 5 ───────────────────────────────────────────────────────────────
divider({
  n: "5",
  word: "FIVE",
  title: "The COT Forms",
  subtitle: "Annex E-2, E-3 and E-4 — and who may fill them.",
});

slide({
  kicker: "COT FORMS",
  title: "The three forms",
  body:
    table(
      ["Form", "What it is", "Who files it"],
      [
        ["Annex E-2", "Classroom Observation rating sheet — the indicator scores.", "Each assigned observer"],
        [
          "Annex E-3",
          "Inter-Observer Agreement — the single final rating for the observation.",
          "The observers together",
        ],
        ["Annex E-4", "Observation notes — narrative, no scores.", "Each assigned observer"],
      ],
      ["16%", "56%", "28%"],
    ) +
    note(
      "Open a row on the board to see a card per observer, each with its own **Rating sheet** and **Notes** buttons and a Not started / Draft / Submitted badge.",
    ),
});

slide({
  kicker: "COT FORMS",
  title: "One observer, or more than one",
  body:
    twoCol(
      colHead("EXACTLY ONE OBSERVER") +
        para("The **Annex E-2 is the final rating sheet.** No agreement form is offered, and none is required."),
      colHead("TWO OR THREE OBSERVERS") +
        para(
          "Each files their own E-2, then an **Annex E-3** is required to record the one agreed final rating.",
        ),
    ) +
    important(
      "The E-3 final rating is a **reasoned consensus, not an average.** The system deliberately does not compute one — the observers agree on it and record it.",
    ),
});

slide({
  kicker: "COT FORMS",
  title: "“NO” and “N/A” are not the same",
  body:
    table(
      ["Marking", "What it means", "What it scores"],
      [
        [
          "A rating",
          "The indicator was observed and rated on the teacher's scale.",
          "The number chosen",
        ],
        [
          "**NO** — Not Observed",
          "The indicator was looked for and not seen.",
          "**The lowest level of the scale** — 2, 3, 4 or 5",
        ],
        [
          "**N/A**",
          "The indicator does not apply to this observation.",
          "Nothing — excluded entirely",
        ],
      ],
      ["22%", "46%", "32%"],
    ) +
    important(
      "**NO is not a zero and not a blank.** It automatically scores the lowest level of the teacher's own career stage. N/A takes the indicator out of the form altogether.",
    ),
});

slide({
  kicker: "COT FORMS",
  title: "A non-rated observation",
  body:
    lead("A **non-rated (fleeting)** observation produces notes only.") +
    bullets([
      "No rating sheet is offered, and none is expected.",
      "Each observer writes the **Annex E-4** observation notes instead.",
      "The slip and the board both show the observation as non-rated.",
    ]) +
    tip(
      "Set rated or non-rated when the slot is created. If you change it afterwards, tell the observers — the forms they are offered change with it.",
    ),
});

slide({
  kicker: "COT FORMS",
  title: "Who may fill which form",
  body:
    table(
      ["You are…", "On your own observation", "On one you observe"],
      [
        ["The observed teacher", "View only — you cannot edit any form", "—"],
        ["A designated observer", "View only", "Edit **your own** rating sheet and notes"],
        ["School Head · Admin", "Full access", "Full access, and may correct any form"],
      ],
      ["26%", "37%", "37%"],
    ) +
    important(
      "An observer cannot open a colleague's rating sheet, and the observed teacher cannot open any of them. Rating sheets are personnel records — the restriction is enforced in the system.",
    ),
});

// ─── Section 6 ───────────────────────────────────────────────────────────────
divider({
  n: "6",
  word: "SIX",
  title: "The Board",
  subtitle: "Reading the schedule list, and what you can print.",
});

slide({
  kicker: "THE BOARD",
  title: "Reading the schedule list",
  body:
    table(
      ["Column", "What it tells you"],
      [
        ["Teacher", "Who is observed, their position and the COT scale that applies."],
        ["Observation", "The date and time of the classroom observation."],
        ["Term & class", "Which term and round, and the grade and section."],
        ["Observer/s", "Who is assigned — and underneath, how many COT forms are submitted."],
        ["Status", "Proposed, Approved, Rejected, Completed or Cancelled."],
      ],
      ["22%", "78%"],
    ) +
    tip(
      "Click the arrow, or the teacher's name, to open a row. The pre-conference, focus indicator, lesson plan, notes and all the COT form buttons are inside.",
    ),
});

slide({
  kicker: "THE BOARD",
  title: "What you can print",
  body:
    twoCol(
      colHead("FROM THE BOARD") +
        bullets([
          "**Print slip** — the per-teacher observation slip",
          "**Blank forms** — E-2, E-3 or E-4 to carry into the classroom",
        ]),
      colHead("FROM A FILED FORM") +
        bullets([
          "The completed **rating sheet** with the scores as filed",
          "The **agreement form** with the final rating",
          "The **observation notes**",
        ]),
    ) +
    note(
      "A blank form prints against the slot's current career stage and school year. A filed form prints against the stage and year stored on it — which is what makes a reprint match the signed original.",
    ),
});

slide({
  kicker: "WRAP UP",
  title: "The five things people get wrong",
  body:
    steps([
      "Scheduling before anyone is **designated as an observer** — nobody can be assigned.",
      "Assuming a Master Teacher answers **different indicators**. Only the scale differs.",
      "Treating **NO** as a zero. It scores the lowest level of the teacher's own scale.",
      "Expecting the **E-3 to average** the observers' scores. It is an agreed rating.",
      "Editing an approved slot and not noticing it went back to **Proposed** for re-approval.",
    ]) +
    tip("Wrong school year is still the most common reason a schedule “disappears”. Check the selector first."),
});

slide({
  kicker: "WRAP UP",
  title: "Where to click",
  body:
    table(
      ["To do this", "Go here"],
      [
        ["Designate who may observe", "Instructional Supervision → **Observers**"],
        ["Write the term plan", "Instructional Supervision → **Supervisory Plan**"],
        ["Create or approve a slot", "Instructional Supervision (the board)"],
        ["Suggest your own observation", "Teacher menu → **Supervision**"],
        ["Fill a rating sheet you own", "Open the row → your observer card"],
        ["Export an approved slot", "Row menu → Add to Google Calendar / Download .ics"],
      ],
      ["42%", "58%"],
    ) +
    note("Questions during the session are welcome — this module is new, and the paper cycle behind it is not."),
});

// ═════════════════════════════════════════════════════════════════════════════
// RENDER
// ═════════════════════════════════════════════════════════════════════════════

// The source decks number every physical page — the cover is 1 and section
// dividers consume a number even though neither prints one. So the counter
// advances on every slide; only content slides render it.
let pageNo = 0;
let shown = 0;
const body = slides
  .map((s) => {
    pageNo++;
    if (!s.numbered) return s.html;
    shown++;
    return s.html.replace('<span class="pageno"></span>', `<span>${pageNo}</span>`);
  })
  .join("\n");

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>SMS Orientation · Instructional Supervision</title>
<style>
  /* The two existing decks are 960x540 POINTS. Chrome maps CSS px at 96dpi,
     so the page must be declared as 1280x720px to land on 960x540pt. The
     design below is authored at 960x540; zoom scales it by 4/3 to fill the
     page, which keeps every number here readable as slide coordinates. */
  @page { size: 1280px 720px; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Avenir Next", "Segoe UI", system-ui, sans-serif;
    color: ${C.ink};
  }
  .slide {
    position: relative;
    width: 960px; height: 540px;
    zoom: 1.3333333;
    padding: 42px 56px 0;
    overflow: hidden;
    page-break-after: always;
    background: #fff;
  }
  .slide:last-child { page-break-after: auto; }

  /* ── Cover ─────────────────────────────────────────────── */
  .cover { background: ${C.navy}; padding: 0; }
  .cover-ring {
    position: absolute; right: -150px; top: -170px;
    width: 620px; height: 620px; border-radius: 50%;
    border: 62px solid rgba(255,255,255,.045);
  }
  .cover-body { position: absolute; left: 72px; top: 44px; right: 300px; }
  .cover-kicker {
    color: #9DB2C6; font-size: 11.5px; font-weight: 600;
    letter-spacing: .22em; margin-bottom: 66px;
  }
  .cover-eyebrow {
    color: ${C.gold}; font-size: 13px; font-weight: 600;
    letter-spacing: .18em; margin-bottom: 10px;
  }
  .cover-title {
    color: #fff; font-size: 62px; line-height: 1.06; font-weight: 600;
    margin: 0; letter-spacing: -.5px;
  }
  .cover-rule { width: 90px; height: 5px; background: ${C.gold}; margin: 30px 0 22px; }
  .cover-sub { color: #D7E1EA; font-size: 17px; line-height: 1.5; margin: 0; max-width: 610px; }
  .cover-foot { color: #7E93A8; font-size: 12.5px; margin: 74px 0 0; }
  .cover-edge { position: absolute; left: 0; right: 0; bottom: 0; height: 9px; display: flex; }
  .cover-edge i { height: 100%; }
  .cover-edge i:nth-child(1) { flex: 33; background: #0A3357; }
  .cover-edge i:nth-child(2) { flex: 12; background: #3D4A63; }
  .cover-edge i:nth-child(3) { flex: 33; background: #14487A; }
  .cover-edge i:nth-child(4) { flex: 22; background: #0A3357; }

  /* ── Section divider ───────────────────────────────────── */
  .divider { background: ${C.navy}; padding: 0; }
  .divider-num {
    position: absolute; left: 84px; top: 50%; transform: translateY(-50%);
    font-size: 200px; font-weight: 700; line-height: 1;
    color: rgba(255,255,255,.10);
  }
  .divider-body { position: absolute; left: 224px; top: 50%; transform: translateY(-50%); right: 90px; }
  .divider-kicker {
    color: ${C.gold}; font-size: 13px; font-weight: 600;
    letter-spacing: .2em; margin-bottom: 8px;
  }
  .divider-title { color: #fff; font-size: 44px; font-weight: 600; margin: 0 0 12px; letter-spacing: -.3px; }
  .divider-sub { color: #A9BCCD; font-size: 16px; margin: 0; }
  .divider-edge { position: absolute; left: 0; right: 0; bottom: 0; height: 11px; background: ${C.gold}; }

  /* ── Content slide furniture ───────────────────────────── */
  .kicker {
    color: ${C.goldInk}; font-size: 11px; font-weight: 600;
    letter-spacing: .17em; text-transform: uppercase;
  }
  h1 {
    color: ${C.navy}; font-size: 31px; font-weight: 600;
    margin: 5px 0 0; letter-spacing: -.3px;
  }
  .pill {
    display: inline-block; margin-top: 10px; padding: 5px 13px;
    background: #EDF2F7; border-radius: 999px;
    font-size: 11.5px; font-weight: 600; color: #3D5163;
  }
  .rule { height: 3px; background: ${C.navy}; margin: 13px 0 17px; }
  .content { font-size: 14.5px; line-height: 1.5; }

  .footer {
    position: absolute; left: 56px; right: 56px; bottom: 20px;
    display: flex; justify-content: space-between;
    padding-top: 9px; border-top: 1px solid ${C.border};
    color: ${C.muted}; font-size: 10.5px;
  }

  /* ── Text ──────────────────────────────────────────────── */
  .lead { font-size: 16px; line-height: 1.45; margin: 0 0 14px; color: ${C.ink}; }
  .para { margin: 0 0 10px; }
  strong { font-weight: 600; color: ${C.navy}; }
  code {
    font-family: "SF Mono", Menlo, monospace; font-size: .88em;
    background: ${C.cardBg}; padding: 1px 5px; border-radius: 3px; color: ${C.navy};
  }

  .bullets { list-style: none; margin: 0; padding: 0; }
  .bullets li { position: relative; padding-left: 21px; margin-bottom: 8px; }
  .bullets li::before {
    content: ""; position: absolute; left: 2px; top: 7px;
    width: 7px; height: 7px; background: ${C.gold}; transform: rotate(45deg);
  }

  .steps { list-style: none; margin: 0; padding: 0; counter-reset: s; }
  .steps li { display: flex; gap: 13px; margin-bottom: 10px; align-items: flex-start; }
  .stepnum {
    flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%;
    background: ${C.navy}; color: #fff; font-size: 12px; font-weight: 600;
    display: flex; align-items: center; justify-content: center; margin-top: 1px;
  }

  /* ── Callouts ──────────────────────────────────────────── */
  .callout {
    margin-top: 15px; padding: 11px 16px; border-left: 4px solid;
    border-radius: 0 5px 5px 0; font-size: 13.5px; line-height: 1.45;
  }
  .callout-label { font-size: 10.5px; font-weight: 700; letter-spacing: .13em; margin-bottom: 3px; }
  .note { background: ${C.noteBg}; border-color: ${C.noteBar}; }
  .note .callout-label { color: ${C.noteBar}; }
  .tip { background: ${C.tipBg}; border-color: ${C.gold}; }
  .tip .callout-label { color: ${C.tipInk}; }
  .important { background: ${C.redBg}; border-color: ${C.redBar}; }
  .important .callout-label { color: ${C.redBar}; }
  .important, .important strong { color: ${C.redInk}; }

  /* ── Table ─────────────────────────────────────────────── */
  .tbl { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .tbl th {
    background: ${C.navy}; color: #fff; text-align: left;
    padding: 9px 13px; font-weight: 600; font-size: 12.5px;
  }
  .tbl td { padding: 8px 13px; border-bottom: 1px solid ${C.border}; vertical-align: top; }
  .tbl tbody tr:nth-child(even) { background: ${C.cardBg}; }

  /* ── Cards ─────────────────────────────────────────────── */
  .cards { display: grid; gap: 12px; }
  .cards.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .cards.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .card {
    background: ${C.cardBg}; border-left: 4px solid ${C.navy};
    border-radius: 0 5px 5px 0; padding: 12px 15px;
  }
  .card-title { color: ${C.navy}; font-weight: 600; font-size: 14px; margin-bottom: 4px; }
  .card-text { font-size: 13px; color: #4A5F72; line-height: 1.4; }

  /* ── Two columns ───────────────────────────────────────── */
  .twocol { display: grid; grid-template-columns: 1fr 1fr; gap: 34px; }
  .colhead {
    color: ${C.navy}; font-size: 12.5px; font-weight: 700;
    letter-spacing: .1em; margin-bottom: 9px;
  }

  /* ── Flow ──────────────────────────────────────────────── */
  .flow { display: flex; align-items: stretch; gap: 7px; margin-bottom: 16px; }
  .flow-step {
    flex: 1; background: ${C.navy}; color: #fff; border-radius: 5px;
    padding: 12px 13px; font-size: 12.5px; line-height: 1.35;
  }
  .flow-step strong { color: #fff; }
  .flow-n { display: block; color: ${C.gold}; font-weight: 700; font-size: 12px; margin-bottom: 5px; }
  .flow-arrow { align-self: center; color: ${C.muted}; font-size: 15px; }
</style></head>
<body>
${body}
</body></html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
const tmpHtml = path.join(os.tmpdir(), `sms-supervision-orientation-${process.pid}.html`);
fs.writeFileSync(tmpHtml, html, "utf8");

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sms-chrome-"));
fs.rmSync(OUT_PDF, { force: true });
try {
  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--disable-extensions",
      `--user-data-dir=${profile}`,
      "--no-pdf-header-footer",
      `--print-to-pdf=${OUT_PDF}`,
      `file://${tmpHtml}`,
    ],
    { stdio: "pipe", timeout: 90_000 },
  );
} catch (err) {
  // Chrome writes the PDF and then sometimes lingers instead of exiting. A
  // timeout is only a real failure if the file never appeared.
  if (!fs.existsSync(OUT_PDF)) throw err;
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(tmpHtml, { force: true });
}

const kb = (fs.statSync(OUT_PDF).size / 1024).toFixed(0);
console.log(`✓ ${OUT_PDF}`);
console.log(`  ${slides.length} slides (${shown} numbered) · ${kb} KB`);
