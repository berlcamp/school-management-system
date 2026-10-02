import { describe, expect, it } from "vitest";
import {
  bankQuestionToDraft,
  bankSlotStatus,
  expectedBankKey,
  llcCut,
  normalizeLcCode,
  partitionBankCandidates,
  questionSourceLabel,
  validateBankDraft,
  type SlotInfo,
} from "@/lib/utils/questionBank";
import type { BankQuestionWithOptions } from "@/types";

const bank = (over: Partial<BankQuestionWithOptions> = {}): BankQuestionWithOptions => ({
  id: "10",
  catalogue_competency_id: "4",
  cognitive_level: "applying",
  source_llc_school_year: "2026-2027",
  question_type: "multiple_choice",
  question_text: "What is 2 + 2?",
  answer_key: null,
  image_path: null,
  image_name: null,
  created_by: "1",
  review_status: "approved",
  submitted_at: null,
  reviewed_by: null,
  reviewed_at: null,
  review_comment: null,
  created_at: "",
  updated_at: "",
  options: [
    { id: "1", question_id: "10", label: "A", choice_text: "3", is_correct: false, position: 0, image_path: null, image_name: null },
    { id: "2", question_id: "10", label: "B", choice_text: "4", is_correct: true, position: 1, image_path: null, image_name: null },
  ],
  ...over,
});

const slot = (over: Partial<SlotInfo> = {}): SlotInfo => ({
  catalogue_competency_id: "4",
  cognitive_level: "applying",
  lc_code: "M5-1",
  competency_text: "c",
  ...over,
});

describe("normalizeLcCode", () => {
  it("trims, upper-cases and removes inner spaces", () => {
    expect(normalizeLcCode(" m5ns - ia-1 ")).toBe("M5NS-IA-1");
    expect(normalizeLcCode("")).toBe("");
  });
});

describe("llcCut", () => {
  it("keeps the lowest three and every tie at the cut", () => {
    const rows = [100, 50, 0, 50, 50].map((mps, i) => ({ id: i, mps }));
    expect(llcCut(rows).map((r) => r.mps)).toEqual([0, 50, 50, 50]);
  });
  it("returns everything when there are fewer than three", () => {
    expect(llcCut([{ mps: 40 }, { mps: 10 }]).map((r) => r.mps)).toEqual([10, 40]);
  });
  it("returns [] for no rows", () => {
    expect(llcCut([])).toEqual([]);
  });
});

describe("bankSlotStatus", () => {
  it("is ok on the same competency and level", () => {
    expect(bankSlotStatus(bank(), slot())).toBe("ok");
  });
  it("flags a level mismatch", () => {
    expect(bankSlotStatus(bank(), slot({ cognitive_level: "remembering" }))).toBe("level_mismatch");
  });
  it("flags a different competency (e.g. after the item moved)", () => {
    expect(bankSlotStatus(bank(), slot({ catalogue_competency_id: "9" }))).toBe("wrong_competency");
  });
  it("flags an item with no TOS slot or an unmapped one", () => {
    expect(bankSlotStatus(bank(), undefined)).toBe("no_slot");
    expect(bankSlotStatus(bank(), slot({ catalogue_competency_id: null }))).toBe("no_slot");
  });
});

describe("partitionBankCandidates", () => {
  it("splits same-competency questions by level and drops other competencies", () => {
    const a = bank({ id: "1" });
    const b = bank({ id: "2", cognitive_level: "remembering" });
    const c = bank({ id: "3", catalogue_competency_id: "8" });
    const out = partitionBankCandidates([a, b, c], slot());
    expect(out.matching.map((q) => q.id)).toEqual(["1"]);
    expect(out.otherLevel.map((q) => q.id)).toEqual(["2"]);
  });
});

describe("questionSourceLabel", () => {
  it("labels by the bank link", () => {
    expect(questionSourceLabel({ source_bank_question_id: "3" })).toBe("Question Bank");
    expect(questionSourceLabel({ source_bank_question_id: null })).toBe("New");
  });
});

describe("expectedBankKey", () => {
  it("is the correct option's letter by position for MC", () => {
    expect(expectedBankKey(bank())).toBe("B");
  });
  it("is A / B for True / False", () => {
    expect(expectedBankKey(bank({ question_type: "true_false", answer_key: "True", options: [] }))).toBe("A");
    expect(expectedBankKey(bank({ question_type: "true_false", answer_key: "False", options: [] }))).toBe("B");
  });
});

describe("bankQuestionToDraft / validateBankDraft", () => {
  it("copies text and options and carries the bank link", () => {
    const d = bankQuestionToDraft(bank(), true);
    expect(d.source_bank_question_id).toBe("10");
    expect(d.bank_level_override).toBe(true);
    expect(d.options.map((o) => [o.choice_text, o.is_correct])).toEqual([["3", false], ["4", true]]);
    expect(d.item_count).toBe(1);
  });
  it("mirrors the submit rules", () => {
    const d = bankQuestionToDraft(bank(), false);
    expect(validateBankDraft(d)).toBeNull();
    expect(validateBankDraft({ ...d, options: d.options.slice(0, 1) })).toMatch(/2 to 5 choices/);
    expect(validateBankDraft({ ...d, options: d.options.map((o) => ({ ...o, is_correct: false })) })).toMatch(/exactly one/);
    expect(validateBankDraft({ ...d, question_text: " ", image_path: "" })).toMatch(/Write the question/);
    const tf = bankQuestionToDraft(bank({ question_type: "true_false", answer_key: null, options: [] }), false);
    expect(validateBankDraft(tf)).toMatch(/True or False/);
  });
});
