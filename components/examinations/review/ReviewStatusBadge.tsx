import { StatusChip } from "@/components/StatusChip";
import { REVIEW_STATUS_LABEL, type ReviewStatus } from "@/lib/constants/examReview";

export function ReviewStatusBadge({ status }: { status?: ReviewStatus | null }) {
  if (!status) return null;
  return <StatusChip status={status} label={REVIEW_STATUS_LABEL[status]} />;
}
