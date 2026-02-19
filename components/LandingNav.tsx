"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2,
  ChevronDown,
  GraduationCap,
  Home,
  List,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

function getDefaultSchoolYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 6 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function LandingNav() {
  const pathname = usePathname();
  const schoolYear = getDefaultSchoolYear();

  return (
    <header className="fixed w-full top-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 shadow-sm">
      {/* Cover / Title Section */}
      <div className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-950/80 border-b border-slate-100 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Logo + Title */}
            <Link
              href="/"
              className="flex items-center gap-4 shrink-0 group transition-opacity hover:opacity-90"
            >
              <div className="relative h-14 w-14 sm:h-16 sm:w-16 flex-shrink-0 rounded-xl bg-white dark:bg-slate-800/50 p-1.5 shadow-sm ring-1 ring-slate-200/60 dark:ring-slate-700/50">
                <Image
                  src="/deped-logo.svg"
                  alt="DepEd Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  School Management System
                </h1>
                <p className="text-sm sm:text-base font-semibold text-slate-600 dark:text-slate-400">
                  Schools Division of Bayugan City
                </p>
              </div>
            </Link>

            {/* School Year Badge */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/20">
              <span className="text-xs font-medium opacity-90">SY</span>
              <span className="text-base font-bold tracking-tight">
                {schoolYear}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Nav Bar */}
      <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 dark:from-blue-800 dark:via-blue-900 dark:to-indigo-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex justify-between items-center h-12">
            <div className="flex items-center gap-0.5 sm:gap-1">
              <Link href="/">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`text-white/95 hover:bg-white/15 hover:text-white h-9 px-4 rounded-lg transition-all ${
                    pathname === "/" ? "bg-white/20 text-white" : ""
                  }`}
                >
                  <Home className="h-4 w-4 mr-2 hidden sm:inline" />
                  Home
                </Button>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`text-white/95 hover:bg-white/15 hover:text-white h-9 px-4 rounded-lg transition-all ${
                      pathname?.startsWith("/schools") ||
                      pathname?.startsWith("/learners")
                        ? "bg-white/20 text-white"
                        : ""
                    }`}
                  >
                    <Building2 className="h-4 w-4 mr-2 hidden sm:inline" />
                    Public Schools
                    <ChevronDown className="h-4 w-4 ml-1 opacity-80" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-48 border-slate-200 shadow-xl"
                >
                  <DropdownMenuItem asChild>
                    <Link
                      href="/schools"
                      className="cursor-pointer flex items-center gap-2"
                    >
                      <List className="h-4 w-4" />
                      School List
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/learners"
                      className="cursor-pointer flex items-center gap-2"
                    >
                      <GraduationCap className="h-4 w-4" />
                      Learners
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Link href="/login">
              <Button
                size="sm"
                className="bg-white/15 hover:bg-white/25 text-white font-semibold border border-white/20 backdrop-blur-sm"
              >
                Sign In
              </Button>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
