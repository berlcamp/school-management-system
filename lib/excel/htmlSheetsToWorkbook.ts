/**
 * A printed form's HTML → an Excel worksheet, in the browser.
 *
 * The SBFP forms are authored once, as the HTML the print dialog renders
 * (`lib/pdf/generateSbfpForms.ts`). Rather than re-type every form's columns a
 * second time for Excel — and let the two drift — this walks that same HTML:
 * header lines become merged title rows, the label/value field blocks become
 * two-cell rows, every `<table>` is copied cell for cell with its `rowspan` /
 * `colspan` turned into merges, and signature blocks sit side by side under it.
 *
 * Whole numbers and decimals are written as numbers so the sheet sums; a
 * "12.50%" cell is written as 0.125 formatted as a percentage. Everything else
 * stays text, verbatim from the printout.
 *
 * Needs `DOMParser`, so it runs in the browser only.
 */

import * as XLSX from "xlsx";

type Cell = string | number;

interface SheetBuild {
  aoa: Cell[][];
  merges: XLSX.Range[];
  /** Rows (header lines, titles, notes) merged across the sheet's full width. */
  wideRows: number[];
  percentCells: { r: number; c: number }[];
  /** Widest column any table used — titles and signatures lay out against it. */
  width: number;
}

const SKIP = new Set(["IMG", "STYLE", "SCRIPT"]);
const BLOCK = new Set(["DIV", "TABLE", "P", "UL", "OL", "LI"]);

/** Text of an element, `<br>` and block children as line breaks, whitespace collapsed. */
function textOf(node: Node, blocks: ReadonlySet<string> = BLOCK): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      parts.push((n.textContent ?? "").replace(/\s+/g, " "));
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    if (SKIP.has(el.tagName)) return;
    if (el.tagName === "BR") {
      parts.push("\n");
      return;
    }
    const block = blocks.has(el.tagName);
    if (block) parts.push("\n");
    el.childNodes.forEach(walk);
    if (block) parts.push("\n");
  };
  walk(node);
  return parts
    .join("")
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trim())
    .filter((l) => l !== "")
    .join("\n");
}

const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const PERCENT = /^-?\d+(\.\d+)?%$/;

function cellValue(text: string): { value: Cell; percent: boolean } {
  if (NUMBER.test(text)) return { value: Number(text), percent: false };
  if (PERCENT.test(text)) return { value: Number(text.slice(0, -1)) / 100, percent: true };
  return { value: text, percent: false };
}

function addRow(b: SheetBuild, cells: Cell[] = [], wide = false): number {
  b.aoa.push(cells);
  const r = b.aoa.length - 1;
  if (wide) b.wideRows.push(r);
  return r;
}

function addTable(b: SheetBuild, table: HTMLTableElement): void {
  const start = b.aoa.length;
  // Cells taken by a rowspan from a row above, per absolute row.
  const taken = new Map<number, Set<number>>();
  const occupy = (r: number, c: number) => {
    if (!taken.has(r)) taken.set(r, new Set());
    taken.get(r)!.add(c);
  };

  Array.from(table.rows).forEach((tr, i) => {
    const r = start + i;
    const row: Cell[] = [];
    let c = 0;
    for (const td of Array.from(tr.cells)) {
      while (taken.get(r)?.has(c)) c++;
      const rs = Math.max(1, td.rowSpan || 1);
      const cs = Math.max(1, td.colSpan || 1);
      const { value, percent } = cellValue(textOf(td));
      row[c] = value;
      if (percent) b.percentCells.push({ r, c });
      if (rs > 1 || cs > 1) {
        b.merges.push({ s: { r, c }, e: { r: r + rs - 1, c: c + cs - 1 } });
      }
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) occupy(r + dr, c + dc);
      }
      c += cs;
    }
    b.width = Math.max(b.width, c);
    for (let k = 0; k < row.length; k++) if (row[k] === undefined) row[k] = "";
    b.aoa.push(row);
  });
  addRow(b);
}

/** `Label: <span class="v">value</span>` → ["Label:", "value"]. */
function addFields(b: SheetBuild, fields: Element): void {
  for (const child of Array.from(fields.children)) {
    const v = child.querySelector(".v");
    if (v) {
      const label = textOf(child).slice(0, -textOf(v).length || undefined).trim();
      addRow(b, [label, textOf(v)]);
    } else {
      const t = textOf(child);
      if (t) addRow(b, [t]);
    }
  }
  addRow(b);
}

/** Signature blocks side by side: label, blank line, name, role. */
function addSignatures(b: SheetBuild, sigs: Element): void {
  const blocks = Array.from(sigs.children);
  if (blocks.length === 0) return;
  const step = Math.max(3, Math.floor(Math.max(b.width, 6) / blocks.length));
  const lines: Cell[][] = [[], [], [], []];
  blocks.forEach((sig, k) => {
    const col = k * step;
    const get = (sel: string) => {
      const el = sig.querySelector(sel);
      return el ? textOf(el) : "";
    };
    lines[0][col] = get(".lbl");
    lines[2][col] = get(".name");
    lines[3][col] = get(".role");
  });
  addRow(b);
  for (const line of lines) {
    for (let k = 0; k < line.length; k++) if (line[k] === undefined) line[k] = "";
    addRow(b, line);
  }
  addRow(b);
}

/** A legend's bold heading prints on its own line (`.legend b { display: block }`). */
const LEGEND_BLOCK = new Set([...BLOCK, "B"]);

/** Legend columns printed side by side become one block after another. */
function addLegend(b: SheetBuild, legend: Element): void {
  for (const col of Array.from(legend.children)) {
    for (const line of textOf(col, LEGEND_BLOCK).split("\n")) addRow(b, [line]);
    addRow(b);
  }
}

function walk(b: SheetBuild, el: Element): void {
  if (SKIP.has(el.tagName)) return;
  const cls = el.classList;
  if (el.tagName === "TABLE") return addTable(b, el as HTMLTableElement);
  if (cls.contains("fields")) return addFields(b, el);
  if (cls.contains("sigs")) return addSignatures(b, el);
  if (cls.contains("legend")) return addLegend(b, el);

  const hasBlockChild = Array.from(el.children).some(
    (c) => BLOCK.has(c.tagName) && !SKIP.has(c.tagName),
  );
  if (hasBlockChild) {
    for (const child of Array.from(el.children)) walk(b, child);
    return;
  }
  const t = textOf(el);
  if (t) addRow(b, [t], true);
}

function buildSheet(doc: Document, html: string): SheetBuild {
  const b: SheetBuild = { aoa: [], merges: [], wideRows: [], percentCells: [], width: 1 };
  const host = doc.createElement("div");
  host.innerHTML = html;
  for (const child of Array.from(host.children)) walk(b, child);
  // Drop trailing blank rows.
  while (b.aoa.length > 0 && b.aoa[b.aoa.length - 1].length === 0) b.aoa.pop();
  return b;
}

function columnWidths(b: SheetBuild): { wch: number }[] {
  const wide = new Set(b.wideRows);
  const widths = Array.from({ length: b.width }, () => 6);
  b.aoa.forEach((row, r) => {
    if (wide.has(r)) return;
    row.forEach((cell, c) => {
      if (c >= widths.length) return;
      const longest = Math.max(...String(cell).split("\n").map((l) => l.length));
      widths[c] = Math.min(40, Math.max(widths[c], longest + 2));
    });
  });
  return widths.map((wch) => ({ wch }));
}

/** Excel sheet names: ≤ 31 characters, none of []:*?/\, unique in the book. */
export function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
  let out = base;
  for (let n = 2; used.has(out.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    out = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(out.toLowerCase());
  return out;
}

export interface HtmlSheet {
  name: string;
  /** One printed sheet's HTML — what the form builder returns for a page. */
  html: string;
}

export function htmlSheetsToWorkbook(sheets: HtmlSheet[]): XLSX.WorkBook {
  const doc = new DOMParser().parseFromString("<!DOCTYPE html><html><body></body></html>", "text/html");
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) {
    const b = buildSheet(doc, s.html);
    const ws = XLSX.utils.aoa_to_sheet(b.aoa.length > 0 ? b.aoa : [[""]]);
    const last = Math.max(b.width - 1, 0);
    for (const r of b.wideRows) {
      if (last > 0) b.merges.push({ s: { r, c: 0 }, e: { r, c: last } });
    }
    ws["!merges"] = b.merges;
    ws["!cols"] = columnWidths(b);
    for (const { r, c } of b.percentCells) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.z = "0.00%";
    }
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(s.name, used));
  }
  return wb;
}

export function downloadHtmlSheetsAsExcel(sheets: HtmlSheet[], filename: string): void {
  XLSX.writeFile(htmlSheetsToWorkbook(sheets), filename);
}
