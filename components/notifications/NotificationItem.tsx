/**
 * Notification Item Component
 * Individual notification display
 */

"use client";

import { markNotificationAsRead } from "@/lib/notifications/service";
import { useAppSelector } from "@/lib/redux/hook";
import { Notification } from "@/types/database";
import Link from "next/link";

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface NotificationItemProps {
  notification: Notification;
  onRead: () => void;
}

export function NotificationItem({
  notification,
  onRead,
}: NotificationItemProps) {
  const user = useAppSelector((state) => state.user.user);

  const handleClick = async () => {
    if (!notification.is_read && user?.system_user_id) {
      await markNotificationAsRead(notification.id, user.system_user_id);
      onRead();
    }
  };

  const getNotificationLink = () => {
    if (!notification.entity_type || !notification.entity_id) return "#";

    const entityMap: Record<string, string> = {
      medical_approval_request: `/medical/details/${notification.entity_id}`,
      medical_approval_approved: `/medical/details/${notification.entity_id}`,
      medical_approval_rejected: `/medical/details/${notification.entity_id}`,
      medical_approval_returned: `/medical/details/${notification.entity_id}`,
      funeral_approval_request: `/funeral/details/${notification.entity_id}`,
      funeral_approval_approved: `/funeral/details/${notification.entity_id}`,
      funeral_approval_rejected: `/funeral/details/${notification.entity_id}`,
      funeral_approval_returned: `/funeral/details/${notification.entity_id}`,
    };

    return entityMap[notification.entity_type] || "#";
  };

  return (
    <Link
      href={getNotificationLink()}
      onClick={handleClick}
      className={`block p-4 hover:bg-accent transition-colors ${
        !notification.is_read ? "bg-accent/50" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-medium text-sm">{notification.title}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {formatTimeAgo(new Date(notification.created_at))}
          </p>
        </div>
        {!notification.is_read && (
          <div className="h-2 w-2 rounded-full bg-primary mt-2" />
        )}
      </div>
    </Link>
  );
}
