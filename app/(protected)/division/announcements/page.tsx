"use client";

/**
 * Division announcements (migration 198). Posting writes one row; who sees it
 * is decided in SQL by audience + optional school. Archive, never delete.
 * Route sits under /division, so DivisionGuard already limits it to the three
 * author roles, which are also the only ones RLS lets write.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase/client";
import { format } from "date-fns";
import { Archive, ArchiveRestore, Megaphone, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  AUDIENCE_LABELS,
  AnnouncementModal,
  AnnouncementRow,
} from "./components/AnnouncementModal";

interface Stats {
  read: number;
  target: number;
}

export default function Page() {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [schools, setSchools] = useState<Map<number, string>>(new Map());
  const [stats, setStats] = useState<Map<number, Stats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const [annRes, statRes, schoolRes] = await Promise.all([
        supabase
          .from("sms_announcements")
          .select("id, title, body, audience, school_id, link_path, created_at, archived_at")
          .order("created_at", { ascending: false }),
        supabase.rpc("announcement_read_stats"),
        supabase.from("sms_schools").select("id, name"),
      ]);
      if (!isMounted) return;
      if (annRes.error) toast.error("Failed to load announcements.");
      setRows(((annRes.data ?? []) as AnnouncementRow[]).map((r) => ({
        ...r,
        id: Number(r.id),
        school_id: r.school_id == null ? null : Number(r.school_id),
      })));
      const s = new Map<number, Stats>();
      for (const r of (statRes.data ?? []) as {
        announcement_id: number; read_count: number; target_count: number;
      }[]) {
        s.set(Number(r.announcement_id), {
          read: Number(r.read_count),
          target: Number(r.target_count),
        });
      }
      setStats(s);
      setSchools(new Map(((schoolRes.data ?? []) as { id: number; name: string }[])
        .map((x) => [Number(x.id), x.name])));
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  const toggleArchive = async (row: AnnouncementRow) => {
    const { error } = await supabase
      .from("sms_announcements")
      .update({ archived_at: row.archived_at ? null : new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      toast.error("Failed to update the announcement.");
      return;
    }
    toast.success(row.archived_at ? "Announcement restored." : "Announcement archived.");
    reload();
  };

  return (
    <div>
      <div className="app__title flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="app__title_text flex items-center gap-2">
            <Megaphone className="h-5 w-5" /> Announcements
          </h1>
          <p className="text-sm text-muted-foreground">
            Posted to the notification bell of the employees you address.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New Announcement
        </Button>
      </div>

      <div className="app__content">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No announcements yet. Post one to reach every employee&apos;s bell.
          </p>
        ) : (
          <div className="app__table_shell">
            <div className="app__table_wrapper">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left font-medium">Announcement</th>
                    <th className="text-left font-medium">Sent to</th>
                    <th className="text-left font-medium">Posted</th>
                    <th className="text-right font-medium">Read</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = stats.get(r.id);
                    return (
                      <tr key={r.id} className={r.archived_at ? "opacity-60" : ""}>
                        <td>
                          <div className="font-medium flex items-center gap-2">
                            {r.title}
                            {r.archived_at && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">
                            {r.body}
                          </div>
                        </td>
                        <td>
                          {AUDIENCE_LABELS[r.audience]}
                          <div className="text-xs text-muted-foreground">
                            {r.school_id == null ? "All schools" : (schools.get(r.school_id) ?? "—")}
                          </div>
                        </td>
                        <td className="whitespace-nowrap">
                          {format(new Date(r.created_at), "MMM d, yyyy")}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {st ? `${st.read} of ${st.target}` : "—"}
                        </td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" aria-label="Edit"
                              onClick={() => { setEditing(r); setModalOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon"
                              aria-label={r.archived_at ? "Restore" : "Archive"}
                              onClick={() => toggleArchive(r)}>
                              {r.archived_at ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AnnouncementModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
        editData={editing}
      />
    </div>
  );
}
