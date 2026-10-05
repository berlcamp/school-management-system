/**
 * One announcement in the bell. Clicking marks it read and, when it carries a
 * link, follows it. A failed read (e.g. archived meanwhile) never blocks the
 * navigation — the error is logged inside markAnnouncementRead.
 */

"use client";

import { InboxAnnouncement, markAnnouncementRead } from "@/lib/announcements";
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
  announcement: InboxAnnouncement;
  userId: number;
  onRead: () => void;
  onNavigate: () => void;
}

export function NotificationItem({
  announcement,
  userId,
  onRead,
  onNavigate,
}: NotificationItemProps) {
  const router = useRouter();

  const handleClick = async () => {
    if (!announcement.is_read) {
      await markAnnouncementRead(announcement.id, userId);
      onRead();
    }
    if (announcement.link_path) {
      onNavigate();
      router.push(announcement.link_path);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`block w-full text-left p-4 hover:bg-accent transition-colors ${
        !announcement.is_read ? "bg-accent/50" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{announcement.title}</p>
          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line break-words">
            {announcement.body}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {formatTimeAgo(new Date(announcement.created_at))}
            {announcement.link_path && " · Open"}
          </p>
        </div>
        {!announcement.is_read && (
          <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
        )}
      </div>
    </button>
  );
}
