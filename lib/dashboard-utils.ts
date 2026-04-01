export function getCurrentSchoolYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 6 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

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
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  completed:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  promoted:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  graduated:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  retained:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  transferred_out:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  dropped: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  pending_transfer:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  pending_review:
    "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
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
