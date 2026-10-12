"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { BookOpenCheck, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import HeaderDropdown from "./HeaderDropdownMenu";
import { RoleSwitcher } from "./RoleSwitcher";
import { SchoolSwitcher } from "./SchoolSwitcher";
import { NotificationBell } from "./notifications/NotificationBell";
import { SystemGuideDialog } from "./system-guide/SystemGuideDialog";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { SidebarTrigger } from "./ui/sidebar";

export default function StickyHeader() {
  const user = useAppSelector((state) => state.user.user);
  const isAgent = user?.type === "agent";
  const [schoolName, setSchoolName] = useState<string>("");
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    const schoolId = user?.school_id != null ? String(user.school_id) : null;
    if (!schoolId) {
      setSchoolName("");
      return;
    }
    supabase
      .from("sms_schools")
      .select("name")
      .eq("id", schoolId)
      .single()
      .then(({ data }) => setSchoolName(data?.name ?? ""));
  }, [user?.school_id]);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4 print:hidden">
      {!isAgent && <SidebarTrigger className="-ml-1" />}

      {/* Left: the school being worked in. The product name lives in the
          sidebar; an agent has no sidebar, so it shows here instead. */}
      <div className="flex min-w-0 items-center gap-2">
        {!isAgent && <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />}
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">
            {isAgent ? "School Management System" : schoolName || "School Management System"}
          </p>
          {!isAgent && schoolName && (
            <p className="hidden truncate text-xs text-muted-foreground sm:block">Schools Division of Bayugan City</p>
          )}
        </div>
      </div>

      {/* Right: switchers, guide, announcements and the user menu. */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* School switcher (super admin / multi-school users) */}
        <SchoolSwitcher />

        {/* Role switcher — only for someone holding more than one role here */}
        <RoleSwitcher />

        {/* System Guide */}
        {!isAgent && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGuideOpen(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="System guide"
            >
              <BookOpenCheck className="h-4 w-4" />
              <span className="hidden md:inline">Guide</span>
            </Button>
            <SystemGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
          </>
        )}

        {/* Create Transaction button for agents */}
        {isAgent && (
          <Link href="/agent-transaction">
            <Button variant="default" className="bg-green-600 text-white hover:bg-green-700" size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Create Transaction
            </Button>
          </Link>
        )}

        <NotificationBell />

        <HeaderDropdown />
      </div>
    </header>
  );
}
