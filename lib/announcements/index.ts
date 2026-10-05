/**
 * Division announcements for the notification bell (migration 198).
 * Visibility and unread state are decided in SQL; these are thin readers.
 * Errors are logged and swallowed — a broken bell must never break a page.
 */

import { supabase } from "@/lib/supabase/client";

export const ANNOUNCEMENTS_CHANGED = "sms:announcements-changed";

export interface InboxAnnouncement {
  id: number;
  title: string;
  body: string;
  link_path: string | null;
  created_at: string;
  is_read: boolean;
}

export async function fetchInbox(limit = 20): Promise<InboxAnnouncement[]> {
  const { data, error } = await supabase.rpc("announcement_inbox", {
    p_limit: limit,
  });
  if (error) {
    console.error("Failed to load announcements:", error);
    return [];
  }
  return ((data ?? []) as InboxAnnouncement[]).map((a) => ({
    ...a,
    id: Number(a.id),
  }));
}

export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc("announcement_unread_count");
  if (error) {
    console.error("Failed to count announcements:", error);
    return 0;
  }
  return Number(data ?? 0);
}

export async function markAllAnnouncementsRead(
  ids: number[],
  userId: number,
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("sms_announcement_reads")
    .upsert(
      ids.map((announcement_id) => ({ announcement_id, user_id: userId })),
      { onConflict: "announcement_id,user_id", ignoreDuplicates: true },
    );
  if (error) console.error("Failed to mark announcements read:", error);
  window.dispatchEvent(new Event(ANNOUNCEMENTS_CHANGED));
}

export async function markAnnouncementRead(
  announcementId: number,
  userId: number,
): Promise<void> {
  await markAllAnnouncementsRead([announcementId], userId);
}
