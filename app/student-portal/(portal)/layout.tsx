"use client";

import { StudentAuthGuard } from "@/components/StudentAuthGuard";
import { Button } from "@/components/ui/button";
import { Award, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutStudent } from "@/lib/student-portal/actions";

export default function StudentPortalAuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <StudentAuthGuard>
      <div className="min-h-screen p-4 py-10 relative">
        <nav className="max-w-4xl mx-auto mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link
              href="/student-portal/dashboard"
              className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                pathname === "/student-portal/dashboard"
                  ? "bg-white/20 text-white"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              <LayoutDashboard className="h-4 w-4 inline-block mr-2" />
              Dashboard
            </Link>
            <Link
              href="/student-portal/grades"
              className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                pathname === "/student-portal/grades"
                  ? "bg-white/20 text-white"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              <Award className="h-4 w-4 inline-block mr-2" />
              Grade Records
            </Link>
          </div>
          <form action={logoutStudent}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-white/80 hover:text-white hover:bg-white/10"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </form>
        </nav>
        <div className="max-w-4xl mx-auto">{children}</div>
      </div>
    </StudentAuthGuard>
  );
}
