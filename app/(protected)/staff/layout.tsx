"use client";

import { StaffGuard } from "@/components/StaffGuard";

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StaffGuard>{children}</StaffGuard>;
}
