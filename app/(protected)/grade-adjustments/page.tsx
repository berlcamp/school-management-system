"use client";

import { ModuleAccessDenied } from "@/components/ModuleAccessDenied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useDesignations } from "@/hooks/useDesignations";
import { canDecideAdjustmentsByRole } from "@/hooks/usePendingAdjustmentCount";
import {
  getAdjustmentReasonLabel,
  MAX_FINAL_GRADE,
  termOfSlot,
  type AdjustmentStatus,
} from "@/lib/constants/gradeAdjustments";
import { useAppSelector } from "@/lib/redux/hook";
import {
  decideAdjustment,
  fetchAdjustmentList,
  revokeAdjustment,
  type AdjustmentListRow,
} from "@/lib/utils/gradeAdjustments";
import { SEMESTER_LABELS } from "@/lib/utils/schoolYear";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

type Action = "approve" | "reject" | "revoke";

const STATUS: Record<
  AdjustmentStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Pending", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  withdrawn: { label: "Withdrawn", variant: "secondary" },
  revoked: { label: "Revoked", variant: "secondary" },
};

const ACTION_TEXT: Record<Action, { title: string; button: string; done: string }> = {
  approve: { title: "Approve additional points", button: "Approve", done: "Approved" },
  reject: { title: "Reject additional points", button: "Reject", done: "Rejected" },
  revoke: { title: "Revoke approved points", button: "Revoke", done: "Revoked" },
};

/** Which grade the points are on. */
function gradeLabelOf(r: AdjustmentListRow): string {
  const term = termOfSlot(r.semester);
  // Senior High may still be on semestral quarters; the list does not say.
  if (term !== null) return r.grade_level >= 11 ? `Term / Quarter ${term}` : `Term ${term}`;
  return r.semester === 1 || r.semester === 2
    ? `${SEMESTER_LABELS[r.semester]} Final`
    : "Final grade";
}

const day = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : "";

export default function GradeAdjustmentsPage() {
  const user = useAppSelector((state) => state.user.user);
  const { loading: designationsLoading, has } = useDesignations();
  const allowed =
    canDecideAdjustmentsByRole(user?.type) || has("department_head");
  const schoolId = user?.school_id ?? null;

  const [pending, setPending] = useState<AdjustmentListRow[]>([]);
  const [history, setHistory] = useState<AdjustmentListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<{ row: AdjustmentListRow; action: Action } | null>(null);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  // Only the latest read may land: a slow one from the previous school is dropped.
  const readId = useRef(0);

  const load = useCallback(async () => {
    if (!schoolId || !allowed) {
      setLoading(false);
      return;
    }
    const id = ++readId.current;
    setLoading(true);
    try {
      const [p, h] = await Promise.all([
        fetchAdjustmentList(schoolId, true),
        fetchAdjustmentList(schoolId, false),
      ]);
      if (id !== readId.current) return;
      setPending(p);
      setHistory(h);
    } catch (error) {
      console.error("Grade adjustments:", error);
      if (id === readId.current) toast.error("Failed to load grade adjustments");
    } finally {
      if (id === readId.current) setLoading(false);
    }
  }, [schoolId, allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (row: AdjustmentListRow, action: Action) => {
    setRemarks("");
    setTarget({ row, action });
  };

  const submit = async () => {
    if (!target || busy) return;
    const { row, action } = target;
    setBusy(true);
    try {
      if (action === "revoke") await revokeAdjustment(row.id, remarks);
      else await decideAdjustment(row.id, action === "approve", remarks);
      toast.success(ACTION_TEXT[action].done);
      setTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
      await load();
    }
  };

  if (!designationsLoading && !allowed) return <ModuleAccessDenied />;

  const remarksRequired = target !== null && target.action !== "approve";

  const table = (rows: AdjustmentListRow[], isPending: boolean) => (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Learner</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead className="text-center">Grade</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Requested by</TableHead>
            {!isPending && <TableHead>Decision</TableHead>}
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const base = isPending ? r.current_final : r.base_final;
            const own = Number(r.requested_by) === Number(user?.system_user_id);
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.student_name}
                  <div className="text-xs text-muted-foreground">
                    Grade {r.grade_level} – {r.section_name}
                  </div>
                </TableCell>
                <TableCell>
                  {r.subject_name}
                  <div className="text-xs text-muted-foreground">
                    SY {r.school_year} · {gradeLabelOf(r)}
                  </div>
                </TableCell>
                <TableCell className="text-center whitespace-nowrap tabular-nums">
                  {base === null ? (
                    <span className="text-xs text-amber-600">{termOfSlot(r.semester) !== null ? "Not posted" : "Not complete"}</span>
                  ) : (
                    <>
                      {base} + {r.points} ={" "}
                      <span className="font-semibold">
                        {Math.min(MAX_FINAL_GRADE, base + r.points)}
                      </span>
                    </>
                  )}
                </TableCell>
                <TableCell className="max-w-64 whitespace-normal">
                  {getAdjustmentReasonLabel(r.reason)}
                  {r.note && (
                    <div className="text-xs text-muted-foreground">{r.note}</div>
                  )}
                </TableCell>
                <TableCell>
                  {r.requester_name ?? "—"}
                  <div className="text-xs text-muted-foreground">
                    {day(r.requested_at)}
                  </div>
                </TableCell>
                {!isPending && (
                  <TableCell className="max-w-64 whitespace-normal">
                    <Badge variant={STATUS[r.status].variant}>
                      {STATUS[r.status].label}
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      {r.status === "revoked"
                        ? `${r.revoker_name ?? ""} ${day(r.revoked_at)}`
                        : `${r.decider_name ?? ""} ${day(r.decided_at)}`}
                    </div>
                    {(r.revoke_remarks ?? r.decision_remarks) && (
                      <div className="text-xs">
                        {r.revoke_remarks ?? r.decision_remarks}
                      </div>
                    )}
                  </TableCell>
                )}
                <TableCell className="text-right whitespace-nowrap">
                  {own ? (
                    <span className="text-xs text-muted-foreground">Your request</span>
                  ) : isPending ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => open(r, "reject")}>
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={base === null}
                        onClick={() => open(r, "approve")}
                      >
                        Approve
                      </Button>
                    </div>
                  ) : r.status === "approved" ? (
                    <Button size="sm" variant="outline" onClick={() => open(r, "revoke")}>
                      Revoke
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={isPending ? 6 : 7}
                className="py-8 text-center text-muted-foreground"
              >
                {isPending ? "Nothing is waiting for approval." : "No decisions yet."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Grade Adjustments
        </h1>
      </div>
      <div className="app__content">
        <p className="mb-4 text-sm text-muted-foreground">
          Additional points teachers have asked for on term and final grades. Points count
          on the report card, SF9 and other forms only once approved.
        </p>
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <TabsContent value="pending">{table(pending, true)}</TabsContent>
              <TabsContent value="history">{table(history, false)}</TabsContent>
            </>
          )}
        </Tabs>
      </div>

      <Dialog
        open={target !== null}
        onOpenChange={(isOpen) => !isOpen && !busy && setTarget(null)}
      >
        {target && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{ACTION_TEXT[target.action].title}</DialogTitle>
              <DialogDescription>
                {target.row.student_name} — {target.row.subject_name},{" "}
                {gradeLabelOf(target.row)}, +
                {target.row.points}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="decision-remarks">
                Remarks{remarksRequired ? "" : " (optional)"}
              </Label>
              <Textarea
                id="decision-remarks"
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => setTarget(null)}>
                Cancel
              </Button>
              <Button
                variant={target.action === "approve" ? "default" : "destructive"}
                disabled={busy || (remarksRequired && remarks.trim() === "")}
                onClick={submit}
              >
                {ACTION_TEXT[target.action].button}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
