import { STATUS_META, type StatusTone } from "@/lib/constants/statusChip";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const TONE_CLASS: Record<StatusTone, string> = {
  success: "app__chip_success",
  accent: "app__chip_accent",
  warning: "app__chip_warning",
  danger: "app__chip_danger",
  neutral: "app__chip_neutral",
  info: "app__chip_info",
};

interface StatusChipProps {
  /** A key of STATUS_META. An unknown one renders neutral, under its own words. */
  status: string;
  /** Overrides the label from STATUS_META. */
  label?: string;
  tone?: StatusTone;
  icon?: LucideIcon;
  className?: string;
}

/** A status as a tinted pill: colour, icon and label, so colour is never alone. */
export function StatusChip({
  status,
  label,
  tone,
  icon,
  className,
}: StatusChipProps) {
  const meta = STATUS_META[status];
  const Icon = icon ?? meta?.icon;
  const text = label ?? meta?.label ?? status.replaceAll("_", " ");

  return (
    <span
      className={cn(
        "app__chip",
        TONE_CLASS[tone ?? meta?.tone ?? "neutral"],
        className,
      )}
    >
      {Icon && <Icon aria-hidden />}
      {text}
    </span>
  );
}
