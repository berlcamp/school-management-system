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
  LogIn,
  UserCircle,
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

  const navLinkClass = (active: boolean) =>
    `text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 h-9 px-3.5 rounded-lg transition-all duration-200 ${
      active ? "bg-white/15 text-white" : ""
    }`;

  return (
    <header className="fixed w-full top-0 z-40 backdrop-blur-xl bg-slate-900/60 border-b border-white/10 shadow-lg shadow-black/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex items-center justify-between h-16">
          {/* Logo + Title */}
          <Link
            href="/"
            className="flex items-center gap-3 shrink-0 group"
          >
            <div className="relative h-10 w-10 flex-shrink-0 rounded-xl bg-white/10 p-1 ring-1 ring-white/15 transition-all group-hover:ring-white/30 group-hover:bg-white/15">
              <Image
                src="/deped-logo.svg"
                alt="DepEd Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-white tracking-tight leading-tight">
                School Management System
              </p>
              <p className="text-xs text-white/50 font-medium">
                Schools Division of Bayugan City
              </p>
            </div>
          </Link>

          {/* Center Nav */}
          <div className="flex items-center gap-1">
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className={navLinkClass(pathname === "/")}
              >
                <Home className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Home</span>
              </Button>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={navLinkClass(
                    pathname?.startsWith("/schools") ||
                      pathname?.startsWith("/learners") ||
                      false,
                  )}
                >
                  <Building2 className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Schools</span>
                  <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-48 bg-slate-900/95 backdrop-blur-xl border-white/10 text-white"
              >
                <DropdownMenuItem asChild>
                  <Link
                    href="/schools"
                    className="cursor-pointer flex items-center gap-2 text-white/90 hover:text-white focus:text-white focus:bg-white/10"
                  >
                    <List className="h-4 w-4" />
                    School List
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/learners"
                    className="cursor-pointer flex items-center gap-2 text-white/90 hover:text-white focus:text-white focus:bg-white/10"
                  >
                    <GraduationCap className="h-4 w-4" />
                    Learners
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Link href="/student-portal">
              <Button
                variant="ghost"
                size="sm"
                className={navLinkClass(
                  pathname?.startsWith("/student-portal") || false,
                )}
              >
                <UserCircle className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Student Portal</span>
              </Button>
            </Link>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold text-blue-300 bg-blue-500/10 border border-blue-400/20 px-3 py-1.5 rounded-full">
              SY {schoolYear}
            </span>
            <Link href="/login">
              <Button
                size="sm"
                className="bg-white text-slate-900 hover:bg-white/90 font-semibold h-9 px-4 rounded-lg shadow-lg shadow-white/5 transition-all duration-200 hover:shadow-white/10"
              >
                <LogIn className="h-4 w-4 mr-1.5" />
                Sign In
              </Button>
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
