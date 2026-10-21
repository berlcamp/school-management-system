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
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { usePathname } from "next/navigation";

export function LandingNav() {
  const pathname = usePathname();
  // Same year the landing page and /home report against (rolls over in June).
  const schoolYear = getCurrentSchoolYear();

  const navLinkClass = (active: boolean) =>
    `text-sm font-medium text-white/85 hover:text-white hover:bg-white/10 h-10 min-w-10 px-2.5 sm:px-3.5 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-white/70 ${
      active ? "bg-white/15 text-white" : ""
    }`;

  return (
    <header className="fixed w-full top-0 z-40 backdrop-blur-xl bg-slate-900/80 border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex items-center justify-between h-16">
          {/* Logo + Title */}
          <Link
            href="/"
            className="flex items-center gap-3 shrink-0 group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            aria-label="School Management System home"
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
              <p className="text-xs text-white/70 font-medium">
                Schools Division of Bayugan City
              </p>
            </div>
          </Link>

          {/* Center Nav */}
          <div className="flex items-center gap-1">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className={navLinkClass(pathname === "/")}
            >
              <Link href="/" aria-label="Home" aria-current={pathname === "/" ? "page" : undefined}>
                <Home className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
                <span className="hidden sm:inline">Home</span>
              </Link>
            </Button>

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
                  aria-label="Schools"
                >
                  <Building2 className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Schools</span>
                  <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-70" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-48 bg-white border-gray-200 shadow-lg"
              >
                <DropdownMenuItem asChild>
                  <Link
                    href="/schools"
                    className="cursor-pointer flex items-center gap-2 text-gray-700 hover:text-gray-900 focus:text-gray-900 focus:bg-gray-50"
                  >
                    <List className="h-4 w-4" />
                    School List
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/learners"
                    className="cursor-pointer flex items-center gap-2 text-gray-700 hover:text-gray-900 focus:text-gray-900 focus:bg-gray-50"
                  >
                    <GraduationCap className="h-4 w-4" />
                    Learners
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              asChild
              variant="ghost"
              size="sm"
              className={navLinkClass(
                pathname?.startsWith("/student-portal") || false,
              )}
            >
              <Link href="/student-portal" aria-label="Student Portal">
                <UserCircle className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
                <span className="hidden sm:inline">Student Portal</span>
              </Link>
            </Button>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 bg-white/10 border border-white/15 px-3 py-1.5 rounded-full">
              SY {schoolYear}
            </span>
            <Button
              asChild
              size="sm"
              className="bg-white text-slate-900 hover:bg-slate-100 font-semibold h-10 px-3 sm:px-4 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Link href="/login">
                <LogIn className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Sign in
              </Link>
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
}
