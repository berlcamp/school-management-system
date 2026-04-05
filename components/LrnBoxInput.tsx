"use client";

import { cn } from "@/lib/utils";
import {
  ClipboardEvent,
  forwardRef,
  KeyboardEvent,
  useCallback,
  useId,
  useRef,
} from "react";

const LRN_LENGTH = 12;
const GROUPS = [4, 4, 4];

export interface LrnBoxInputProps {
  value: string;
  onChange: (lrn: string) => void;
  disabled?: boolean;
  /** White / slate-50 cards (student portal, public request form). */
  variant?: "default" | "light";
  /** First digit input id (for <label htmlFor>). */
  id?: string;
  className?: string;
  /** Keep 12 boxes on one row; parent should be wide enough or use horizontal scroll on small screens. */
  singleLine?: boolean;
}

export const LrnBoxInput = forwardRef<HTMLDivElement, LrnBoxInputProps>(
  function LrnBoxInput(
    {
      value,
      onChange,
      disabled,
      variant = "default",
      id: idProp,
      className,
      singleLine = false,
    },
    ref
  ) {
    const reactId = useId();
    const firstInputId = idProp ?? `lrn-box-${reactId}`;
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const digits = value
      .replace(/\D/g, "")
      .padEnd(LRN_LENGTH, " ")
      .slice(0, LRN_LENGTH)
      .split("");

    const setRef = useCallback(
      (index: number) => (el: HTMLInputElement | null) => {
        inputRefs.current[index] = el;
      },
      []
    );

    const updateValue = useCallback(
      (index: number, digit: string) => {
        const raw = value.replace(/\D/g, "");
        const arr = raw.padEnd(LRN_LENGTH, " ").slice(0, LRN_LENGTH).split("");
        arr[index] = digit;
        const newVal = arr.join("").replace(/ +$/, "");
        onChange(newVal.replace(/\D/g, ""));
      },
      [value, onChange]
    );

    const handleInput = useCallback(
      (index: number, inputValue: string) => {
        const char = inputValue.replace(/\D/g, "").slice(-1);
        if (!char) return;

        updateValue(index, char);

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
        const pasted = e.clipboardData
          .getData("text")
          .replace(/\D/g, "")
          .slice(0, LRN_LENGTH);
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

    const boxClass =
      variant === "light"
        ? cn(
            "h-11 w-9 sm:w-10 rounded-lg border border-gray-200 bg-white text-center text-base font-semibold text-gray-900 shadow-sm",
            "focus:outline-none focus:ring-2 focus:ring-slate-400/40 focus:border-slate-400"
          )
        : cn(
            "h-11 w-9 sm:w-10 rounded-md border border-input bg-background text-center text-base font-semibold",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          );

    let globalIndex = 0;
    const groups = GROUPS.map((size, groupIdx) => {
      const boxes = [];
      for (let i = 0; i < size; i++) {
        const idx = globalIndex;
        boxes.push(
          <input
            key={idx}
            ref={setRef(idx)}
            id={idx === 0 ? firstInputId : undefined}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digits[idx]?.trim() || ""}
            disabled={disabled}
            className={cn(
              boxClass,
              "disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            )}
            onChange={(e) => handleInput(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            onFocus={handleFocus}
            aria-label={`LRN digit ${idx + 1} of ${LRN_LENGTH}`}
          />
        );
        globalIndex++;
      }
      return (
        <div key={groupIdx} className="flex items-center gap-1 sm:gap-1.5">
          {boxes}
        </div>
      );
    });

    return (
      <div
        ref={ref}
        className={cn(
          singleLine &&
            "w-full min-w-0 overflow-x-auto overflow-y-visible pb-1 [-webkit-overflow-scrolling:touch]"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-x-2",
            singleLine ? "flex-nowrap w-max" : "flex-wrap gap-y-2",
            className
          )}
          role="group"
          aria-label="Learner Reference Number, 12 digits"
        >
          {groups.map((group, i) => (
            <div key={i} className="flex items-center gap-2">
              {group}
              {i < groups.length - 1 && (
                <span
                  className={cn(
                    "text-lg font-bold select-none shrink-0",
                    variant === "light"
                      ? "text-gray-400"
                      : "text-muted-foreground"
                  )}
                  aria-hidden
                >
                  -
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
);

export default LrnBoxInput;
