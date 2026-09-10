import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { GRADE_LEVELS, getGradeLevelLabel } from "@/lib/constants";
import { BOOK_GRADE_LEVELS } from "@/lib/constants/books";

/**
 * The book catalogue offered Grades 1-12 only, while sections, enrollment and
 * every report have carried SNED (-1) and Kindergarten (0) throughout — so a
 * school could open those sections but catalogue no book for them. Migration 184
 * widened the CHECK; these guard the two halves of the fix that live in code.
 */
describe("book grade levels", () => {
  it("offers SNED and Kindergarten alongside Grades 1-12", () => {
    expect(BOOK_GRADE_LEVELS).toContain(-1);
    expect(BOOK_GRADE_LEVELS).toContain(0);
    expect(BOOK_GRADE_LEVELS.map(getGradeLevelLabel).slice(0, 3)).toEqual([
      "SNED",
      "Kindergarten",
      "Grade 1",
    ]);
  });

  it("is the same list every other module offers, not a second copy", () => {
    // A narrower copy is how the two grades went missing from Books for as long
    // as they did.
    expect(BOOK_GRADE_LEVELS).toEqual(GRADE_LEVELS);
  });

  it("has a migration widening the stored range to match what is offered", () => {
    const sql = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../supabase/migrations/184_books_kindergarten_and_sned.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /CHECK\s*\(grade_level >= -1 AND grade_level <= 12\)/,
    );
    expect(Math.min(...BOOK_GRADE_LEVELS)).toBe(-1);
    expect(Math.max(...BOOK_GRADE_LEVELS)).toBe(12);
  });
});
