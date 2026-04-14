"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSelector } from "@/lib/redux/hook";
import { LogOut } from "lucide-react";

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-pink-500",
];

function getAvatarColor(name: string): string {
  const index = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatUserType(type?: string): string {
  if (!type) return "";
  switch (type) {
    case "school_head":
      return "School Head";
    case "super admin":
      return "Super Admin";
    case "division_admin":
      return "Division Admin";
    case "division_type":
      return "Division User";
    case "teacher":
      return "Teacher";
    case "registrar":
      return "Registrar";
    case "admin":
      return "Admin";
    case "librarian":
      return "Librarian";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

export default function HeaderDropdown() {
  const user = useAppSelector((state) => state.user.user);
  const name = user?.name ?? "";
  const initials = name ? getInitials(name) : "?";
  const avatarColor = name ? getAvatarColor(name) : "bg-gray-500";
  const roleLabel = formatUserType(user?.type);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="outline-none rounded-full focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2e2e30]">
          <Avatar className="size-8 cursor-pointer transition-all hover:ring-2 hover:ring-white/40 hover:ring-offset-1 hover:ring-offset-[#2e2e30]">
            <AvatarFallback
              className={`${avatarColor} text-white text-xs font-semibold`}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 p-0 overflow-hidden shadow-lg">
        {/* User info panel */}
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-3 px-4 py-4 bg-gray-50 dark:bg-zinc-800">
            <Avatar className="size-11 shrink-0">
              <AvatarFallback
                className={`${avatarColor} text-white text-sm font-semibold`}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">
                {name}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {roleLabel}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="m-0" />

        <div className="p-1.5">
          <DropdownMenuItem asChild>
            <form action="/auth/signout" method="post" className="w-full">
              <button
                type="submit"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors cursor-pointer"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </form>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
