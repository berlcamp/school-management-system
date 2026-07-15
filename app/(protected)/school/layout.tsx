"use client";

import { SchoolHeadGuard } from "@/components/SchoolHeadGuard";

export default function SchoolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SchoolHeadGuard>{children}</SchoolHeadGuard>;
}
