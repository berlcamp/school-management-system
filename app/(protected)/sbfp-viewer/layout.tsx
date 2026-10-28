"use client";

import { ModuleAccessDenied } from "@/components/ModuleAccessDenied";
import { Skeleton } from "@/components/ui/skeleton";
import { useSbfpEnabled } from "@/hooks/useSbfpEnabled";
import { canOpenSbfpOverview } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { PowerOff } from "lucide-react";

/**
 * The SBFP Viewer pages (migration 222). Open to the viewer and to the division
 * office, who see the same figures; the two dashboard RPCs refuse anyone else
 * in the database, so this only spares them an error.
 */
export default function SbfpViewerLayout({ children }: { children: React.ReactNode }) {
  const type = useAppSelector((state) => state.user.user?.type);
  const { enabled, loading } = useSbfpEnabled();

  if (!type) return null;
  if (!canOpenSbfpOverview(type)) return <ModuleAccessDenied />;
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (!enabled) {
    return (
      <section className="mx-auto mt-10 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <PowerOff className="h-6 w-6 text-slate-600" aria-hidden="true" />
        </span>
        <h1 className="text-lg font-semibold text-slate-900">The Feeding Program is turned off</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          The Schools Division Office has switched the Feeding Program off for now. Records already
          encoded are kept, and this page will show them again once it is switched back on.
        </p>
      </section>
    );
  }
  return <>{children}</>;
}
