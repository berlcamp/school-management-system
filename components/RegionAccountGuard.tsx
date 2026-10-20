"use client";

import { useRegionAccess } from "@/hooks/useRegionAccess";
import { regionReportKeyForPath } from "@/lib/constants/regionAccess";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps a Region Account (migration 214) on the pages it exists to view: the
 * dashboard, the SDO Reports index, and each report a super admin has switched
 * on. Every other address — a school module typed into the bar, a division
 * office tool, a report switched off — goes back to /home.
 *
 * An allow-list, not a deny-list, so a module added to the app later is closed
 * to this role until someone decides otherwise. Every other role passes
 * straight through.
 */
export function RegionAccountGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isRegion, loading, canView } = useRegionAccess();

  const reportKey = regionReportKeyForPath(pathname);
  const isAllowed =
    !isRegion ||
    pathname === "/home" ||
    pathname === "/division/reports" ||
    (reportKey !== null && canView(reportKey));

  useEffect(() => {
    if (isRegion && !loading && !isAllowed) {
      router.replace("/home");
    }
  }, [isRegion, loading, isAllowed, router]);

  if (!isAllowed) return null;
  return <>{children}</>;
}
