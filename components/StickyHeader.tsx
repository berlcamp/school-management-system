"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import HeaderDropdown from "./HeaderDropdownMenu";
import { NotificationBell } from "./notifications/NotificationBell";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { SidebarTrigger } from "./ui/sidebar";

export default function StickyHeader() {
  const user = useAppSelector((state) => state.user.user);
  const isAgent = user?.type === "agent";
  const [schoolName, setSchoolName] = useState<string>("");

  useEffect(() => {
    const schoolId =
      user?.school_id != null ? String(user.school_id) : null;
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

  const formatUserType = (type?: string) => {
    if (!type) return "";
    switch (type) {
      case "school_head":
        return "School Head";
      case "super admin":
        return "Super Admin";
      case "teacher":
        return "Teacher";
      case "registrar":
        return "Registrar";
      case "admin":
        return "Admin";
      case "agent":
        return "Agent";
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  return (
    <header className="fixed w-full top-0 z-40 bg-[#2e2e30] border-b border-[#424244] p-2 flex justify-start items-center gap-4">
      {!isAgent && <SidebarTrigger />}

      {/* Left section: Logo */}
      <div className="flex items-center">
        <div className="text-white font-semibold text-lg flex flex-col">
          <span className="md:hidden">SMS</span>
          <span className="hidden md:inline">School Management System</span>
          {schoolName && (
            <span className="hidden md:inline text-xs font-normal text-gray-400 mt-0.5">
              {schoolName}
            </span>
          )}
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

      {/* User name and type */}
      {user?.name && (
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-medium">{user.name}</span>
          {user?.type && (
            <Badge variant="secondary" className="text-xs">
              {formatUserType(user.type)}
            </Badge>
          )}
        </div>
      )}

      {/* Right section: Settings dropdown */}
      <HeaderDropdown />
    </header>
  );
}
