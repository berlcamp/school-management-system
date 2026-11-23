"use client";

/**
 * x² / x₂ and common math symbols for the exam text fields. Acts on whichever
 * field of the question last had focus; the buttons use onMouseDown +
 * preventDefault so clicking one does not steal focus from that field.
 */

import { MATH_SYMBOLS, type MathEdit } from "@/lib/utils/mathText";
import { cn } from "@/lib/utils";

interface MathToolbarProps {
  onEdit: (edit: MathEdit) => void;
  disabled?: boolean;
}

const btn =
  "inline-flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

export function MathToolbar({ onEdit, disabled }: MathToolbarProps) {
  const press = (edit: MathEdit) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (!disabled) onEdit(edit);
  };
  return (
    <div
      role="toolbar"
      aria-label="Math formatting"
      className="flex flex-wrap items-center gap-0.5 rounded-md border bg-muted/30 px-1 py-0.5"
    >
      <button
        type="button"
        className={cn(btn, "font-serif")}
        onMouseDown={press({ type: "sup" })}
        disabled={disabled}
        title="Superscript (exponent) — select text first, or type inside the braces: x^{2}"
        aria-label="Superscript"
      >
        x<sup className="text-[0.7em]">2</sup>
      </button>
      <button
        type="button"
        className={cn(btn, "font-serif")}
        onMouseDown={press({ type: "sub" })}
        disabled={disabled}
        title="Subscript — select text first, or type inside the braces: H_{2}O"
        aria-label="Subscript"
      >
        x<sub className="text-[0.7em]">2</sub>
      </button>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      {MATH_SYMBOLS.map((s) => (
        <button
          key={s}
          type="button"
          className={btn}
          onMouseDown={press({ type: "insert", text: s })}
          disabled={disabled}
          title={`Insert ${s}`}
          aria-label={`Insert ${s}`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
