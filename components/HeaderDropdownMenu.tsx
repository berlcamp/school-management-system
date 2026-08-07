"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSelector } from "@/lib/redux/hook";
import {
  formatUserType,
  getAvatarColor,
  getInitials,
  googleAvatarUrl,
} from "@/lib/utils/userProfile";
import { LogOut, UserCog } from "lucide-react";
import Link from "next/link";

export default function HeaderDropdown() {
  const user = useAppSelector((state) => state.user.user);
  const name = user?.name ?? "";
  const initials = getInitials(name);
  const avatarColor = getAvatarColor(name);
  const roleLabel = formatUserType(user?.type);
  const photoUrl = googleAvatarUrl(user?.user_metadata);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="outline-none rounded-full focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2e2e30]">
          <Avatar className="size-8 cursor-pointer transition-all hover:ring-2 hover:ring-white/40 hover:ring-offset-1 hover:ring-offset-[#2e2e30]">
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

      <DropdownMenuContent align="end" className="w-64 p-0 overflow-hidden shadow-lg">
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
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {roleLabel}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="m-0" />

        <div className="p-1.5">
          <DropdownMenuItem asChild>
            <Link
              href="/profile"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-accent rounded-md transition-colors cursor-pointer"
            >
              <UserCog className="size-4" />
              My Profile
            </Link>
          </DropdownMenuItem>

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
