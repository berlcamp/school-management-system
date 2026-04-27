"use client";

import { LandingNav } from "@/components/LandingNav";
import { usePathname } from "next/navigation";

export function LandingLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const hideNav = /^\/schools\/[^/]+(\/|$)/.test(pathname);

  return (
    <main className="min-h-screen">
      {!hideNav && <LandingNav />}
      {children}
    </main>
  );
}
