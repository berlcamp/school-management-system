"use client";

import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export function StarRating({
  value,
  onChange,
  readonly = false,
  size = "md",
}: StarRatingProps) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          className={cn(
            "transition-colors duration-150",
            readonly
              ? "cursor-default"
              : "cursor-pointer hover:scale-110 active:scale-95",
          )}
        >
          <Star
            className={cn(
              sizeClasses[size],
              "transition-colors duration-150",
              star <= value
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-gray-300",
              !readonly && star <= value && "hover:text-amber-500",
              !readonly && star > value && "hover:text-amber-300",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function StarRatingDisplay({
  value,
  size = "sm",
}: {
  value: number;
  size?: "sm" | "md" | "lg";
}) {
  const rounded = Math.round(value * 10) / 10;
  return (
    <div className="flex items-center gap-1.5">
      <StarRating value={Math.round(value)} readonly size={size} />
      <span className="text-sm font-medium text-gray-700">{rounded}</span>
    </div>
  );
}
