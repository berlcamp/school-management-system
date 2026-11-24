/**
 * One item in the bell. Clicking marks it read and, when it carries a
 * link, follows it. A failed read (e.g. archived meanwhile) never blocks the
 * navigation — the error is logged inside markBellItemsRead.
 */

"use client";

import { markBellItemsRead, type BellItem } from "@/lib/notificationBell";
import { useRouter } from "next/navigation";

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
  item: BellItem;
  userId: number;
  onRead: () => void;
  onNavigate: () => void;
}

export function NotificationItem({
  item,
  userId,
  onRead,
  onNavigate,
}: NotificationItemProps) {
  const router = useRouter();

  const handleClick = async () => {
    if (!item.is_read) {
      await markBellItemsRead([item], userId);
      onRead();
    }
    if (item.link_path) {
      onNavigate();
      router.push(item.link_path);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`block w-full text-left p-4 hover:bg-accent transition-colors ${
        !item.is_read ? "bg-accent/50" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{item.title}</p>
          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line break-words">
            {item.body}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {formatTimeAgo(new Date(item.created_at))}
            {item.link_path && " · Open"}
          </p>
        </div>
        {!item.is_read && (
          <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
        )}
      </div>
    </button>
  );
}
