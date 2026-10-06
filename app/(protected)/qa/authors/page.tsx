"use client";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ReviewHistory } from "@/components/examinations/review/ReviewHistory";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";
import { cn, escapeIlikePattern } from "@/lib/utils";
import { authorizeTeacher, revokeTeacher } from "@/lib/utils/examReview";
import type { ExamQaAuthor } from "@/types";
import { format } from "date-fns";
import { CheckCircle2, History, Loader2, Search, ShieldCheck, ShieldOff, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface TeacherRow {
  id: string;
  name: string;
  school_id: string | null;
  school: { name: string | null } | null;
}

type View = "all" | "authorized" | "revoked";

const VIEWS: { key: View; label: string }[] = [
  { key: "all", label: "All teachers" },
  { key: "authorized", label: "Authorized" },
  { key: "revoked", label: "Revoked" },
];

/**
 * Who may write Division TOS and exams (194). Authorize / revoke go through
 * exam_qa_authorize / exam_qa_revoke, which check the role and write the audit
 * trail; nothing here writes a table directly.
 */
/** Rows fetched per query; a full page means the list may be truncated. */
const TEACHER_LIMIT = 200;

function initials(name: string) {
  return name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Page() {
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const keyword = useDebounced(search.trim(), 300);
  const [schoolId, setSchoolId] = useState<string>("all");
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [authors, setAuthors] = useState<Map<string, ExamQaAuthor>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Kept after close so the dialog text does not change mid-animation.
  const [authorizeTarget, setAuthorizeTarget] = useState<TeacherRow | null>(null);
  const [authorizeOpen, setAuthorizeOpen] = useState(false);
  const [reauthorizing, setReauthorizing] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<TeacherRow | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [historyFor, setHistoryFor] = useState<{ author: ExamQaAuthor; name: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
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
      setLoading(true);
      const { data: a } = await supabase.from("sms_exam_qa_authors").select("*");
      if (!isMounted) return;
      const rows = (a as ExamQaAuthor[]) ?? [];
      const map = new Map(rows.map((r) => [String(r.user_id), r]));

      let q = supabase
        .from("sms_users")
        .select("id, name, school_id, school:school_id(name)")
        .eq("is_active", true)
        .order("name")
        .limit(TEACHER_LIMIT);
      if (view === "all") {
        // Lists users whose ACTIVE type is a teacher role: a master teacher currently
        // switched into another hat is missed; ask them to switch back to Teacher.
        q = q.in("type", ["teacher", "volunteer_teacher"]);
      } else {
        // The authorized / revoked views list by authorization, whatever role the
        // teacher is acting as right now, so nobody authorized drops out of sight.
        const ids = rows.filter((r) => r.is_active === (view === "authorized")).map((r) => Number(r.user_id));
        if (ids.length === 0) {
          setAuthors(map);
          setTeachers([]);
          setLoading(false);
          return;
        }
        q = q.in("id", ids);
      }
      if (keyword) q = q.ilike("name", `%${escapeIlikePattern(keyword)}%`);
      if (schoolId !== "all") q = q.eq("school_id", Number(schoolId));
      const { data: t, error } = await q;
      if (!isMounted) return;
      if (error) toast.error(error.message);
      setAuthors(map);
      setTeachers((t as unknown as TeacherRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [view, keyword, schoolId, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const authorizedCount = [...authors.values()].filter((a) => a.is_active).length;
  const revokedCount = authors.size - authorizedCount;
  const countOf: Record<View, number | null> = {
    all: null,
    authorized: authorizedCount,
    revoked: revokedCount,
  };

  const authorize = async () => {
    const t = authorizeTarget;
    if (!t || busyId) return;
    setBusyId(t.id);
    const { error } = await authorizeTeacher(t.id);
    setBusyId(null);
    if (error) return void toast.error(error);
    toast.success(`${t.name} may now write Division TOS and exams`);
    setAuthorizeOpen(false);
    refresh();
  };

  const openRevoke = (t: TeacherRow) => {
    setRevokeTarget(t);
    setReason("");
    setRevokeOpen(true);
  };

  const revoke = async () => {
    if (!revokeTarget || !reason.trim() || revoking) return;
    setRevoking(true);
    const { error } = await revokeTeacher(revokeTarget.id, reason.trim());
    setRevoking(false);
    if (error) return void toast.error(error);
    toast.success(`Revoked ${revokeTarget.name}`);
    setRevokeOpen(false);
    refresh();
  };

  const filtered = keyword !== "" || schoolId !== "all";

  return (
    <div>
      <div className="app__title">
        <div className="min-w-0 space-y-0.5">
          <h1 className="app__title_text flex items-center gap-2">
            <Users className="h-5 w-5 shrink-0" />
            Authorized Teachers
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Teachers authorized here may write Division TOS and exams and submit them for QA review.
            Revoking freezes their drafts; anything already approved stays published.
          </p>
        </div>
      </div>

      <div className="app__content space-y-3">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 shadow-sm lg:flex-row lg:items-center">
          <div role="group" aria-label="Show" className="inline-flex w-fit rounded-lg border bg-muted/40 p-0.5">
            {VIEWS.map((v) => {
              const active = v.key === view;
              const n = countOf[v.key];
              return (
                <button
                  key={v.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(v.key)}
                  className={cn(
                    "inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v.label}
                  {n !== null && <span className="text-xs tabular-nums text-muted-foreground">{n}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:ml-auto">
            <div className="relative sm:w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teacher"
                aria-label="Search teacher"
                className="h-9 pl-8"
              />
            </div>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger aria-label="School" className="h-9 w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All schools</SelectItem>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!loading && teachers.length >= TEACHER_LIMIT && (
          <p className="text-sm text-muted-foreground">
            Showing the first {TEACHER_LIMIT} teachers — search or filter by school to narrow.
          </p>
        )}

        {/* List */}
        <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_11rem] gap-4 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>Teacher</span>
            <span>School</span>
            <span>Division TOS access</span>
            <span className="sr-only">Actions</span>
          </div>

          {loading && (
            <ul className="divide-y">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <Skeleton className="h-4 w-48" />
                </li>
              ))}
            </ul>
          )}

          {!loading && teachers.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              {view === "authorized" ? (
                <ShieldCheck className="h-8 w-8 text-muted-foreground/60" aria-hidden />
              ) : (
                <Users className="h-8 w-8 text-muted-foreground/60" aria-hidden />
              )}
              <p className="font-medium">
                {filtered
                  ? "No teacher matches"
                  : view === "authorized"
                    ? "No teacher is authorized yet"
                    : view === "revoked"
                      ? "No authorization has been revoked"
                      : "No active teachers found"}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {filtered
                  ? "Clear the search or pick another school."
                  : view === "authorized"
                    ? "Find a teacher under All teachers and authorize them to write Division TOS and exams."
                    : view === "all"
                      ? "Only teachers acting as Teacher right now are listed; ask a master teacher to switch back to Teacher."
                      : ""}
              </p>
              {view === "authorized" && !filtered && (
                <Button size="sm" variant="outline" className="mt-1" onClick={() => setView("all")}>
                  Browse all teachers
                </Button>
              )}
            </div>
          )}

          {!loading && teachers.length > 0 && (
            <ul className="divide-y">
              {teachers.map((t) => {
                const a = authors.get(String(t.id));
                const active = !!a?.is_active;
                const busy = busyId === t.id;
                return (
                  <li
                    key={t.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_11rem]"
                  >
                    <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          active
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {initials(t.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.name}</p>
                        <p className="truncate text-xs text-muted-foreground md:hidden">{t.school?.name ?? "—"}</p>
                      </div>
                    </div>

                    <p className="hidden truncate text-sm text-muted-foreground md:block">{t.school?.name ?? "—"}</p>

                    <div className="row-start-2 min-w-0 pl-12 md:row-start-auto md:pl-0">
                      {active ? (
                        <span className="inline-flex flex-col">
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Authorized
                          </span>
                          <span className="mt-0.5 text-xs text-muted-foreground">
                            since {format(new Date(a.authorized_at), "MMM d, yyyy")}
                          </span>
                        </span>
                      ) : a ? (
                        <span className="inline-flex flex-col">
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900">
                            <ShieldOff className="h-3.5 w-3.5" aria-hidden /> Revoked
                          </span>
                          {a.revoked_at && (
                            <span
                              className="mt-0.5 line-clamp-1 text-xs text-muted-foreground"
                              title={a.revoke_reason ?? undefined}
                            >
                              {format(new Date(a.revoked_at), "MMM d, yyyy")}
                              {a.revoke_reason && <> · {a.revoke_reason}</>}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not authorized</span>
                      )}
                    </div>

                    <div className="col-start-2 row-start-2 flex items-center justify-end gap-1 self-start md:col-start-auto md:row-start-auto md:self-auto">
                      {a && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-foreground"
                          aria-label={`Authorization history of ${t.name}`}
                          title="History"
                          onClick={() => {
                            setHistoryFor({ author: a, name: t.name });
                            setHistoryOpen(true);
                          }}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                      )}
                      {active ? (
                        <Button variant="outline" size="sm" className="w-32" onClick={() => openRevoke(t)}>
                          Revoke
                        </Button>
                      ) : (
                        <Button
                          variant="green"
                          size="sm"
                          className="w-32"
                          disabled={busyId !== null}
                          onClick={() => {
                            setAuthorizeTarget(t);
                            setReauthorizing(!!a);
                            setAuthorizeOpen(true);
                          }}
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                          {a ? "Re-authorize" : "Authorize"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={authorizeOpen}
        onOpenChange={(o) => !busyId && setAuthorizeOpen(o)}
        title={`${reauthorizing ? "Re-authorize" : "Authorize"} ${authorizeTarget?.name ?? ""}?`}
        description={
          <>
            {authorizeTarget?.school?.name ? `${authorizeTarget.school.name}. ` : ""}
            They will be able to write Division TOS and exams and submit them for QA review. You can revoke
            this at any time.
          </>
        }
        confirmText={reauthorizing ? "Re-authorize" : "Authorize"}
        loading={busyId !== null}
        onConfirm={() => void authorize()}
      />

      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void revoke();
            }}
          >
            <DialogHeader>
              <DialogTitle>Revoke {revokeTarget?.name}?</DialogTitle>
              <DialogDescription>
                {revokeTarget?.school?.name ? `${revokeTarget.school.name}. ` : ""}
                Their drafts freeze; anything already approved stays published. You can authorize them
                again later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="revoke-reason">Reason</Label>
              <Textarea
                id="revoke-reason"
                autoFocus
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Recorded in the authorization history"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRevokeOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={!reason.trim() || revoking}>
                {revoking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Revoke access
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authorization history</DialogTitle>
            {historyFor && <DialogDescription>{historyFor.name}</DialogDescription>}
          </DialogHeader>
          {historyFor && <ReviewHistory entity="author" id={historyFor.author.id} refreshKey={refreshKey} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
