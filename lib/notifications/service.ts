/**
 * Notification Service
 * Handles in-app and email notifications
 */

"use server";

import { getSupabaseClient } from "@/lib/supabase/server";
import { NotificationType } from "@/types/database";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Create a notification
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<string | null> {
  try {
    const supabase = await getSupabaseClient();

    const { data, error } = await supabase
      .from("adm_notifications")
      .insert({
        user_id: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        entity_type: params.entityType || null,
        entity_id: params.entityId || null,
        is_read: false,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create notification:", error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error("Error creating notification:", error);
    return null;
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  notificationId: string,
  userId: number
): Promise<boolean> {
  try {
    const supabase = await getSupabaseClient();

    const { error } = await supabase
      .from("adm_notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("id", notificationId)
      .eq("user_id", userId);

    return !error;
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return false;
  }
}

/**
 * Get user's notifications
 */
export async function getUserNotifications(userId: number, limit = 50) {
  try {
    const supabase = await getSupabaseClient();

    const { data, error } = await supabase
      .from("adm_notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return [];
  }
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId: number): Promise<number> {
  try {
    const supabase = await getSupabaseClient();

    const { count, error } = await supabase
      .from("adm_notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error("Error getting unread count:", error);
    return 0;
  }
}
