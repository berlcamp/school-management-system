import {
  REVIEW_STATUS_BADGE_CLASS,
  REVIEW_STATUS_LABEL,
  type ReviewStatus,
} from "@/lib/constants/examReview";

export function ReviewStatusBadge({ status }: { status?: ReviewStatus | null }) {
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${REVIEW_STATUS_BADGE_CLASS[status]}`}
    >
      {REVIEW_STATUS_LABEL[status]}
    </span>
  );
}
