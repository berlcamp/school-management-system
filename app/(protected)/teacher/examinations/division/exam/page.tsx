"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { ExamBuilderModal } from "@/components/examinations/ExamBuilderModal";
import { ExamList } from "@/components/examinations/ExamList";
import { DivisionReviewActions } from "@/components/examinations/review/DivisionReviewActions";
import { Button } from "@/components/ui/button";
import { useDivisionAuthorStatus } from "@/hooks/useDivisionAuthorStatus";
import { QA_UNAUTHORIZED_MESSAGE } from "@/lib/constants/examReview";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * The teacher's Division Exams (194): their own division rows in every status,
 * plus every approved division exam. Creating one requires QA authorization,
 * which the database also enforces.
 */
function DivisionExamPage() {
  const dispatch = useAppDispatch();
  const createFromTos = useSearchParams().get("createFromTos");
  const list = useAppSelector((state) => state.list.value);
  const user = useAppSelector((state) => state.user.user);
  const userId = user?.system_user_id ?? null;
  const { loading: authLoading, isAuthorized } = useDivisionAuthorStatus();
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Arriving from an approved Division TOS opens the builder preselected.
  useEffect(() => {
    if (createFromTos && isAuthorized) setModalOpen(true);
  }, [createFromTos, isAuthorized]);

  useEffect(() => {
    let isMounted = true;
    dispatch(addList([]));
    (async () => {
      if (userId == null) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("sms_exams")
        .select("*, tos:tos_id!inner(subject_name, grade_level, exam_type, grading_period, school_year, title)")
        .is("school_id", null)
        .or(`review_status.eq.approved,created_by.eq.${userId}`)
        .order("created_at", { ascending: false });
      if (!isMounted) return;
      if (error) console.error(error);
      dispatch(addList(data ?? []));
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [dispatch, userId, refreshKey, modalOpen]);

  return (
    <div>
      <div className="app__title">
        <Link
          href="/teacher/examinations"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Examinations
        </Link>
        <h1 className="app__title_text flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Division Exams
        </h1>
        <div className="app__title_actions">
          {isAuthorized && (
            <Button variant="green" size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Create Division Exam
            </Button>
          )}
        </div>
      </div>
      <div className="app__content space-y-4">
        {!authLoading && !isAuthorized && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {QA_UNAUTHORIZED_MESSAGE}
          </div>
        )}
        {loading ? (
          <TableSkeleton />
        ) : list.length === 0 ? (
          <div className="app__empty_state">
            <p className="app__empty_state_title">No Division Exams yet</p>
          </div>
        ) : (
          <ExamList
            mode="division"
            userId={userId}
            schoolId={null}
            isAuthorizedAuthor={isAuthorized}
            workspaceBase="/teacher/examinations/exam"
            renderReviewActions={(item) => (
              <DivisionReviewActions
                entity="exam"
                row={item}
                userId={userId}
                isAuthorizedAuthor={isAuthorized}
                onChanged={() => setRefreshKey((k) => k + 1)}
              />
            )}
          />
        )}
        <ExamBuilderModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          mode="division"
          schoolId={null}
          userId={userId}
          initialTosId={createFromTos}
        />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <DivisionExamPage />
    </Suspense>
  );
}
