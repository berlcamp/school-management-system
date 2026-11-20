/**
 * Build a real answer sheet image for the scan test to upload.
 *
 * The fixture is rendered from the production layout at test time rather than
 * checked in as a binary, so the sheet the browser decodes is always the sheet
 * the current geometry describes. A stale PNG committed to the repo would keep
 * passing after a layout change that had already broken every printed sheet.
 *
 * PNG is written by hand (8-bit grayscale, filter 0, node's zlib) because the
 * project has no image encoder and does not need one in production.
 */

import zlib from "node:zlib";
import {
  marksFromLetters,
  renderSheet,
  type RenderOptions,
} from "../../lib/omr/__tests__/renderSheet";
import {
  buildSheetLayout,
  encodeStudentCode,
  SHEETS_PER_PAGE,
  type SheetFormat,
} from "../../lib/omr/layout";
import { itemSpecsFromKey, type AnswerKeyItem } from "../../lib/omr/score";

export interface SheetFixtureOptions extends RenderOptions {
  answerKey: AnswerKeyItem[];
  studentId: number;
  /** One entry per item: the letter marked, or null for a blank. */
  answers: (string | null)[];
  /** Paper size; a half / quarter render is one CUT strip. */
  format?: SheetFormat;
  /** 1-based items where the next choice is shaded as well — a double mark. */
  doubleMarked?: number[];
}

/** A PNG of one filled-in answer sheet, ready to hand to setInputFiles. */
export function renderSheetPng(options: SheetFixtureOptions): Buffer {
  const { answerKey, studentId, answers, format, doubleMarked, ...renderOptions } =
    options;
  const layout = buildSheetLayout(itemSpecsFromKey(answerKey), format);
  const marks: (number | null | number[])[] = marksFromLetters(answers);
  for (const item of doubleMarked ?? []) {
    const first = marks[item - 1];
    if (typeof first === "number") marks[item - 1] = [first, (first + 1) % 4];
  }

  const image = renderSheet(
    layout,
    {
      marks,
      idDigits: encodeStudentCode(studentId),
    },
    renderOptions,
  );

  return encodeGrayPng(image.width, image.height, image.data);
}

/**
 * A whole A4 page of strips left UNCUT, one learner per strip — what a teacher
 * gets by putting the printout straight on the scanner.
 */
export function renderUncutPagePng(options: {
  answerKey: AnswerKeyItem[];
  format: "half" | "quarter";
  sheets: { studentId: number; answers: (string | null)[] }[];
  scale?: number;
}): Buffer {
  const scale = options.scale ?? 4;
  const layout = buildSheetLayout(itemSpecsFromKey(options.answerKey), options.format);
  const width = Math.round(210 * scale);
  const height = Math.round(297 * scale);
  const page = new Uint8Array(width * height).fill(255);
  const stripPx = Math.round(layout.pageWidthMm * scale);
  options.sheets.slice(0, SHEETS_PER_PAGE[options.format]).forEach((sheet, slot) => {
    const strip = renderSheet(
      layout,
      { marks: marksFromLetters(sheet.answers), idDigits: encodeStudentCode(sheet.studentId) },
      { scale },
    );
    for (let y = 0; y < Math.min(strip.height, height); y += 1) {
      for (let x = 0; x < strip.width; x += 1) {
        const tx = slot * stripPx + x;
        if (tx < width) page[y * width + tx] = strip.data[y * strip.width + x];
      }
    }
  });
  return encodeGrayPng(width, height, page);
}

function encodeGrayPng(
  width: number,
  height: number,
  pixels: Uint8Array,
): Buffer {
  // Each scanline is prefixed with its filter type; 0 = none.
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0;
    Buffer.from(pixels.subarray(y * width, (y + 1) * width)).copy(
      raw,
      y * (width + 1) + 1,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: grayscale
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
