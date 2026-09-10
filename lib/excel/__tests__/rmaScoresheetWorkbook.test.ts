import fs from "fs";
import path from "path";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  levellingFormula,
  scoresheetPatches,
  summaryPatches,
  templateFits,
  workbookFilename,
  type RmaWorkbookParams,
} from "../generateRmaScoresheetWorkbook";
import { columnLetter, excelSerial, setCells } from "../xlsxTemplate";
import type { RmaBand, RmaItem, RmaMaterial, Student } from "@/types";

const TEMPLATE = path.resolve(
  __dirname,
  "../../../public/templates/rma-g2-scoresheet.xlsx",
);
const SHEET_PART = "xl/worksheets/sheet1.xml";
const SUMMARY_PART = "xl/worksheets/sheet3.xml";

const TASKS: [string, number][] = [
  ["Task A", 3],
  ["Task B", 1],
  ["Task C", 2],
  ["Task D", 1],
  ["Task E", 4],
  ["Task F", 3],
  ["Task G", 3],
  ["Task H", 4],
  ["Task I", 2],
  ["Task J", 1],
  ["Task K", 1],
];

function item(index: number): RmaItem {
  const [domain, max] = TASKS[index];
  return {
    id: `item-${index}`,
    material_id: "m1",
    item_no: index + 1,
    domain,
    question_text: null,
    correct_answer: null,
    max_score: max,
    position: index,
    created_at: "",
    updated_at: "",
  };
}

function band(min: number, max: number, label: string, position: number): RmaBand {
  return {
    id: `band-${position}`,
    material_id: "m1",
    min_score: min,
    max_score: max,
    label,
    position,
    created_at: "",
    updated_at: "",
  };
}

function student(id: string, last: string, gender: "male" | "female"): Student {
  return {
    id,
    lrn: `13161824000${id}`,
    first_name: "Juan",
    middle_name: "Molina",
    last_name: last,
    date_of_birth: "2018-05-06",
    gender,
    mother_tongue: "Sinugbuanong Binisaya",
    enrollment_status: "enrolled",
    created_at: "",
    updated_at: "",
  } as Student;
}

const material: RmaMaterial = {
  id: "m1",
  school_id: null,
  title: "RMA Grade 2",
  grade_level: 2,
  instructions: null,
  is_active: true,
  created_by: null,
  created_at: "",
  updated_at: "",
};

const items = TASKS.map((_, i) => item(i));

const params = (overrides: Partial<RmaWorkbookParams> = {}): RmaWorkbookParams => ({
  material,
  items,
  bands: [
    band(0, 74.99, "Intervention", 0),
    band(75, 84.99, "Consolidation", 1),
    band(85, 100, "Enhancement", 2),
  ],
  students: [student("1", "AMOR", "male"), student("2", "BOLANDO", "female")],
  scores: {
    "1": { "item-0": 1, "item-1": 1, "item-4": 2, "item-8": 2 },
    "2": {},
  },
  meta: {
    "1": { date_assessed: "2026-06-09", remarks: "Needs drills" },
    "2": { date_assessed: null, remarks: null },
  },
  sectionName: "Watermelon",
  gradeLevel: 2,
  schoolCode: "131618",
  schoolName: "Cagbas Elementary School",
  region: "CARAGA",
  teacherName: "Alma S. Gonzales",
  phase: "BoSY",
  schoolYear: "2026-2027",
  ...overrides,
});

/** Fills the committed template exactly as the browser download does. */
function fill(p: RmaWorkbookParams) {
  const zip = unzipSync(new Uint8Array(fs.readFileSync(TEMPLATE)));
  const sheetXml = setCells(strFromU8(zip[SHEET_PART]), scoresheetPatches(p));
  const summaryXml = setCells(strFromU8(zip[SUMMARY_PART]), summaryPatches(p));
  zip[SHEET_PART] = strToU8(sheetXml);
  zip[SUMMARY_PART] = strToU8(summaryXml);
  const book = XLSX.read(zipSync(zip), { type: "array", cellFormula: true });
  return { book, sheetXml, summaryXml };
}

describe("RMA scoresheet workbook", () => {
  it("keeps the issued workbook's three sheets and their names", () => {
    const { book } = fill(params());
    expect(book.SheetNames).toEqual([
      "G2 RMA Scoresheet",
      "List",
      "Class Summary",
    ]);
  });

  it("writes the header block the division prints on", () => {
    const { book } = fill(params());
    const s = book.Sheets["G2 RMA Scoresheet"];
    expect(s.C4.v).toBe("BoSY");
    expect(s.C5.v).toBe("CARAGA");
    expect(s.C6.v).toBe(131618);
    expect(s.C7.v).toBe("Grade 2");
    expect(s.F6.v).toBe("Cagbas Elementary School");
    expect(s.F7.v).toBe("Alma S. Gonzales");
    expect(s.K7.v).toBe("Watermelon");
    expect(s.O6.v).toBe(1); // male enrolment
    expect(s.O7.v).toBe(1); // female enrolment
  });

  it("takes the task headers and maximum scores from the material", () => {
    const { book, sheetXml } = fill(params());
    const s = book.Sheets["G2 RMA Scoresheet"];
    expect(s.I8.v).toBe("Task A (3)");
    expect(s.S8.v).toBe("Task K (1)");
    // Row 9 is what the score validations bound against and what T9 sums.
    expect(TASKS.map((_, i) => s[`${columnLetter(9 + i)}9`].v)).toEqual(
      TASKS.map(([, max]) => max),
    );
    // Left as the form has it, so the total follows whatever row 9 now holds.
    expect(sheetXml).toContain("<f>SUM(I9:S9)</f>");
  });

  it("blanks task columns the material does not use", () => {
    const { book } = fill(params({ items: items.slice(0, 4) }));
    const s = book.Sheets["G2 RMA Scoresheet"];
    expect(s.L8.v).toBe("Task D (1)");
    expect(s.M8).toBeUndefined();
    expect(s.M9).toBeUndefined();
  });

  it("writes a learner row the way the form is filled by hand", () => {
    const { book } = fill(params());
    const s = book.Sheets["G2 RMA Scoresheet"];
    expect(s.B10.v).toBe(131618240001);
    expect(s.C10.v).toBe("AMOR, Juan Molina");
    expect(s.D10.v).toBe("Male");
    expect(s.E10.v).toBe(excelSerial("2018-05-06"));
    expect(s.F10.v).toBe(excelSerial("2026-06-09"));
    expect(s.H10.v).toBe("Sinugbuanong Binisaya");
    expect(s.I10.v).toBe(1);
    expect(s.M10.v).toBe(2);
    expect(s.W10.v).toBe("Needs drills");
    // An unentered task stays empty rather than scoring zero.
    expect(s.K10).toBeUndefined();
  });

  it("orders the roster male group first, as the table shows it", () => {
    const { book } = fill(params());
    const s = book.Sheets["G2 RMA Scoresheet"];
    expect(s.C10.v).toBe("AMOR, Juan Molina");
    expect(s.C11.v).toBe("BOLANDO, Juan Molina");
  });

  it("leaves an unassessed learner's date of assessment empty", () => {
    const { book } = fill(params());
    // COUNTA(F10:F108) is the form's Number Assessed — a blank F must stay blank.
    expect(book.Sheets["G2 RMA Scoresheet"].F11).toBeUndefined();
  });

  it("rebuilds the levelling from the material's own bands", () => {
    const f = levellingFormula(
      [band(0, 74.99, "Intervention", 0), band(75, 100, "Enhancement", 1)],
      10,
    );
    expect(f).toBe(
      'IF(U10<>"",IF(AND(ROUND($U10*100,2)>=0,ROUND($U10*100,2)<=74.99),"Intervention",' +
        'IF(AND(ROUND($U10*100,2)>=75,ROUND($U10*100,2)<=100),"Enhancement","")),"")',
    );
  });

  it("rewrites every levelling row, orphaning no shared formula", () => {
    const { sheetXml } = fill(params());
    for (let row = 10; row <= 109; row++) {
      const cell = new RegExp(`<c r="V${row}"[^>]*>([\\s\\S]*?)</c>`).exec(sheetXml);
      expect(cell, `V${row} missing`).not.toBeNull();
      expect(cell![1]).toContain("ROUND($U");
      // A leftover `t="shared"` here would point at a master we just replaced.
      expect(cell![1]).not.toContain("t=&quot;shared&quot;");
      expect(cell![1]).not.toContain('t="shared"');
    }
    expect(sheetXml).not.toContain('si="4"');
  });

  it("labels the Class Summary with the same bands and tasks", () => {
    const { book } = fill(params());
    const s = book.Sheets["Class Summary"];
    // COUNTIFS on the scoresheet's levelling matches against these very cells.
    expect(s.G9.v).toBe("Intervention");
    expect(s.H9.v).toBe("Consolidation");
    expect(s.I9.v).toBe("Enhancement");
    expect(s.C19.v).toBe("Intervention");
    expect(s.L9.v).toBe("Task A");
    expect(s.V19.v).toBe("Task K");
    expect(s.A11.v).toBe("Grade 2");
  });

  it("gives an unused proficiency slot a label nothing can match", () => {
    const { book } = fill(params());
    const s = book.Sheets["Class Summary"];
    // A space prints blank but never equals the levelling formula's "" result,
    // which an empty cell would.
    expect(s.J9.v).toBe(" ");
    expect(s.K9.v).toBe(" ");
  });

  it("divides the mean score by this material's total, not the issued 25", () => {
    const { summaryXml } = fill(params());
    expect(summaryXml).toContain(
      "<f>IFERROR(W11/&apos;G2 RMA Scoresheet&apos;!$T$9,&quot;&quot;)</f>",
    );
    expect(summaryXml).not.toContain("IFERROR(W11/25");
  });

  /**
   * Cheap stand-in for a schema check: every `<c …>` must be closed. A regex
   * that accidentally spans a self-closing cell swallows the cell after it, and
   * Excel refuses the file outright — which is exactly how this was first
   * introduced, in the template builder's cached-value strip.
   */
  it("leaves both patched sheets structurally intact", () => {
    const { sheetXml, summaryXml } = fill(params());
    for (const [name, xml] of [
      ["scoresheet", sheetXml],
      ["class summary", summaryXml],
    ] as const) {
      const opened = (xml.match(/<c[ >]/g) ?? []).length;
      const selfClosed = (xml.match(/<c [^>]*\/>/g) ?? []).length;
      const closed = (xml.match(/<\/c>/g) ?? []).length;
      expect(opened, name).toBe(selfClosed + closed);
      expect((xml.match(/<row[ >]/g) ?? []).length, name).toBe(
        (xml.match(/<row [^>]*\/>/g) ?? []).length +
          (xml.match(/<\/row>/g) ?? []).length,
      );
    }
  });

  it("recalculates on open, so no cached value from the template survives", () => {
    const zip = unzipSync(new Uint8Array(fs.readFileSync(TEMPLATE)));
    expect(strFromU8(zip["xl/workbook.xml"])).toContain('fullCalcOnLoad="1"');
  });

  it("carries no learner data from the school that filed the source return", () => {
    const raw = fs.readFileSync(TEMPLATE);
    for (const trace of ["AMOR", "Cagbas", "Gonzales", "Watermelon", "131618"]) {
      expect(raw.includes(Buffer.from(trace)), trace).toBe(false);
    }
  });

  it("falls back off the Grade 2 form for a shape it cannot hold", () => {
    expect(templateFits(2, items, 31)).toBe(true);
    expect(templateFits(3, items, 31)).toBe(false); // another grade's form
    expect(templateFits(2, items, 101)).toBe(false); // past the 100 rows
    expect(templateFits(2, [...items, item(0)], 31)).toBe(false); // 12 tasks
    expect(templateFits(2, [], 31)).toBe(false);
  });

  it("names the file after the section, phase and school year", () => {
    expect(workbookFilename(params())).toBe(
      "RMA_Grade-2_Watermelon_BoSY_2026-2027",
    );
  });
});
