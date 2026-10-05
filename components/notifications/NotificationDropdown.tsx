/**
 * Notification Dropdown — the caller's division announcements (migration 198).
 */

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  InboxAnnouncement,
  fetchInbox,
  markAllAnnouncementsRead,
} from "@/lib/announcements";
import { useCallback, useEffect, useState } from "react";
import { NotificationItem } from "./NotificationItem";

interface NotificationDropdownProps {
  userId: number;
  onClose: () => void;
}

export function NotificationDropdown({
  userId,
  onClose,
}: NotificationDropdownProps) {
  const [items, setItems] = useState<InboxAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await fetchInbox(20);
    setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetchInbox(20).then((data) => {
      if (!isMounted) return;
      setItems(data);
      setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const unreadIds = items.filter((a) => !a.is_read).map((a) => a.id);

  const markAll = async () => {
    await markAllAnnouncementsRead(unreadIds, userId);
    await load();
  };

  return (
    <Card className="absolute right-0 top-12 w-96 max-w-[calc(100vw-2rem)] z-50 shadow-lg">
      <CardContent className="p-0">
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <h3 className="font-semibold">Announcements</h3>
          {unreadIds.length > 0 && (
            <Button variant="ghost" size="sm" onClick={markAll}>
              Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="h-96">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No announcements
            </div>
          ) : (
            <div className="divide-y">
              {items.map((a) => (
                <NotificationItem
                  key={a.id}
                  announcement={a}
                  userId={userId}
                  onRead={load}
                  onNavigate={onClose}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
