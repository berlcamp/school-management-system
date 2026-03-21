/**
 * Notification Bell Component
 * Shows notification icon with badge for unread count
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getUnreadCount } from "@/lib/notifications/service";
import { useAppSelector } from "@/lib/redux/hook";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NotificationDropdown } from "./NotificationDropdown";

export function NotificationBell() {
  const user = useAppSelector((state) => state.user.user);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, close]);

  useEffect(() => {
    if (!user?.system_user_id) return;

    const loadUnreadCount = async () => {
      const count = await getUnreadCount(user.system_user_id!);
      setUnreadCount(count);
    };

    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [user?.system_user_id]);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative hover:bg-[#424244] hover:text-white"
      >
        <Bell className="h-5 w-5 text-white" />
        {unreadCount > 0 && (
          <Badge
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            variant="destructive"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </Button>
      {isOpen && user?.system_user_id && (
        <NotificationDropdown onClose={close} userId={user?.system_user_id} />
      )}
    </div>
  );
}
