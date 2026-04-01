"use client";

import { StudentAuthGuard } from "@/components/StudentAuthGuard";
import { Button } from "@/components/ui/button";
import { useStudentSession } from "@/lib/student-portal/context";
import { logoutStudent } from "@/lib/student-portal/actions";
import { Award, ClipboardCheck, LayoutDashboard, LogOut, UserCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function StudentPortalAuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { session } = useStudentSession();

  const navLinkClass = (active: boolean) =>
    `text-sm font-medium flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
      active
        ? "bg-white/15 text-white"
        : "text-white/80 hover:text-white hover:bg-white/10"
    }`;

  return (
    <StudentAuthGuard>
      <div className="min-h-screen relative overflow-hidden">
        {/* Hero Section — matches landing page */}
        <div className="relative pt-28 sm:pt-32 pb-28 sm:pb-36">
          <div className="absolute inset-0" aria-hidden>
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
              style={{ backgroundImage: "url(/home.jpg)" }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/70 to-slate-900/90" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-50 to-transparent z-[1]" />

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 animate-fade-up">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm mb-4">
                  <UserCircle className="h-3.5 w-3.5 text-white/80" />
                  <span className="text-xs font-medium text-white/80">
                    Student Portal
                  </span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                  Welcome, {session?.studentName ?? "Student"}
                </h1>
                <p className="mt-2 text-white/70">
                  Access your academic records and grade information
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href="/student-portal/dashboard"
                  className={navLinkClass(pathname === "/student-portal/dashboard")}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
                <Link
                  href="/student-portal/grades"
                  className={navLinkClass(pathname === "/student-portal/grades")}
                >
                  <Award className="h-4 w-4" />
                  Grade Records
                </Link>
                <Link
                  href="/student-portal/evaluations"
                  className={navLinkClass(pathname === "/student-portal/evaluations")}
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Evaluations
                </Link>
                <form action={logoutStudent} className="inline">
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="text-white/80 hover:text-white hover:bg-white/10 h-9 px-4"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* Content Section — slate-50 with white cards (matches landing) */}
        <div className="bg-slate-50 -mt-24 relative z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            {children}
          </div>
        </div>
      </div>
    </StudentAuthGuard>
  );
}
