/**
 * Superscripts and subscripts in exam text, stored as plain text.
 *
 * An exam question, choice, premise or answer is a TEXT column, and every
 * reader of it (the printed paper, the Question Bank, QA review) already treats
 * it as text. So rather than a rich-text format or a schema change, the
 * notation is a small markup inside the text itself:
 *
 *   x^{2}      → x²          (superscript)
 *   H_{2}O     → H₂O         (subscript)
 *   x^2, 10^-3 → shorthand: `^` followed by an optional minus and digits
 *   e^{x_{1}}  → nests
 *
 * Subscript has NO shorthand on purpose: exam text is full of underscores
 * ("The capital is ______."), and `_` followed by a digit must keep printing as
 * a blank. Only the braced form `_{…}` is markup.
 *
 * Anything that does not parse (an unclosed `^{`) prints literally, so a stray
 * caret can never swallow the rest of a question. Text written before this
 * existed contains no `^{` / `_{`, so it renders exactly as before.
 */

export type MathNode =
  | string
  | { kind: "sup" | "sub"; children: MathNode[] };

/** Index of the `}` closing the `{` at `open`, or -1. */
function findClose(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function parseMathText(text: string): MathNode[] {
  const out: MathNode[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push(buf);
    buf = "";
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if ((ch === "^" || ch === "_") && next === "{") {
      const close = findClose(text, i + 1);
      if (close > i + 2) {
        flush();
        out.push({
          kind: ch === "^" ? "sup" : "sub",
          children: parseMathText(text.slice(i + 2, close)),
        });
        i = close + 1;
        continue;
      }
    }
    if (ch === "^") {
      const m = /^-?\d+/.exec(text.slice(i + 1));
      if (m) {
        flush();
        out.push({ kind: "sup", children: [m[0]] });
        i += 1 + m[0].length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** True when the text holds at least one superscript or subscript. */
export function hasMathMarkup(text: string | null | undefined): boolean {
  if (!text) return false;
  return parseMathText(text).some((n) => typeof n !== "string");
}

export type MathEdit =
  | { type: "sup" | "sub" }
  | { type: "insert"; text: string };

/**
 * Apply a toolbar action to a field's value at its selection. Superscript /
 * subscript wraps the selection (`x2` selected "2" → `x^{2}`); with nothing
 * selected it inserts empty braces and puts the caret between them.
 */
export function applyMathEdit(
  value: string,
  selStart: number,
  selEnd: number,
  edit: MathEdit,
): { value: string; selStart: number; selEnd: number } {
  const start = Math.max(0, Math.min(selStart, value.length));
  const end = Math.max(start, Math.min(selEnd, value.length));
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);

  if (edit.type === "insert") {
    const caret = start + edit.text.length;
    return { value: before + edit.text + after, selStart: caret, selEnd: caret };
  }

  const open = edit.type === "sup" ? "^{" : "_{";
  const caretStart = start + open.length;
  return {
    value: `${before}${open}${selected}}${after}`,
    selStart: caretStart,
    selEnd: caretStart + selected.length,
  };
}

/** Symbols offered beside the x² / x₂ buttons — typed as ordinary characters. */
export const MATH_SYMBOLS = [
  "×",
  "÷",
  "±",
  "−",
  "√",
  "π",
  "≤",
  "≥",
  "≠",
  "≈",
  "°",
  "θ",
  "∠",
  "△",
] as const;
