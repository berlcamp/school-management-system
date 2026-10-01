"use client";

import { ReviewHistory } from "@/components/examinations/review/ReviewHistory";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";
import { escapeIlikePattern } from "@/lib/utils";
import { authorizeTeacher, revokeTeacher } from "@/lib/utils/examReview";
import type { ExamQaAuthor } from "@/types";
import { Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface TeacherRow {
  id: string;
  name: string;
  school_id: string | null;
  school: { name: string | null } | null;
}

/**
 * Who may write Division TOS and exams (194). Authorize / revoke go through
 * exam_qa_authorize / exam_qa_revoke, which check the role and write the audit
 * trail; nothing here writes a table directly.
 */
/** Rows fetched per query; a full page means the list may be truncated. */
const TEACHER_LIMIT = 200;

export default function Page() {
  const [keyword, setKeyword] = useState("");
  const [schoolId, setSchoolId] = useState<string>("all");
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [authors, setAuthors] = useState<Map<string, ExamQaAuthor>>(new Map());
  const [revokeTarget, setRevokeTarget] = useState<TeacherRow | null>(null);
  const [reason, setReason] = useState("");
  const [historyFor, setHistoryFor] = useState<ExamQaAuthor | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    supabase
      .from("sms_schools")
      .select("id, name")
      .order("name")
      .then(({ data }) => setSchools((data as { id: string; name: string }[]) ?? []));
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      // Lists users whose ACTIVE type is a teacher role: a master teacher currently
      // switched into another hat is missed; ask them to switch back to Teacher.
      let q = supabase
        .from("sms_users")
        .select("id, name, school_id, school:school_id(name)")
        .in("type", ["teacher", "volunteer_teacher"])
        .eq("is_active", true)
        .order("name")
        .limit(TEACHER_LIMIT);
      if (keyword) q = q.ilike("name", `%${escapeIlikePattern(keyword)}%`);
      if (schoolId !== "all") q = q.eq("school_id", Number(schoolId));
      const [{ data: t }, { data: a }] = await Promise.all([
        q,
        supabase.from("sms_exam_qa_authors").select("*"),
      ]);
      if (!isMounted) return;
      setTeachers((t as unknown as TeacherRow[]) ?? []);
      setAuthors(new Map(((a as ExamQaAuthor[]) ?? []).map((r) => [String(r.user_id), r])));
    })();
    return () => {
      isMounted = false;
    };
  }, [keyword, schoolId, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const authorize = async (t: TeacherRow) => {
    const { error } = await authorizeTeacher(t.id);
    if (error) return toast.error(error);
    toast.success(`${t.name} may now write Division TOS`);
    refresh();
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    const { error } = await revokeTeacher(revokeTarget.id, reason);
    if (error) return toast.error(error);
    toast.success("Authorization revoked");
    setRevokeTarget(null);
    setReason("");
    refresh();
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <Users className="h-5 w-5" />
          Authorized Teachers
        </h1>
        <div className="app__title_actions gap-2">
          <Input
            placeholder="Search teacher"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-9 w-56"
          />
          <select
            className="h-9 rounded-md border px-2 text-sm"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
          >
            <option value="all">All schools</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="app__content">
        {teachers.length >= TEACHER_LIMIT && (
          <p className="mb-3 text-sm text-muted-foreground">
            Showing the first {TEACHER_LIMIT} teachers — search or filter by
            school to narrow.
          </p>
        )}
        <div className="app__table_container">
          <div className="app__table_wrapper">
            <table className="app__table">
              <thead className="app__table_thead">
                <tr>
                  <th className="app__table_th">Teacher</th>
                  <th className="app__table_th">School</th>
                  <th className="app__table_th">Division TOS Access</th>
                  <th className="app__table_th_right">Action</th>
                </tr>
              </thead>
              <tbody className="app__table_tbody">
                {teachers.map((t) => {
                  const a = authors.get(String(t.id));
                  const active = !!a?.is_active;
                  return (
                    <tr key={t.id} className="app__table_tr">
                      <td className="app__table_td">{t.name}</td>
                      <td className="app__table_td">{t.school?.name ?? "—"}</td>
                      <td className="app__table_td">
                        {active ? "✓ Authorized" : a ? "✗ Revoked" : "✗ Not authorized"}
                      </td>
                      <td className="app__table_td_actions">
                        <div className="flex justify-end gap-2">
                          {a && (
                            <Button variant="ghost" size="sm" onClick={() => setHistoryFor(a)}>
                              History
                            </Button>
                          )}
                          {active ? (
                            <Button variant="outline" size="sm" onClick={() => setRevokeTarget(t)}>
                              Revoke
                            </Button>
                          ) : (
                            <Button variant="green" size="sm" onClick={() => authorize(t)}>
                              Authorize
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {revokeTarget?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Their drafts freeze; anything already approved stays published.
          </p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={!reason.trim()} onClick={revoke}>
              Revoke
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authorization history</DialogTitle>
          </DialogHeader>
          {historyFor && <ReviewHistory entity="author" id={historyFor.id} refreshKey={refreshKey} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
