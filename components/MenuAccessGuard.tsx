"use client";

import { ModuleAccessDenied } from "@/components/ModuleAccessDenied";
import { useMenuAccess } from "@/hooks/useMenuAccess";
import { menuItemForPath } from "@/lib/nav/buildNavSections";
import { usePathname } from "next/navigation";

/**
 * Refuses a page a super admin has switched OFF for the signed-in user's staff
 * type at Role Permissions (migration 232). The page is matched to its menu
 * entry (the longest menu URL it sits under), so switching off Sections also
 * closes a section's own page.
 *
 * Only an explicit "off" blocks. A page with no setting behaves exactly as
 * before — its own role checks still decide — and switching a page ON adds the
 * link without bypassing those checks. Database rules are unaffected either
 * way. A super admin is never blocked.
 *
 * The page renders while the settings load rather than waiting for them:
 * holding every page back for that read shifted the timing of each page's
 * own loading for everybody, to protect a page that is switched off for few.
 * After the first read of a session the settings are known synchronously
 * (`useMenuAccess`), so only that first page can show before it is refused.
 */
export function MenuAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { overrides } = useMenuAccess();

  const item = menuItemForPath(pathname);
  if (item !== null && overrides.get(item) === false) {
    return <ModuleAccessDenied />;
  }
  return <>{children}</>;
}
