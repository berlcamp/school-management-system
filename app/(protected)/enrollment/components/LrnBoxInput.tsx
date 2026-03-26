"use client";

import { useCallback, useRef, KeyboardEvent, ClipboardEvent } from "react";
import { cn } from "@/lib/utils";

const LRN_LENGTH = 12;
// Grouping: 4-4-4 with dashes between
const GROUPS = [4, 4, 4];

interface LrnBoxInputProps {
  value: string;
  onChange: (lrn: string) => void;
  disabled?: boolean;
}

export default function LrnBoxInput({
  value,
  onChange,
  disabled,
}: LrnBoxInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const digits = value.padEnd(LRN_LENGTH, "").slice(0, LRN_LENGTH).split("");

  const setRef = useCallback(
    (index: number) => (el: HTMLInputElement | null) => {
      inputRefs.current[index] = el;
    },
    []
  );

  const updateValue = useCallback(
    (index: number, digit: string) => {
      const arr = value.padEnd(LRN_LENGTH, " ").slice(0, LRN_LENGTH).split("");
      arr[index] = digit;
      const newVal = arr.join("").replace(/ +$/, "");
      onChange(newVal);
    },
    [value, onChange]
  );

  const handleInput = useCallback(
    (index: number, inputValue: string) => {
      const char = inputValue.replace(/\D/g, "").slice(-1);
      if (!char) return;

      updateValue(index, char);

      // Move to next box
      if (index < LRN_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [updateValue]
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        e.preventDefault();
        const currentDigit = digits[index]?.trim();
        if (currentDigit) {
          updateValue(index, " ");
        } else if (index > 0) {
          updateValue(index - 1, " ");
          inputRefs.current[index - 1]?.focus();
        }
      } else if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        inputRefs.current[index - 1]?.focus();
      } else if (e.key === "ArrowRight" && index < LRN_LENGTH - 1) {
        e.preventDefault();
        inputRefs.current[index + 1]?.focus();
      }
    },
    [digits, updateValue]
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LRN_LENGTH);
      if (pasted) {
        onChange(pasted);
        const focusIndex = Math.min(pasted.length, LRN_LENGTH - 1);
        setTimeout(() => inputRefs.current[focusIndex]?.focus(), 0);
      }
    },
    [onChange]
  );

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.select();
    },
    []
  );

  // Render grouped boxes with dashes
  let globalIndex = 0;
  const groups = GROUPS.map((size, groupIdx) => {
    const boxes = [];
    for (let i = 0; i < size; i++) {
      const idx = globalIndex;
      boxes.push(
        <input
          key={idx}
          ref={setRef(idx)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[idx]?.trim() || ""}
          disabled={disabled}
          className={cn(
            "h-11 w-10 rounded-md border border-input bg-background text-center text-base font-semibold",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-all"
          )}
          onChange={(e) => handleInput(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          onFocus={handleFocus}
          aria-label={`LRN digit ${idx + 1}`}
        />
      );
      globalIndex++;
    }
    return (
      <div key={groupIdx} className="flex items-center gap-1.5">
        {boxes}
      </div>
    );
  });

  return (
    <div className="flex items-center gap-2">
      {groups.map((group, i) => (
        <div key={i} className="flex items-center gap-2">
          {group}
          {i < groups.length - 1 && (
            <span className="text-lg font-bold text-muted-foreground">-</span>
          )}
        </div>
      ))}
    </div>
  );
}
