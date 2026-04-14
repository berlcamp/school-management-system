"use client";

import { StarRating } from "@/components/StarRating";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { Evaluation, EvaluationQuestion } from "@/types";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  UserCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface EvaluationWithQuestions extends Evaluation {
  questions: EvaluationQuestion[];
  isSubmitted: boolean;
}

export default function TeacherEvaluationsPage() {
  const user = useAppSelector((state) => state.user.user);
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<EvaluationWithQuestions[]>([]);
  const [principalName, setPrincipalName] = useState<string>("");
  const [principalId, setPrincipalId] = useState<string>("");

  // Form state
  const [selectedEvaluation, setSelectedEvaluation] =
    useState<EvaluationWithQuestions | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const schoolYear = getCurrentSchoolYear();

  const fetchData = useCallback(async () => {
    if (!user?.school_id) return;

    setLoading(true);
    try {
      // Fetch active teacher_to_principal evaluations
      const { data: evals } = await supabase
        .from("sms_evaluations")
        .select("*")
        .eq("school_id", user.school_id)
        .eq("type", "teacher_to_principal")
        .eq("is_active", true)
        .eq("school_year", schoolYear);

      if (!evals || evals.length === 0) {
        setEvaluations([]);
        setLoading(false);
        return;
      }

      // Find the principal (school_head user)
      const { data: principals } = await supabase
        .from("sms_users")
        .select("id, name")
        .eq("school_id", user.school_id)
        .in("type", ["school_head", "super admin"])
        .eq("is_active", true)
        .limit(1);

      if (principals && principals.length > 0) {
        setPrincipalName(principals[0].name || "Principal");
        setPrincipalId(String(principals[0].id));
      }

      // Fetch questions and submission status for each evaluation
      const enriched: EvaluationWithQuestions[] = [];

      for (const ev of evals as Evaluation[]) {
        const { data: questions } = await supabase
          .from("sms_evaluation_questions")
          .select("*")
          .eq("evaluation_id", ev.id)
          .order("order_number");

        // Check if current user already submitted
        const { count } = await supabase
          .from("sms_evaluation_responses")
          .select("*", { count: "exact", head: true })
          .eq("evaluation_id", ev.id)
          .eq("respondent_type", "teacher")
          .eq("respondent_id", user.system_user_id);

        enriched.push({
          ...ev,
          questions: (questions || []) as EvaluationQuestion[],
          isSubmitted: (count ?? 0) > 0,
        });
      }

      setEvaluations(enriched);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load evaluations");
    } finally {
      setLoading(false);
    }
  }, [user?.school_id, user?.id, schoolYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStartEvaluation = (ev: EvaluationWithQuestions) => {
    setSelectedEvaluation(ev);
    setRatings({});
    setRemarks("");
  };

  const handleSubmit = async () => {
    if (!selectedEvaluation || !user || !principalId) return;

    // Check all questions are rated
    const unanswered = selectedEvaluation.questions.filter(
      (q) => !ratings[q.id],
    );
    if (unanswered.length > 0) {
      toast.error("Please rate all questions before submitting");
      return;
    }

    setSubmitting(true);
    try {
      const responses = selectedEvaluation.questions.map((q, index) => ({
        evaluation_id: selectedEvaluation.id,
        question_id: q.id,
        respondent_type: "teacher" as const,
        respondent_id: user.system_user_id,
        evaluatee_id: principalId,
        rating: ratings[q.id],
        school_year: schoolYear,
        school_id: user.school_id,
        // Store remarks only on the first row to avoid repetition
        ...(index === 0 && remarks.trim() ? { remarks: remarks.trim() } : {}),
      }));

      const { error } = await supabase
        .from("sms_evaluation_responses")
        .insert(responses);

      if (error) {
        if (error.code === "23505") {
          toast.error("You have already submitted this evaluation");
        } else {
          throw error;
        }
      } else {
        toast.success("Evaluation submitted successfully!");
        setSelectedEvaluation(null);
        setRatings({});
        setRemarks("");
        // Mark as submitted locally
        setEvaluations((prev) =>
          prev.map((ev) =>
            ev.id === selectedEvaluation.id
              ? { ...ev, isSubmitted: true }
              : ev,
          ),
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit evaluation");
    } finally {
      setSubmitting(false);
    }
  };

  const allRated =
    selectedEvaluation?.questions.every((q) => ratings[q.id]) ?? false;

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Evaluations
        </h1>
      </div>
      <div className="app__content">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : evaluations.length === 0 ? (
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground" />
            </div>
            <p className="app__empty_state_title">No evaluations available</p>
            <p className="app__empty_state_description">
              There are no active evaluations for {schoolYear}.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {evaluations.map((ev) => (
              <div
                key={ev.id}
                className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-gray-900">
                      {ev.title}
                    </h3>
                    {ev.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {ev.description}
                      </p>
                    )}
                  </div>
                  {ev.isSubmitted && (
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  )}
                </div>

                <div className="flex items-center gap-2 mb-4 text-sm text-gray-600">
                  <UserCircle className="h-4 w-4" />
                  <span>
                    Evaluate: <strong>{principalName || "Principal"}</strong>
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {ev.questions.length} question
                    {ev.questions.length !== 1 ? "s" : ""} | {ev.school_year}
                  </span>
                  {ev.isSubmitted ? (
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800">
                      Completed
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleStartEvaluation(ev)}
                      disabled={!principalId}
                    >
                      Start Evaluation
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Evaluation Form Dialog */}
        <Dialog
          open={!!selectedEvaluation}
          onOpenChange={() => {
            if (!submitting) {
              setSelectedEvaluation(null);
              setRatings({});
              setRemarks("");
            }
          }}
        >
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                {selectedEvaluation?.title}
              </DialogTitle>
              <DialogDescription>
                Evaluating: {principalName}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {selectedEvaluation?.questions.map((q, index) => (
                <div
                  key={q.id}
                  className="rounded-lg border p-4 space-y-2"
                >
                  <p className="text-sm font-medium text-gray-800">
                    <span className="text-muted-foreground mr-1.5">
                      {index + 1}.
                    </span>
                    {q.question_text}
                  </p>
                  <StarRating
                    value={ratings[q.id] || 0}
                    onChange={(val) =>
                      setRatings((prev) => ({ ...prev, [q.id]: val }))
                    }
                    size="lg"
                  />
                </div>
              ))}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Remarks <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Textarea
                  placeholder="Add any additional comments or feedback..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  disabled={submitting}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2 space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSelectedEvaluation(null);
                  setRatings({});
                  setRemarks("");
                }}
                disabled={submitting}
                className="h-10"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !allRated}
                className="h-10 min-w-[140px]"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Submitting...
                  </span>
                ) : (
                  "Submit Evaluation"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
