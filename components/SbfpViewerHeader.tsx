"use client";

import HeaderDropdown from "@/components/HeaderDropdownMenu";
import { SBFP_VIEWER_HOME } from "@/components/SbfpViewerGuard";
import { FileBarChart, LayoutDashboard } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Dashboard", href: SBFP_VIEWER_HOME, icon: LayoutDashboard },
  { label: "Reports", href: `${SBFP_VIEWER_HOME}/reports`, icon: FileBarChart },
] as const;

/**
 * The SBFP Viewer's whole navigation (migration 222): two pages and the
 * account menu. No sidebar — there is nothing else to reach.
 */
export function SbfpViewerHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav aria-label="Feeding Program" className="flex h-16 items-center justify-between gap-3">
          <Link
            href={SBFP_VIEWER_HOME}
            className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2"
          >
            <span className="relative h-9 w-9 shrink-0 rounded-xl bg-slate-900/5 p-1 ring-1 ring-slate-900/10">
              <Image src="/deped-logo.svg" alt="" fill className="object-contain" priority />
            </span>
            <span className="hidden min-w-0 flex-col sm:flex">
              <span className="truncate text-sm font-bold leading-tight tracking-tight text-slate-900">
                School-Based Feeding Program
              </span>
              <span className="truncate text-xs font-medium text-slate-500">
                SDO Bayugan City · Partner view
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-1">
            {TABS.map(({ label, href, icon: Icon }) => {
              const active = href === SBFP_VIEWER_HOME ? pathname === href : pathname?.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-900/5 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">{label}</span>
                </Link>
              );
            })}
            <span className="ml-2 h-6 w-px bg-slate-200" aria-hidden="true" />
            <div className="ml-2">
              <HeaderDropdown />
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
