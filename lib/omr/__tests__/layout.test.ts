import { describe, expect, it } from "vitest";
import {
  buildSheetLayout,
  choiceIndex,
  choiceLetter,
  decodeStudentCode,
  encodeStudentCode,
  ID_COLUMNS,
  MAX_ITEMS,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
} from "../layout";

const items = (count: number, choiceCount = 4) =>
  Array.from({ length: count }, (_, i) => ({
    itemNumber: i + 1,
    choiceCount,
  }));

describe("buildSheetLayout", () => {
  it("keeps every bubble inside the printable page", () => {
    const layout = buildSheetLayout(items(MAX_ITEMS, 5));
    const all = [
      ...layout.rows.flatMap((r) => r.bubbles),
      ...layout.idColumns.flat(),
      layout.orientationDot,
    ];
    for (const bubble of all) {
      expect(bubble.x - bubble.d / 2).toBeGreaterThan(0);
      expect(bubble.x + bubble.d / 2).toBeLessThan(PAGE_WIDTH_MM);
      expect(bubble.y - bubble.d / 2).toBeGreaterThan(0);
      expect(bubble.y + bubble.d / 2).toBeLessThan(PAGE_HEIGHT_MM);
    }
  });

  it("never overlaps the answer bubbles with the corner markers", () => {
    const layout = buildSheetLayout(items(MAX_ITEMS, 5));
    for (const bubble of layout.rows.flatMap((r) => r.bubbles)) {
      for (const marker of layout.markers) {
        const clearance =
          Math.max(
            Math.abs(bubble.x - marker.x) - layout.markerSizeMm / 2,
            Math.abs(bubble.y - marker.y) - layout.markerSizeMm / 2,
          ) - bubble.d / 2;
        expect(clearance).toBeGreaterThan(0);
      }
    }
  });

  it("lays items out down each column before starting the next", () => {
    const layout = buildSheetLayout(items(30));
    const first = layout.rows[0].bubbles[0];
    const secondRow = layout.rows[1].bubbles[0];
    const nextColumn = layout.rows[25].bubbles[0];

    expect(secondRow.x).toBe(first.x);
    expect(secondRow.y).toBeGreaterThan(first.y);
    expect(nextColumn.x).toBeGreaterThan(first.x);
    expect(nextColumn.y).toBe(first.y);
    expect(layout.columnsUsed).toBe(2);
  });

  it("prints only as many bubbles as the item has choices", () => {
    const layout = buildSheetLayout([
      { itemNumber: 1, choiceCount: 2 },
      { itemNumber: 2, choiceCount: 5 },
    ]);
    expect(layout.rows[0].bubbles).toHaveLength(2);
    expect(layout.rows[1].bubbles).toHaveLength(5);
  });

  it("clamps a nonsensical choice count into the printable range", () => {
    const layout = buildSheetLayout([
      { itemNumber: 1, choiceCount: 0 },
      { itemNumber: 2, choiceCount: 9 },
    ]);
    expect(layout.rows[0].bubbles).toHaveLength(2);
    expect(layout.rows[1].bubbles).toHaveLength(5);
  });

  it("refuses an empty or oversized sheet rather than truncating it", () => {
    expect(() => buildSheetLayout([])).toThrow(/no items/i);
    expect(() => buildSheetLayout(items(MAX_ITEMS + 1))).toThrow(/at most/i);
  });
});

describe("student code", () => {
  it("round-trips an id through the bubble encoding", () => {
    for (const id of [1, 7, 42, 1234, 99999999]) {
      expect(decodeStudentCode(encodeStudentCode(id))).toBe(id);
    }
  });

  it("emits one column per digit plus a check digit", () => {
    expect(encodeStudentCode(1234)).toHaveLength(ID_COLUMNS);
  });

  it("rejects a code whose check digit disagrees", () => {
    const code = encodeStudentCode(4821);
    // Flip one body digit; the check digit no longer matches.
    code[3] = (code[3] + 1) % 10;
    expect(decodeStudentCode(code)).toBeNull();
  });

  it("rejects a code with an unread column instead of guessing", () => {
    const code: (number | null)[] = encodeStudentCode(4821);
    code[2] = null;
    expect(decodeStudentCode(code)).toBeNull();
  });

  it("refuses ids too long to print", () => {
    expect(() => encodeStudentCode(123456789)).toThrow(/cannot be printed/i);
  });
});

describe("choice letters", () => {
  it("round-trips letters and indices", () => {
    expect(choiceLetter(0)).toBe("A");
    expect(choiceLetter(4)).toBe("E");
    expect(choiceIndex("A")).toBe(0);
    expect(choiceIndex("e")).toBe(4);
    expect(choiceIndex("Z")).toBe(-1);
  });
});
