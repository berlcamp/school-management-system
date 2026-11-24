/**
 * The bell's two sources: division announcements (198) and personal
 * notifications (239). Each is read on its own, so one failing (or 239 not
 * being applied yet) never empties the other.
 */

import {
  ANNOUNCEMENTS_CHANGED,
  fetchInbox,
  fetchUnreadCount,
  markAllAnnouncementsRead,
} from "@/lib/announcements";
import { supabase } from "@/lib/supabase/client";

/** Fired after anything in the bell is read. */
export const BELL_CHANGED = ANNOUNCEMENTS_CHANGED;

export interface BellItem {
  source: "announcement" | "notification";
  id: number;
  title: string;
  body: string;
  link_path: string | null;
  created_at: string;
  is_read: boolean;
}

/** `userId` is explicit beside RLS so a future wider policy cannot widen the bell. */
async function fetchNotifications(userId: number, limit: number): Promise<BellItem[]> {
  const { data, error } = await supabase
    .from("sms_notifications")
    .select("id, title, body, link_path, created_at, read_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("Failed to load notifications:", error);
    return [];
  }
  return (data ?? []).map((n) => ({
    source: "notification" as const,
    id: Number(n.id),
    title: n.title,
    body: n.body,
    link_path: n.link_path,
    created_at: n.created_at,
    is_read: n.read_at !== null,
  }));
}

export async function fetchBellItems(userId: number, limit = 20): Promise<BellItem[]> {
  const [announcements, notifications] = await Promise.all([
    fetchInbox(limit),
    fetchNotifications(userId, limit),
  ]);
  return [
    ...announcements.map((a) => ({ ...a, source: "announcement" as const })),
    ...notifications,
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function fetchBellUnreadCount(userId: number): Promise<number> {
  const [announcements, notifications] = await Promise.all([
    fetchUnreadCount(),
    supabase
      .from("sms_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null),
  ]);
  if (notifications.error) {
    console.error("Failed to count notifications:", notifications.error);
  }
  return announcements + (notifications.count ?? 0);
}

export async function markBellItemsRead(
  items: BellItem[],
  userId: number,
): Promise<void> {
  const idsOf = (source: BellItem["source"]) =>
    items.filter((i) => i.source === source && !i.is_read).map((i) => i.id);
  const notificationIds = idsOf("notification");
  if (notificationIds.length > 0) {
    const { error } = await supabase.rpc("notifications_mark_read", {
      p_ids: notificationIds,
    });
    if (error) console.error("Failed to mark notifications read:", error);
  }
  await markAllAnnouncementsRead(idsOf("announcement"), userId);
  window.dispatchEvent(new Event(BELL_CHANGED));
}
