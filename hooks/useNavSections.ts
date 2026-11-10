"use client";

import { usePendingRequestCounts } from "@/hooks/usePendingRequestCounts";
import { useDesignations } from "@/hooks/useDesignations";
import { useHelpdeskAccess, useHelpdeskCounts } from "@/hooks/useHelpdesk";
import { useMenuAccess } from "@/hooks/useMenuAccess";
import { useNeedsReviewEnabled } from "@/hooks/useNeedsReviewEnabled";
import { useSbfpEnabled } from "@/hooks/useSbfpEnabled";
import { isRegionAccount } from "@/lib/constants/userTypes";
import {
  buildNavSections,
  type NavSection,
} from "@/lib/nav/buildNavSections";
import type { StaffDesignation } from "@/lib/constants/designations";
import { useAppSelector } from "@/lib/redux/hook";

export type { NavItem, NavSection } from "@/lib/nav/buildNavSections";

/** Roles whose menu carries Records → Requests, and so its pending badge. */
const hasRequestsMenu = (type?: string | null) =>
  type === "school_head" ||
  type === "assistant_school_head" ||
  type === "super admin" ||
  type === "admin" ||
  type === "registrar" ||
  type === "librarian";

/**
 * The sidebar's groups and links for the signed-in user: their active role,
 * their designations at the active school (216), the tutor flag and the Role
 * Permissions a super admin has set for their type (232). The sidebar renders
 * it, and the role dialog on the avatar menu lists the same thing, so "what can
 * I open" is answered in one place. The menu itself is built by the pure
 * `buildNavSections()`; this hook only gathers its inputs.
 *
 * `withCounts` runs the pending-request count queries behind the Requests
 * badge; only the sidebar needs them.
 */
export function useNavSections({ withCounts = false }: { withCounts?: boolean } = {}): NavSection[] {
  const user = useAppSelector((state) => state.user.user);
  const userType = user?.type;

  const { has } = useDesignations();
  const { total: pendingRequests } = usePendingRequestCounts(
    withCounts && hasRequestsMenu(userType),
  );

  // Help Desk (migration 218): offered to every user with a login while a
  // super admin has it switched on; the inbox only to those who answer it.
  const helpdesk = useHelpdeskAccess();
  const showHelpdesk = helpdesk.enabled && !isRegionAccount(userType);
  const helpdeskCounts = useHelpdeskCounts(
    withCounts && showHelpdesk ? (helpdesk.isStaff ? "staff" : "submitter") : null,
  );

  const sbfp = useSbfpEnabled();
  const needsReview = useNeedsReviewEnabled();
  const { overrides } = useMenuAccess();

  return buildNavSections({
    userType,
    isTutor: user?.is_tutor === true,
    hasDesignation: (d) => has(d as StaffDesignation),
    pendingRequests,
    helpdesk: {
      enabled: helpdesk.enabled,
      isStaff: helpdesk.isStaff,
      counts: helpdeskCounts,
    },
    sbfpEnabled: sbfp.enabled,
    needsReviewEnabled: needsReview.enabled,
    overrides,
  });
}
