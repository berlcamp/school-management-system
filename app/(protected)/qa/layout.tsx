"use client";

import { QaGuard } from "@/components/QaGuard";

export default function QaLayout({ children }: { children: React.ReactNode }) {
  return <QaGuard>{children}</QaGuard>;
}
