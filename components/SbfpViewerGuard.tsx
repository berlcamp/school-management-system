"use client";

import { isSbfpViewer } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** The only addresses an SBFP Viewer may open. */
export const SBFP_VIEWER_HOME = "/sbfp-viewer";

export function isSbfpViewerPath(pathname: string | null): boolean {
  return pathname === SBFP_VIEWER_HOME || (pathname?.startsWith(`${SBFP_VIEWER_HOME}/`) ?? false);
}

/**
 * Keeps an SBFP Viewer (migration 222) on its two pages. An allow-list, as
 * `RegionAccountGuard` is, so a module added to the app later stays closed to
 * this role until someone decides otherwise. Every other role passes straight
 * through.
 */
export function SbfpViewerGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const type = useAppSelector((state) => state.user.user?.type);
  const isViewer = isSbfpViewer(type);
  const isAllowed = !isViewer || isSbfpViewerPath(pathname);

  useEffect(() => {
    if (isViewer && !isAllowed) router.replace(SBFP_VIEWER_HOME);
  }, [isViewer, isAllowed, router]);

  if (!isAllowed) return null;
  return <>{children}</>;
}
