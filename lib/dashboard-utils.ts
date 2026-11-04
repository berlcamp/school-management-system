// Re-export the canonical implementation so the school-year cutoff (rolls over
// in June) stays consistent across dashboards and the rest of the app.
export { getCurrentSchoolYear } from "@/lib/utils/schoolYear";

export const ENROLLMENT_STATUS_COLORS: Record<string, string> = {
  active: "rgb(16 185 129)", // emerald-500
  completed: "rgb(59 130 246)", // blue-500
  promoted: "rgb(99 102 241)", // indigo-500
  graduated: "rgb(168 85 247)", // purple-500
  retained: "rgb(234 179 8)", // yellow-500
  transferred_out: "rgb(249 115 22)", // orange-500
  dropped: "rgb(239 68 68)", // red-500
  pending_transfer: "rgb(245 158 11)", // amber-500
  pending_review: "rgb(14 165 233)", // sky-500
};

export const ENROLLMENT_STATUS_STYLES: Record<string, string> = {
  active:
    "app__chip_success",
  completed:
    "app__chip_accent",
  promoted:
    "app__chip_accent",
  graduated:
    "app__chip_accent",
  retained:
    "app__chip_warning",
  transferred_out:
    "app__chip_warning",
  dropped: "app__chip_danger",
  pending_transfer:
    "app__chip_warning",
  pending_review:
    "app__chip_info",
};

export const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  promoted: "Promoted",
  graduated: "Graduated",
  retained: "Retained",
  transferred_out: "Transferred Out",
  dropped: "Dropped",
  pending_transfer: "Pending Transfer",
  pending_review: "Pending Review",
};

export const CHART_COLORS = [
  "oklch(0.646 0.222 41.116)",
  "oklch(0.6 0.118 184.704)",
  "oklch(0.398 0.07 227.392)",
  "oklch(0.828 0.189 84.429)",
  "oklch(0.769 0.188 70.08)",
];
