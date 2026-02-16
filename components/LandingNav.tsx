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
    <header className="fixed w-full top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      {/* Cover / Title Section - DepEd QC style */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Logo + Title */}
            <Link href="/" className="flex items-center gap-4 shrink-0">
              <div className="relative h-14 w-14 sm:h-16 sm:w-16 flex-shrink-0">
                <Image
                  src="/deped-logo.svg"
                  alt="DepEd Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
                  School Management System
                </h1>
                <p className="text-sm sm:text-base font-semibold text-gray-700">
                  Schools Division of Bayugan City
                </p>
              </div>
            </Link>

            {/* School Year Badge */}
            <div className="text-right">
              <p className="text-sm font-medium text-gray-600">SY:</p>
              <p className="text-lg font-bold text-[#034F8B]">{schoolYear}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Nav Bar */}
      <div className="bg-[#0d47a1] border-b border-[#1565c0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex justify-between items-center h-12">
            <div className="flex items-center gap-1 sm:gap-2">
              <Link href="/">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`text-white hover:bg-white/20 hover:text-white h-9 ${
                    pathname === "/" ? "bg-white/15" : ""
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
                    className={`text-white hover:bg-white/20 hover:text-white h-9 ${
                      pathname?.startsWith("/schools") ||
                      pathname?.startsWith("/learners")
                        ? "bg-white/15"
                        : ""
                    }`}
                  >
                    <Building2 className="h-4 w-4 mr-2 hidden sm:inline" />
                    Public Schools
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
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
              <Button variant="link" size="sm" className="text-white font-bold">
                Sign In
              </Button>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
