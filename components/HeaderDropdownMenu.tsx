"use client";

import { RoleAccessDialog } from "@/components/RoleAccessDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isRegionAccount } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import {
  formatUserType,
  getAvatarColor,
  getInitials,
  googleAvatarUrl,
} from "@/lib/utils/userProfile";
import { ChevronRight, LogOut, ShieldCheck, UserCog } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function HeaderDropdown() {
  const user = useAppSelector((state) => state.user.user);
  const name = user?.name ?? "";
  const initials = getInitials(name);
  const avatarColor = getAvatarColor(name);
  const roleLabel = formatUserType(user?.type);
  const photoUrl = googleAvatarUrl(user?.user_metadata);
  const [roleOpen, setRoleOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="outline-none rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Account menu"
          >
            <Avatar className="size-8 cursor-pointer transition-all hover:ring-2 hover:ring-border hover:ring-offset-1">
              {/* Google's CDN refuses requests that carry a referrer. */}
              <AvatarImage
                src={photoUrl}
                alt={name}
                referrerPolicy="no-referrer"
              />
              <AvatarFallback
                className={`${avatarColor} text-white text-xs font-semibold`}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-64 p-0 overflow-hidden shadow-lg"
        >
          {/* User info panel */}
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-3 px-4 py-4 bg-gray-50 dark:bg-zinc-800">
              <Avatar className="size-11 shrink-0">
                <AvatarImage
                  src={photoUrl}
                  alt={name}
                  referrerPolicy="no-referrer"
                />
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
              </div>
            </div>
          </DropdownMenuLabel>

          {/* The role opens a dialog of what it can do and which modules it opens. */}
          <div className="px-1.5 pt-1.5">
            <DropdownMenuItem
              onSelect={() => setRoleOpen(true)}
              className="group flex items-center gap-2.5 rounded-md px-3 py-2 cursor-pointer"
            >
              <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {roleLabel || "No role"}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  See what you can access
                </span>
              </span>
              <ChevronRight className="ml-auto size-4 text-gray-400 transition-transform group-hover:translate-x-0.5" />
            </DropdownMenuItem>
          </div>

          <DropdownMenuSeparator className="m-0" />

          <div className="p-1.5">
            {/* A Region Account (214) is not personnel and has no profile to keep. */}
            {!isRegionAccount(user?.type) && (
              <DropdownMenuItem asChild>
                <Link
                  href="/profile"
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-accent rounded-md transition-colors cursor-pointer"
                >
                  <UserCog className="size-4" />
                  My Profile
                </Link>
              </DropdownMenuItem>
            )}

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
      <RoleAccessDialog open={roleOpen} onOpenChange={setRoleOpen} />
    </>
  );
}
