"use client";

import { Badge } from "@/components/ui/badge";

const statusVariantMap: Record<
  string,
  "green" | "red" | "orange" | "blue" | "outline"
> = {
  pending: "orange",
  under_review: "blue",
  approved: "green",
  rejected: "red",
  completed: "green",
  cancelled: "outline",
};

const statusLabelMap: Record<string, string> = {
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  cancelled: "Cancelled",
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge variant={statusVariantMap[status] ?? "outline"}>
      {statusLabelMap[status] ?? status}
    </Badge>
  );
}
