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
import { useEffect, useState } from "react";
import { NotificationDropdown } from "./NotificationDropdown";

export function NotificationBell() {
  const user = useAppSelector((state) => state.user.user);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

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
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
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
        <NotificationDropdown
          onClose={() => setIsOpen(false)}
          userId={user?.system_user_id}
        />
      )}
    </div>
  );
}
