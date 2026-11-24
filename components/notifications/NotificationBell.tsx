/**
 * Notification Bell Component
 * Shows notification icon with badge for unread count
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BELL_CHANGED, fetchBellUnreadCount } from "@/lib/notificationBell";
import { GRADE_ADJUSTMENTS_CHANGED } from "@/lib/utils/gradeAdjustments";
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
    const userId = user?.system_user_id;
    if (!userId) return;
    let isMounted = true;

    const loadUnreadCount = async () => {
      const count = await fetchBellUnreadCount(Number(userId));
      if (isMounted) setUnreadCount(count);
    };

    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000); // Refresh every 30 seconds
    window.addEventListener(BELL_CHANGED, loadUnreadCount);
    window.addEventListener(GRADE_ADJUSTMENTS_CHANGED, loadUnreadCount);
    // Coming back to the tab must not wait for the next poll.
    window.addEventListener("focus", loadUnreadCount);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener(BELL_CHANGED, loadUnreadCount);
      window.removeEventListener(GRADE_ADJUSTMENTS_CHANGED, loadUnreadCount);
      window.removeEventListener("focus", loadUnreadCount);
    };
  }, [user?.system_user_id]);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
        }
        className="relative text-muted-foreground hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
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
