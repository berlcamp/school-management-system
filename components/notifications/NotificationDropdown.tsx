/**
 * Notification Dropdown — division announcements (migration 198) and the
 * caller's own notifications (migration 239).
 */

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  fetchBellItems,
  markBellItemsRead,
  type BellItem,
} from "@/lib/notificationBell";
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
  const [items, setItems] = useState<BellItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await fetchBellItems(userId);
    setItems(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    fetchBellItems(userId).then((data) => {
      if (!isMounted) return;
      setItems(data);
      setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const unread = items.filter((a) => !a.is_read);

  const markAll = async () => {
    await markBellItemsRead(unread, userId);
    await load();
  };

  return (
    <Card className="absolute right-0 top-12 w-96 max-w-[calc(100vw-2rem)] z-50 shadow-lg">
      <CardContent className="p-0">
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <h3 className="font-semibold">Notifications</h3>
          {unread.length > 0 && (
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
              No notifications
            </div>
          ) : (
            <div className="divide-y">
              {items.map((a) => (
                <NotificationItem
                  key={`${a.source}-${a.id}`}
                  item={a}
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
