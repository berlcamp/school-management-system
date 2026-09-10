/**
 * Blanks the division's RMA scoresheet workbook into a reusable template.
 *
 * The download at /teacher/assessments/rma fills the DepEd form itself rather
 * than rebuilding it: the workbook carries sheet protection, 18 data-validation
 * rules, conditional formatting, three charts and a Class Summary sheet that is
 * entirely formulas — none of which any JS writer reproduces faithfully. So the
 * issued file is committed as `public/templates/<out>.xlsx` with every value a
 * school typed into it removed, and `lib/excel/generateRmaScoresheetWorkbook.ts`
 * writes the header block and the learner rows back in at download time.
 *
 * What is removed: the header identity cells, every learner row (B..S, W, X on
 * rows 10-109), the cached results of the formulas that fed off them, and the
 * shared strings those cells were the last reference to — the source file is a
 * real school's return and carries learner names, LRNs and birthdates.
 * What is kept: styles, merges, validations, conditional formats, drawings,
 * charts, protection, and every formula, including the shared-formula masters.
 *
 * Usage: node scripts/build-rma-template.mjs <source.xlsx> [outName]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOURCE = process.argv[2];
const OUT_NAME = process.argv[3] || "rma-g2-scoresheet";
if (!SOURCE) {
  console.error("Usage: node scripts/build-rma-template.mjs <source.xlsx> [outName]");
  process.exit(1);
}

const SHEET = "xl/worksheets/sheet1.xml"; // "G2 RMA Scoresheet"
const SUMMARY = "xl/worksheets/sheet3.xml"; // "Class Summary"
const FIRST_DATA_ROW = 10;
const LAST_DATA_ROW = 109;

/** Header cells a school fills in — cleared so the template ships anonymous. */
const HEADER_CELLS = ["C4", "C5", "C6", "C7", "F6", "F7", "K6", "K7", "O6", "O7"];
/** Learner-row columns that hold typed values (the rest are formulas). */
const DATA_COLUMNS = [
  "B", "C", "D", "E", "F", "H",
  "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S",
  "W", "X",
];

/** Matches one `<c r="ADDR" …/>` or `<c r="ADDR" …>…</c>` element. */
function cellPattern(addr) {
  return new RegExp(`<c r="${addr}"([^>]*?)(/>|>([\\s\\S]*?)</c>)`);
}

/** Strips a cell's content and type, keeping its `s=` style index. */
function blankCell(xml, addr) {
  return xml.replace(cellPattern(addr), (whole, attrs) => {
    const style = / s="(\d+)"/.exec(attrs);
    return `<c r="${addr}"${style ? ` s="${style[1]}"` : ""}/>`;
  });
}

/**
 * Drops every formula cell's cached result, so a template opened before Excel
 * recalculates shows blanks rather than the source school's figures. The `<f>`
 * element is preserved byte for byte — shared-formula masters carry their
 * `ref`/`si` there and dependents break without them.
 */
function dropCachedValues(xml) {
  // `[^>]*?[^>/]` refuses a self-closing `<c …/>`: allowing one would let the
  // match run past it and swallow the next cell whole.
  return xml.replace(/<c ([^>]*?[^>/])>([\s\S]*?)<\/c>/g, (whole, attrs, inner) => {
    if (!inner.includes("<f")) return whole;
    const formula = /<f[\s\S]*?(?:\/>|<\/f>)/.exec(inner);
    if (!formula) return whole;
    return `<c ${attrs.replace(/ ?t="[^"]*"/, "")}>${formula[0]}</c>`;
  });
}

const zip = unzipSync(new Uint8Array(fs.readFileSync(SOURCE)));

// ─── 1. Blank the scoresheet ────────────────────────────────────────────────
let sheet = strFromU8(zip[SHEET]);
for (const addr of HEADER_CELLS) sheet = blankCell(sheet, addr);
for (let row = FIRST_DATA_ROW; row <= LAST_DATA_ROW; row++) {
  for (const col of DATA_COLUMNS) sheet = blankCell(sheet, `${col}${row}`);
}
zip[SHEET] = strToU8(dropCachedValues(sheet));
zip[SUMMARY] = strToU8(dropCachedValues(strFromU8(zip[SUMMARY])));

// ─── 2. Recalculate everything on open ──────────────────────────────────────
let workbook = strFromU8(zip["xl/workbook.xml"]);
workbook = workbook.includes("<calcPr")
  ? workbook.replace(/<calcPr([^>]*?)\/>/, (m, attrs) =>
      `<calcPr${attrs.replace(/ fullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"/>`)
  : workbook.replace("</workbook>", '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
zip["xl/workbook.xml"] = strToU8(workbook);

// ─── 3. Scrub shared strings nothing references any more ────────────────────
const referenced = new Set();
for (const name of Object.keys(zip)) {
  if (!name.startsWith("xl/worksheets/sheet")) continue;
  const xml = strFromU8(zip[name]);
  for (const m of xml.matchAll(/<c [^>]*t="s"[^>]*>\s*<v>(\d+)<\/v>/g)) {
    referenced.add(Number(m[1]));
  }
}
let strings = strFromU8(zip["xl/sharedStrings.xml"]);
let index = -1;
let dropped = 0;
strings = strings.replace(/<si>[\s\S]*?<\/si>/g, (item) => {
  index += 1;
  if (referenced.has(index)) return item;
  dropped += 1;
  return "<si><t/></si>";
});
zip["xl/sharedStrings.xml"] = strToU8(strings);

// ─── 4. Scrub document properties ───────────────────────────────────────────
if (zip["docProps/core.xml"]) {
  let core = strFromU8(zip["docProps/core.xml"]);
  core = core
    .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, "<dc:creator></dc:creator>")
    .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, "<cp:lastModifiedBy></cp:lastModifiedBy>");
  zip["docProps/core.xml"] = strToU8(core);
}

const outDir = path.resolve(__dirname, "..", "public", "templates");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${OUT_NAME}.xlsx`);
fs.writeFileSync(outPath, Buffer.from(zipSync(zip, { level: 9 })));

console.log(`Wrote ${outPath}`);
console.log(`Shared strings emptied: ${dropped} of ${index + 1}`);
