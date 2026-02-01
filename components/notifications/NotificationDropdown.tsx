/* eslint-disable react-hooks/exhaustive-deps */
/**
 * Notification Dropdown Component
 * Displays list of notifications
 */

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getUserNotifications } from "@/lib/notifications/service";
import { Notification } from "@/types/database";
import { useEffect, useState } from "react";
import { NotificationItem } from "./NotificationItem";

interface NotificationDropdownProps {
  userId: number;
  onClose: () => void;
}

export function NotificationDropdown({
  userId,
  onClose,
}: NotificationDropdownProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, [userId]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const data = await getUserNotifications(userId, 20);
      setNotifications(data);
    } catch (error) {
      console.error("Failed to load notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="absolute right-0 top-12 w-96 z-50 shadow-lg">
      <CardContent className="p-0">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
        </div>
        <ScrollArea className="h-96">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No notifications
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={loadNotifications}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
