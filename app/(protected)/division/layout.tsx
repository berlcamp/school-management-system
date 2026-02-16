"use client";

import { DivisionGuard } from "@/components/DivisionGuard";

export default function DivisionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DivisionGuard>{children}</DivisionGuard>;
}
