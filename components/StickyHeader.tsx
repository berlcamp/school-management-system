"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { Plus } from "lucide-react";
import Link from "next/link";
import HeaderDropdown from "./HeaderDropdownMenu";
import { NotificationBell } from "./notifications/NotificationBell";
import { Button } from "./ui/button";
import { SidebarTrigger } from "./ui/sidebar";

export default function StickyHeader() {
  const user = useAppSelector((state) => state.user.user);
  const isAgent = user?.type === "agent";

  return (
    <header className="fixed w-full top-0 z-40 bg-[#2e2e30] border-b border-[#424244] p-2 flex justify-start items-center gap-4">
      {!isAgent && <SidebarTrigger />}

      {/* Left section: Logo */}
      <div className="flex items-center">
        <div className="text-white font-semibold text-2xl flex items-center">
          <span>EBCES SMS</span>
        </div>
      </div>

      <div className="flex-1"></div>

      {/* Create Transaction button for agents */}
      {isAgent && (
        <Link href="/agent-transaction">
          <Button
            variant="default"
            className="mr-2 bg-green-600 hover:bg-green-700 text-white"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            Create Transaction
          </Button>
        </Link>
      )}

      {/* Notifications */}
      <NotificationBell />

      {/* Right section: Settings dropdown */}
      <HeaderDropdown />
    </header>
  );
}
