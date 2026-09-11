import {
  blockPS,
  blockWS,
  blocksOf,
  descriptor,
  groupBlocks,
  hasNestedBlocks,
  initialGrade,
  isWeightedBlock,
  itemWS,
  itemsOfBlock,
  learnerName,
  maxTotalOf,
  rawTotalOf,
  schemeOf,
  termGrade,
} from "@/app/(protected)/teacher/class-record/components/classRecordUtils";
import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";
import {
  ClassRecord,
  ClassRecordBlockRow,
  ClassRecordItem,
  Student,
} from "@/types";

export interface ClassRecordPrintParams {
  schoolId: number | null;
  subjectName: string;
  sectionName: string;
  schoolYear: string;
  termLabel: string;
  teacherName: string;
  record: ClassRecord;
  /** Empty on a standard record — its three weight columns are the blocks. */
  blockRows: ClassRecordBlockRow[];
  items: ClassRecordItem[];
  students: Student[];
  scores: Record<string, Record<string, number | null>>; // studentId -> itemId -> score
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function generateClassRecordPrint(
  params: ClassRecordPrintParams
): Promise<void> {
  const {
    schoolId,
    subjectName,
    sectionName,
    schoolYear,
    termLabel,
    teacherName,
    record,
    blockRows,
    items,
    students,
    scores,
  } = params;

  // School header + principal signatory.
  let schoolName = "";
  let schoolAddress = "";
  let principalName = "";
  let principalTitle = "Principal";
  if (schoolId) {
    const { data: school } = await supabase
      .from("sms_schools")
      .select("name, address, district")
      .eq("id", schoolId)
      .maybeSingle();
    if (school) {
      schoolName = school.name ?? "";
      schoolAddress = [school.address, school.district].filter(Boolean).join(", ");
    }
    const { data: settings } = await supabase
      .from("sms_school_settings")
      .select("principal_name, principal_title")
      .eq("school_id", String(schoolId))
      .maybeSingle();
    if (settings) {
      principalName = settings.principal_name ?? "";
      principalTitle = settings.principal_title ?? "Principal";
    }
  }

  // Column headings and the descriptor band both follow the scheme the record
  // was graded under, so reprinting an old term reproduces the old form; the
  // blocks follow its layout, so a GMRC record prints its six domains.
  const scheme = schemeOf(record);
  const blocks = blocksOf(record, blockRows);
  const nested = hasNestedBlocks(blocks);
  const headerRows = nested ? 4 : 3;
  const males = students.filter((s) => s.gender === "male");
  const females = students.filter((s) => s.gender === "female");

  // ----- column model -------------------------------------------------------
  // Every column carries its own printed width, so the sheet can be split over
  // several pages without a column changing size from one page to the next, and
  // so nothing can be pushed off the right edge: before this the table was laid
  // out `width: 100%` with an auto algorithm, and a record with a normal number
  // of activities overflowed the page — the Descriptor, Term Grade and even the
  // Performance Tasks columns were simply clipped away by the printer.
  // Widths are millimetres against A4 landscape's 276.7mm of printable width
  // (297mm less two 0.4in margins).
  const W = {
    name: 42,
    itemWs: 8.5,
    total: 8.5,
    ps: 7,
    blockWs: 8.5,
    initial: 9,
    term: 9,
    desc: 14,
  };
  const PAGE_W = 275; // a hair under the printable width, for rounding
  const TRAILING_W = W.initial + W.term + W.desc;
  /**
   * The activity columns are the only ones that give: everything else prints a
   * fixed string ("18.00", "100", a descriptor) and cannot be squeezed. So the
   * sheet is fitted by widening or narrowing those, roomy when a record has few
   * activities and down to ITEM_MIN before a continuation sheet is started.
   * ITEM_MIN holds a three-digit score at 7pt without wrapping.
   */
  const ITEM_MIN = 4.6;
  const ITEM_MAX = 14;

  interface PrintCol {
    /** Index into `blocks`, so the header rows can re-span per page. */
    block: number;
    width: number;
    num: string;
    title: string;
    hps: string;
    cell: (sc: Record<string, number | null>) => string;
  }

  const fixed = (v: number | null, digits: number) =>
    v === null ? "" : v.toFixed(digits);

  // Fit pass: how wide can an activity column be and still leave room for the
  // fixed columns and the three grade columns on one sheet?
  const itemCount = blocks.reduce(
    (n, b) => n + itemsOfBlock(items, b).length,
    0
  );
  const fixedW = blocks.reduce((n, b) => {
    const count = itemsOfBlock(items, b).length;
    const summary = isWeightedBlock(b) ? count * W.itemWs : W.total;
    return n + summary + W.ps + W.blockWs;
  }, W.name + TRAILING_W);
  const itemW = itemCount
    ? Math.floor(
        Math.min(ITEM_MAX, Math.max(ITEM_MIN, (PAGE_W - fixedW) / itemCount)) *
          100
      ) / 100
    : ITEM_MAX;

  const cols: PrintCol[] = [];
  blocks.forEach((b, bi) => {
    const colItems = itemsOfBlock(items, b);
    colItems.forEach((it, i) => {
      cols.push({
        block: bi,
        width: itemW,
        num: String(i + 1),
        title: it.label ?? "",
        hps: String(Number(it.max_score)),
        cell: (sc) => {
          const v = sc[it.id];
          return v === undefined || v === null ? "" : String(v);
        },
      });
    });
    // The Examinations block prints one weighted score per exam where a pooled
    // block prints a TOTAL, and carries each exam's weight in the HPS row —
    // the DepEd form's own layout.
    if (isWeightedBlock(b)) {
      colItems.forEach((it, i) => {
        cols.push({
          block: bi,
          width: W.itemWs,
          num: `WS ${i + 1}`,
          title: it.label ?? "",
          hps: String(Number(it.weight ?? 0)),
          cell: (sc) => fixed(itemWS(it, sc), 2),
        });
      });
    } else {
      cols.push({
        block: bi,
        width: W.total,
        num: "TOTAL",
        title: "",
        hps: String(maxTotalOf(colItems)),
        cell: (sc) => (colItems.length ? String(rawTotalOf(colItems, sc)) : ""),
      });
    }
    cols.push({
      block: bi,
      width: W.ps,
      num: "PS",
      title: "",
      hps: "100",
      cell: (sc) => fixed(blockPS(items, b, sc), 0),
    });
    cols.push({
      block: bi,
      width: W.blockWs,
      num: "WS",
      title: "",
      hps: `${b.weight}%`,
      cell: (sc) => fixed(blockWS(items, b, sc), 2),
    });
  });

  // ----- pagination ---------------------------------------------------------
  // Greedy fill; the three grade columns ride on the last sheet when they fit
  // and take a continuation sheet of their own when they do not.
  const budget = PAGE_W - W.name;
  const EPS = 0.01; // millimetre arithmetic, not exact arithmetic
  const pages: PrintCol[][] = [];
  let current: PrintCol[] = [];
  let used = 0;
  cols.forEach((c) => {
    if (current.length > 0 && used + c.width > budget + EPS) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(c);
    used += c.width;
  });
  if (current.length > 0) pages.push(current);
  if (pages.length === 0) pages.push([]);
  const lastWidth = pages[pages.length - 1].reduce((n, c) => n + c.width, 0);
  if (lastWidth + TRAILING_W > budget + EPS) pages.push([]);

  // A record that fits on one sheet gives what is left over to the names, so a
  // short record prints a readable name column instead of a narrow strip up the
  // left of the page.
  let nameWidth = W.name;
  if (pages.length === 1) {
    const slack =
      budget - TRAILING_W - pages[0].reduce((n, c) => n + c.width, 0);
    if (slack > 0) nameWidth += Math.min(slack, 30);
  }

  // ----- learner rows -------------------------------------------------------
  const renderSheet = (
    pageCols: PrintCol[],
    pageIndex: number,
    isLast: boolean
  ): string => {
    const tableW =
      nameWidth +
      pageCols.reduce((n, c) => n + c.width, 0) +
      (isLast ? TRAILING_W : 0);
    const totalCols = 1 + pageCols.length + (isLast ? 3 : 0);

    const colgroup = `<colgroup><col style="width:${nameWidth}mm"/>${pageCols
      .map((c) => `<col style="width:${c.width}mm"/>`)
      .join("")}${
      isLast
        ? `<col style="width:${W.initial}mm"/><col style="width:${W.term}mm"/><col style="width:${W.desc}mm"/>`
        : ""
    }</colgroup>`;

    // Consecutive columns of one block, so a block split over two sheets spans
    // only what is actually on this one.
    const spans: { block: number; count: number }[] = [];
    pageCols.forEach((c) => {
      const last = spans[spans.length - 1];
      if (last && last.block === c.block) last.count += 1;
      else spans.push({ block: c.block, count: 1 });
    });

    const blockHeader = spans
      .map(
        (s) =>
          `<th colspan="${s.count}" class="grp">${esc(blocks[s.block].label)} (${
            blocks[s.block].weight
          }%)</th>`
      )
      .join("");

    // Only a nested form needs the component row above its blocks.
    const componentHeader = nested
      ? groupBlocks(blocks, scheme)
          .map((g) => {
            const count = spans
              .filter((s) => g.blocks.includes(blocks[s.block]))
              .reduce((n, s) => n + s.count, 0);
            return count > 0
              ? `<th colspan="${count}" class="grp">${esc(g.title)}</th>`
              : "";
          })
          .join("")
      : "";

    const trailingHead = isLast
      ? `<th rowspan="${headerRows}">Initial<br/>Grade</th><th rowspan="${headerRows}">Term<br/>Grade</th><th rowspan="${headerRows}">Descriptor</th>`
      : "";

    const numberHeader = pageCols
      .map((c) => `<th>${esc(c.num)}</th>`)
      .join("");
    // The activity title reads up the column, as it is written on the paper
    // form: a horizontal title would set the column's width and blow the sheet
    // back off the page.
    const titleHeader = pageCols
      .map(
        (c) =>
          `<th class="title">${
            c.title ? `<span>${esc(c.title)}</span>` : ""
          }</th>`
      )
      .join("");
    const hpsHeader = pageCols.map((c) => `<th>${esc(c.hps)}</th>`).join("");

    const renderLearner = (s: Student, index: number): string => {
      const sc = scores[s.id] || {};
      const hasAny = items.some(
        (i) => sc[i.id] !== undefined && sc[i.id] !== null
      );
      const body = pageCols.map((c) => `<td>${c.cell(sc)}</td>`).join("");
      let tail = "";
      if (isLast) {
        const initial = hasAny ? initialGrade(blocks, items, sc).toFixed(2) : "";
        const term = hasAny ? termGrade(record, blocks, items, sc) : "";
        const desc = hasAny ? descriptor(Number(term), scheme) : "";
        tail = `<td>${initial}</td><td class="term">${term}</td><td class="desc">${esc(
          String(desc)
        )}</td>`;
      }
      return `<tr>
      <td class="name">${index}. ${esc(learnerName(s))}</td>
      ${body}${tail}
    </tr>`;
    };

    const groupRow = (label: string) =>
      `<tr class="group"><td colspan="${totalCols}">${label}</td></tr>`;
    const maleRows = males.map((s, i) => renderLearner(s, i + 1)).join("");
    const femaleRows = females.map((s, i) => renderLearner(s, i + 1)).join("");

    const sheetNote =
      pages.length > 1
        ? ` &nbsp;&nbsp; <b>Sheet:</b> ${pageIndex + 1} of ${pages.length}`
        : "";

    return `<div class="sheet"${pageIndex > 0 ? ' style="page-break-before: always;"' : ""}>
${buildDepEdHeaderWithLogos(
  `<div class="l1">${esc(schoolName || "")}</div>
     <div class="l2">${esc(schoolAddress || "")}</div>
     <div class="l3">Class Record — ${esc(termLabel)}</div>`
)}
<div class="meta">
  <div><b>Subject:</b> ${esc(subjectName)} &nbsp;&nbsp; <b>Section:</b> ${esc(sectionName)}</div>
  <div><b>School Year:</b> ${esc(schoolYear)} &nbsp;&nbsp; <b>Teacher:</b> ${esc(teacherName)}${sheetNote}</div>
</div>
<table class="cr" style="width:${tableW}mm">
  ${colgroup}
  <thead>
    <tr><th rowspan="${headerRows}" class="name">Learners' Names</th>${
      nested ? componentHeader : blockHeader
    }${trailingHead}</tr>
    ${nested ? `<tr>${blockHeader}</tr>` : ""}
    <tr>${numberHeader}</tr>
    <tr>${titleHeader}</tr>
    <tr><th class="name">Highest Possible Score</th>${hpsHeader}${
      isLast ? "<th>100</th><th>100</th><th></th>" : ""
    }</tr>
  </thead>
  <tbody>
    ${groupRow("MALE")}
    ${maleRows || `<tr><td colspan="${totalCols}"></td></tr>`}
    ${groupRow("FEMALE")}
    ${femaleRows || `<tr><td colspan="${totalCols}"></td></tr>`}
  </tbody>
</table>
${
  isLast
    ? `<div class="sign">
  <div class="box"><div class="line">${esc(teacherName)}</div>Teacher</div>
  <div class="box"><div class="line">${esc(principalName)}</div>${esc(principalTitle)}</div>
</div>`
    : ""
}
</div>`;
  };

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Class Record — ${esc(subjectName)} — ${esc(sectionName)}</title>
<style>
@page { size: A4 landscape; margin: 0.4in; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #000; }
${DEPED_HEADER_LOGOS_STYLES}
.deped-header-center .l1 { font-size: 12pt; font-weight: bold; text-transform: uppercase; }
.deped-header-center .l2 { font-size: 9pt; }
.deped-header-center .l3 { font-size: 11pt; font-weight: bold; margin-top: 6px; text-transform: uppercase; letter-spacing: 1px; }
.meta { display: flex; justify-content: space-between; font-size: 9pt; margin: 6px 0; }
.meta b { font-weight: bold; }
table.cr { border-collapse: collapse; table-layout: fixed; font-size: 7pt; }
table.cr th, table.cr td { border: 1px solid #000; padding: 2px 1px; text-align: center; white-space: nowrap; }
/* The name wraps rather than running on: the column is fixed, so a long name
   takes a second line instead of being cut off at the column edge. */
table.cr td.name, table.cr th.name { text-align: left; padding: 2px 3px; white-space: normal; overflow-wrap: anywhere; }
table.cr th.grp { white-space: normal; overflow-wrap: anywhere; }
table.cr th.title { font-weight: normal; font-size: 6pt; vertical-align: bottom; height: 26mm; padding: 1px 0; }
table.cr th.title span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; max-height: 24mm; overflow: hidden; }
table.cr tr.group td { text-align: left; font-weight: bold; background: #eee; }
table.cr td.term { font-weight: bold; }
table.cr td.desc { font-size: 6pt; white-space: normal; overflow-wrap: anywhere; }
.sign { display: flex; justify-content: space-between; margin-top: 28px; font-size: 9pt; }
.sign .box { text-align: center; width: 45%; }
.sign .line { border-top: 1px solid #000; margin-top: 18px; padding-top: 2px; font-weight: bold; text-transform: uppercase; }
@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
${pages.map((p, i) => renderSheet(p, i, i === pages.length - 1)).join("\n")}
</body>
</html>`;

  printHTMLContent(html);
}
