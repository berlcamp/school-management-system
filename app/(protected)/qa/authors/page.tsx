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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { USER_TYPE_LABELS, isLoginDisabledUserType } from "@/lib/constants/userTypes";
import { supabase } from "@/lib/supabase/client";
import { cn, escapeIlikePattern } from "@/lib/utils";
import {
  authorizeTeacher,
  canHoldDivisionRights,
  revokeTeacher,
  setCompetencyAccess,
} from "@/lib/utils/examReview";
import type { CompetencyContributor, ExamQaAuthor } from "@/types";
import { format } from "date-fns";
import { History, Loader2, Search, ShieldCheck, ShieldOff, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface UserRow {
  id: string;
  name: string;
  type: string | null;
  school_id: string | null;
  school: { name: string | null } | null;
}

type View = "all" | "authors" | "contributors" | "revoked";

const VIEWS: { key: View; label: string }[] = [
  { key: "all", label: "All users" },
  { key: "authors", label: "TOS / Exam authors" },
  { key: "contributors", label: "Can add competencies" },
  { key: "revoked", label: "Revoked" },
];

/**
 * Who may write Division TOS and exams (194), and — separately, since 237 —
 * who may add entries to the competency catalogue. Any role may hold either,
 * except accounts that cannot sign in and the view-only partner accounts.
 * Every change goes through exam_qa_authorize / exam_qa_revoke /
 * exam_qa_set_competency_access, which check the role and keep the record;
 * nothing here writes a table directly.
 */
/** Rows fetched per query; a full page means the list may be truncated. */
const USER_LIMIT = 200;

const roleLabel = (type: string | null) =>
  type ? (USER_TYPE_LABELS[type] ?? type) : "—";

/** Why a user cannot hold either right, or null when they can. */
const ineligibleReason = (type: string | null): string | null =>
  canHoldDivisionRights(type)
    ? null
    : isLoginDisabledUserType(type)
      ? "This role cannot sign in"
      : "View-only account";

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
  const [role, setRole] = useState<string>("all");
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [authors, setAuthors] = useState<Map<string, ExamQaAuthor>>(new Map());
  const [contributors, setContributors] = useState<Map<string, CompetencyContributor>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Kept after close so the dialog text does not change mid-animation.
  const [authorizeTarget, setAuthorizeTarget] = useState<UserRow | null>(null);
  const [authorizeOpen, setAuthorizeOpen] = useState(false);
  const [reauthorizing, setReauthorizing] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<UserRow | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [historyFor, setHistoryFor] = useState<{ author: ExamQaAuthor; name: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [accessBusyId, setAccessBusyId] = useState<string | null>(null);

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
      const [a, c] = await Promise.all([
        supabase.from("sms_exam_qa_authors").select("*"),
        supabase.from("sms_competency_contributors").select("*"),
      ]);
      if (!isMounted) return;
      const authorRows = (a.data as ExamQaAuthor[]) ?? [];
      const authorMap = new Map(authorRows.map((r) => [String(r.user_id), r]));
      // Before migration 237 the table does not exist: nobody holds the grant.
      const contributorRows = c.error ? [] : ((c.data as CompetencyContributor[]) ?? []);
      const contributorMap = new Map(contributorRows.map((r) => [String(r.user_id), r]));

      let q = supabase
        .from("sms_users")
        .select("id, name, type, school_id, school:school_id(name)")
        .eq("is_active", true)
        .order("name")
        .limit(USER_LIMIT);
      if (view !== "all") {
        // These views list by grant, whatever role the person is acting as
        // right now, so nobody holding a right drops out of sight.
        const ids =
          view === "authors"
            ? authorRows.filter((r) => r.is_active).map((r) => Number(r.user_id))
            : view === "contributors"
              ? contributorRows.filter((r) => r.is_active).map((r) => Number(r.user_id))
              : authorRows.filter((r) => !r.is_active).map((r) => Number(r.user_id));
        if (ids.length === 0) {
          setAuthors(authorMap);
          setContributors(contributorMap);
          setUsers([]);
          setLoading(false);
          return;
        }
        q = q.in("id", ids);
      }
      if (keyword) q = q.ilike("name", `%${escapeIlikePattern(keyword)}%`);
      if (schoolId !== "all") q = q.eq("school_id", Number(schoolId));
      if (role !== "all") q = q.eq("type", role);
      const { data: rows, error } = await q;
      if (!isMounted) return;
      if (error) toast.error(error.message);
      setAuthors(authorMap);
      setContributors(contributorMap);
      setUsers((rows as unknown as UserRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [view, keyword, schoolId, role, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const activeAuthors = [...authors.values()].filter((a) => a.is_active).length;
  const countOf: Record<View, number | null> = {
    all: null,
    authors: activeAuthors,
    contributors: [...contributors.values()].filter((c) => c.is_active).length,
    revoked: authors.size - activeAuthors,
  };

  const authorize = async () => {
    const u = authorizeTarget;
    if (!u || busyId) return;
    setBusyId(u.id);
    const { error } = await authorizeTeacher(u.id);
    setBusyId(null);
    if (error) return void toast.error(error);
    toast.success(`${u.name} may now write Division TOS and exams`);
    setAuthorizeOpen(false);
    refresh();
  };

  const toggleCompetencyAccess = async (u: UserRow, enabled: boolean) => {
    if (accessBusyId) return;
    setAccessBusyId(u.id);
    const { error } = await setCompetencyAccess(u.id, enabled);
    setAccessBusyId(null);
    if (error) return void toast.error(error);
    toast.success(
      enabled
        ? `${u.name} may now add competencies to the catalogue`
        : `${u.name} may no longer add competencies`,
    );
    refresh();
  };

  const onAuthorSwitch = (u: UserRow, on: boolean) => {
    if (on) {
      setAuthorizeTarget(u);
      setReauthorizing(authors.has(String(u.id)));
      setAuthorizeOpen(true);
    } else {
      setRevokeTarget(u);
      setReason("");
      setRevokeOpen(true);
    }
  };

  const revoke = async () => {
    if (!revokeTarget || !reason.trim() || revoking) return;
    setRevoking(true);
    const { error } = await revokeTeacher(revokeTarget.id, reason.trim());
    setRevoking(false);
    if (error) return void toast.error(error);
    toast.success(`${revokeTarget.name} may no longer write Division TOS and exams`);
    setRevokeOpen(false);
    refresh();
  };

  const filtered = keyword !== "" || schoolId !== "all" || role !== "all";
  const gridCols =
    "md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_2.5rem]";

  return (
    <div>
      <div className="app__title">
        <div className="min-w-0 space-y-0.5">
          <h1 className="app__title_text flex items-center gap-2">
            <Users className="h-5 w-5 shrink-0" />
            Division Authors
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Two separate rights, for anyone in the division whatever their role.{" "}
            <span className="font-medium text-foreground">TOS / Exam author</span> lets them write
            Division TOS, exams and Question Bank items and submit them for QA review; turning it off
            freezes their drafts and keeps anything already approved.{" "}
            <span className="font-medium text-foreground">Can add competencies</span> lets them add
            entries to the Competency Catalogue (flagged as added by a contributor).
          </p>
        </div>
      </div>

      <div className="app__content space-y-3">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 shadow-sm xl:flex-row xl:items-center">
          <div role="group" aria-label="Show" className="inline-flex w-fit flex-wrap rounded-lg border bg-muted/40 p-0.5">
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
          <div className="flex flex-col gap-2 sm:flex-row xl:ml-auto">
            <div className="relative sm:w-56">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name"
                aria-label="Search name"
                className="h-9 pl-8"
              />
            </div>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label="Role" className="h-9 w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {Object.entries(USER_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger aria-label="School" className="h-9 w-full sm:w-56">
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

        {!loading && users.length >= USER_LIMIT && (
          <p className="text-sm text-muted-foreground">
            Showing the first {USER_LIMIT} users — search, or filter by role or school, to narrow.
          </p>
        )}

        {/* List */}
        <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
          <div className={cn("hidden gap-4 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground md:grid", gridCols)}>
            <span>User</span>
            <span>School</span>
            <span>TOS / Exam author</span>
            <span>Can add competencies</span>
            <span className="sr-only">History</span>
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

          {!loading && users.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              {view === "authors" ? (
                <ShieldCheck className="h-8 w-8 text-muted-foreground/60" aria-hidden />
              ) : (
                <Users className="h-8 w-8 text-muted-foreground/60" aria-hidden />
              )}
              <p className="font-medium">
                {filtered
                  ? "No user matches"
                  : view === "authors"
                    ? "Nobody is authorized to write Division TOS yet"
                    : view === "contributors"
                      ? "Nobody may add competencies yet"
                      : view === "revoked"
                        ? "No authorization has been revoked"
                        : "No active users found"}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {filtered
                  ? "Clear the search or the filters."
                  : view === "authors" || view === "contributors"
                    ? "Find the person under All users and switch it on."
                    : ""}
              </p>
              {(view === "authors" || view === "contributors") && !filtered && (
                <Button size="sm" variant="outline" className="mt-1" onClick={() => setView("all")}>
                  Browse all users
                </Button>
              )}
            </div>
          )}

          {!loading && users.length > 0 && (
            <ul className="divide-y">
              {users.map((u) => {
                const a = authors.get(String(u.id));
                const c = contributors.get(String(u.id));
                const isAuthor = !!a?.is_active;
                const isContributor = !!c?.is_active;
                const blocked = ineligibleReason(u.type);
                return (
                  <li
                    key={u.id}
                    className={cn("grid grid-cols-1 items-center gap-x-4 gap-y-2 px-4 py-3", gridCols)}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          isAuthor || isContributor
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {initials(u.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {roleLabel(u.type)}
                          <span className="md:hidden"> · {u.school?.name ?? "Division office"}</span>
                        </p>
                      </div>
                    </div>

                    <p className="hidden truncate text-sm text-muted-foreground md:block">
                      {u.school?.name ?? "Division office"}
                    </p>

                    {blocked ? (
                      <p className="pl-12 text-xs text-muted-foreground md:col-span-2 md:pl-0">{blocked}</p>
                    ) : (
                      <>
                        <div className="min-w-0 pl-12 md:pl-0">
                          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                            <Switch
                              checked={isAuthor}
                              disabled={busyId !== null}
                              onCheckedChange={(on) => onAuthorSwitch(u, on)}
                              aria-label={`${u.name} may write Division TOS and exams`}
                            />
                            {busyId === u.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : null}
                            <span className="md:sr-only">TOS / Exam author</span>
                          </label>
                          {isAuthor ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              since {format(new Date(a.authorized_at), "MMM d, yyyy")}
                            </p>
                          ) : a?.revoked_at ? (
                            <p
                              className="mt-0.5 line-clamp-1 text-xs text-muted-foreground"
                              title={a.revoke_reason ?? undefined}
                            >
                              <ShieldOff className="mr-1 inline h-3 w-3 align-[-2px]" aria-hidden />
                              Revoked {format(new Date(a.revoked_at), "MMM d, yyyy")}
                              {a.revoke_reason && <> · {a.revoke_reason}</>}
                            </p>
                          ) : null}
                        </div>
                        <div className="min-w-0 pl-12 md:pl-0">
                          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                            <Switch
                              checked={isContributor}
                              disabled={accessBusyId !== null}
                              onCheckedChange={(on) => void toggleCompetencyAccess(u, on)}
                              aria-label={`${u.name} may add competencies to the catalogue`}
                            />
                            {accessBusyId === u.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : null}
                            <span className="md:sr-only">Can add competencies</span>
                          </label>
                          {isContributor && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              since {format(new Date(c.granted_at), "MMM d, yyyy")}
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    <div className="flex justify-end">
                      {a && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-foreground"
                          aria-label={`Authorization history of ${u.name}`}
                          title="History"
                          onClick={() => {
                            setHistoryFor({ author: a, name: u.name });
                            setHistoryOpen(true);
                          }}
                        >
                          <History className="h-4 w-4" />
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
            {authorizeTarget
              ? `${roleLabel(authorizeTarget.type)}${authorizeTarget.school?.name ? `, ${authorizeTarget.school.name}` : ""}. `
              : ""}
            They will be able to write Division TOS and exams and submit them for QA review. You can
            revoke this at any time.
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
              <DialogTitle>Stop {revokeTarget?.name} writing Division TOS?</DialogTitle>
              <DialogDescription>
                {revokeTarget?.school?.name ? `${revokeTarget.school.name}. ` : ""}
                They will no longer write Division TOS and exams. Their drafts freeze; anything already
                approved stays published. Their competency access is not affected. You can authorize
                them again later.
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
