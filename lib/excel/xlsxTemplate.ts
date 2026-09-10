/**
 * Minimal SpreadsheetML cell surgery — enough to fill an issued DepEd workbook
 * without rewriting it.
 *
 * The DepEd forms this fills carry sheet protection, data validations, three
 * charts, conditional formatting and a summary sheet made entirely of formulas.
 * Every JS spreadsheet writer available to us either drops that furniture on a
 * read/write round trip (SheetJS community loses styles; ExcelJS loses charts)
 * or cannot author it at all, so the file is never re-written: the committed
 * template's own XML is patched in place, cell by cell, and the rest of the zip
 * is repacked untouched.
 *
 * Deliberately narrow. It writes a value, a formula or a blank into a cell,
 * preserving that cell's style index, and inserts the cell in column order when
 * the template has none there. It does not create rows, resize the used range,
 * or touch anything else.
 *
 * ⚠ Writing a plain formula over a cell that is a *shared*-formula master (the
 * one carrying `ref=` and the formula text) orphans every dependent that points
 * at its `si`, and Excel refuses to open the file. Rewrite the whole shared
 * range or none of it — see `LEVELLING_ROWS` in generateRmaScoresheetWorkbook.
 */

export type CellPatch =
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "formula"; value: string }
  | { kind: "blank" };

export const blank: CellPatch = { kind: "blank" };
export const num = (value: number): CellPatch => ({ kind: "number", value });
export const text = (value: string): CellPatch => ({ kind: "text", value });
export const formula = (value: string): CellPatch => ({
  kind: "formula",
  value,
});

/** Escapes the five XML entities. Applies to both text and formula bodies. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 1-based column index for a column letter ("A" → 1, "AB" → 28). */
export function columnIndex(letters: string): number {
  let index = 0;
  for (const ch of letters.toUpperCase()) {
    index = index * 26 + (ch.charCodeAt(0) - 64);
  }
  return index;
}

/** Column letter for a 1-based index (1 → "A", 28 → "AB"). */
export function columnLetter(index: number): string {
  let n = index;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function splitAddress(addr: string): { column: string; row: number } {
  const m = /^([A-Za-z]+)(\d+)$/.exec(addr);
  if (!m) throw new Error(`Not a cell address: ${addr}`);
  return { column: m[1].toUpperCase(), row: Number(m[2]) };
}

/**
 * Excel's 1900 date serial. Dates are days since 1899-12-30 (the offset absorbs
 * Excel's phantom 1900 leap day). Parsed as UTC so a learner's birthdate does
 * not shift a day for a teacher west of Greenwich.
 */
export function excelSerial(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const iso = typeof date === "string" ? date.slice(0, 10) : null;
  const ms = iso
    ? Date.parse(`${iso}T00:00:00Z`)
    : Date.UTC(
        (date as Date).getFullYear(),
        (date as Date).getMonth(),
        (date as Date).getDate(),
      );
  if (Number.isNaN(ms)) return null;
  return Math.round(ms / 86_400_000) + 25_569;
}

function renderCell(addr: string, style: string | null, patch: CellPatch): string {
  const s = style === null ? "" : ` s="${style}"`;
  switch (patch.kind) {
    case "blank":
      return `<c r="${addr}"${s}/>`;
    case "number":
      return `<c r="${addr}"${s}><v>${patch.value}</v></c>`;
    case "text":
      // Inline strings, so the workbook's shared string table is never touched
      // and indices in every other sheet stay valid.
      return `<c r="${addr}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(patch.value)}</t></is></c>`;
    case "formula":
      // No cached <v>: the template sets fullCalcOnLoad, so Excel computes it.
      return `<c r="${addr}"${s}><f>${escapeXml(patch.value)}</f></c>`;
  }
}

/** Existing `<c r="ADDR" …/>` or `<c r="ADDR" …>…</c>`, whichever the row has. */
function cellPattern(addr: string): RegExp {
  return new RegExp(`<c r="${addr}"(?: [^>]*?)?(?:/>|>[\\s\\S]*?</c>)`);
}

function styleOf(cellXml: string): string | null {
  const m = / s="(\d+)"/.exec(cellXml);
  return m ? m[1] : null;
}

/** Places a rendered cell into a row's XML, in column order. */
function insertCell(rowXml: string, addr: string, rendered: string): string {
  const { column } = splitAddress(addr);
  const target = columnIndex(column);
  for (const m of rowXml.matchAll(/<c r="([A-Z]+)\d+"/g)) {
    if (columnIndex(m[1]) > target) {
      return rowXml.slice(0, m.index) + rendered + rowXml.slice(m.index);
    }
  }
  const close = rowXml.lastIndexOf("</row>");
  if (close === -1) {
    // A self-closing <row …/> has to become a container first.
    return rowXml.replace(/\/>$/, `>${rendered}</row>`);
  }
  return rowXml.slice(0, close) + rendered + rowXml.slice(close);
}

/**
 * Writes `patches` into a worksheet's XML. Addresses whose row is absent from
 * the template are skipped — the template owns the sheet's shape.
 */
export function setCells(
  sheetXml: string,
  patches: Record<string, CellPatch>,
): string {
  const byRow = new Map<number, [string, CellPatch][]>();
  for (const [addr, patch] of Object.entries(patches)) {
    const { row } = splitAddress(addr);
    const list = byRow.get(row);
    if (list) list.push([addr, patch]);
    else byRow.set(row, [[addr, patch]]);
  }

  let xml = sheetXml;
  for (const [row, cells] of byRow) {
    const rowPattern = new RegExp(
      `<row r="${row}"(?: [^>]*?)?(?:/>|>[\\s\\S]*?</row>)`,
    );
    const found = rowPattern.exec(xml);
    if (!found) continue;

    let rowXml = found[0];
    for (const [addr, patch] of cells) {
      const existing = cellPattern(addr).exec(rowXml);
      const rendered = renderCell(
        addr,
        existing ? styleOf(existing[0]) : null,
        patch,
      );
      rowXml = existing
        ? rowXml.slice(0, existing.index) +
          rendered +
          rowXml.slice(existing.index + existing[0].length)
        : insertCell(rowXml, addr, rendered);
    }
    xml = xml.slice(0, found.index) + rowXml + xml.slice(found.index + found[0].length);
  }
  return xml;
}
