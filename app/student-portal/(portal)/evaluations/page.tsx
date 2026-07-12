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
import { useStudentSession } from "@/lib/student-portal/context";
import {
  EvaluateeInfo,
  EvaluationWithQuestions,
  getActiveStudentEvaluations,
  getStudentSubmittedEvaluations,
  submitStudentEvaluation,
} from "@/lib/student-portal/actions";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  UserCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function StudentEvaluationsPage() {
  const { session } = useStudentSession();

  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<EvaluationWithQuestions[]>([]);
  const [submitted, setSubmitted] = useState<Record<string, Set<string>>>({});

  // Form state
  const [selectedEvaluation, setSelectedEvaluation] =
    useState<EvaluationWithQuestions | null>(null);
  const [selectedEvaluatee, setSelectedEvaluatee] =
    useState<EvaluateeInfo | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!session?.studentId) return;

    setLoading(true);
    try {
      const evalsData = await getActiveStudentEvaluations(session.studentId);

      setEvaluations(evalsData);

      // Fetch submitted evaluations per evaluation
      const submittedMap: Record<string, Set<string>> = {};
      for (const ev of evalsData) {
        const evaluateeIds = await getStudentSubmittedEvaluations(
          session.studentId,
          ev.id,
        );
        submittedMap[ev.id] = new Set(evaluateeIds);
      }
      setSubmitted(submittedMap);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load evaluations");
    } finally {
      setLoading(false);
    }
  }, [session?.studentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStartEvaluation = (
    ev: EvaluationWithQuestions,
    evaluatee: EvaluateeInfo,
  ) => {
    setSelectedEvaluation(ev);
    setSelectedEvaluatee(evaluatee);
    setRatings({});
    setRemarks("");
  };

  const handleSubmit = async () => {
    if (!selectedEvaluation || !selectedEvaluatee || !session?.studentId) return;

    const unanswered = selectedEvaluation.questions.filter(
      (q) => !ratings[q.id],
    );
    if (unanswered.length > 0) {
      toast.error("Please rate all questions before submitting");
      return;
    }

    setSubmitting(true);
    try {
      const ratingsArray = selectedEvaluation.questions.map((q) => ({
        questionId: q.id,
        rating: ratings[q.id],
      }));

      const result = await submitStudentEvaluation(
        session.studentId,
        selectedEvaluation.id,
        selectedEvaluatee.id,
        ratingsArray,
        remarks.trim() || undefined,
      );

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Evaluation submitted successfully!");
        // Update submitted state locally
        setSubmitted((prev) => {
          const evalSet = new Set(prev[selectedEvaluation.id] || []);
          evalSet.add(selectedEvaluatee.id);
          return { ...prev, [selectedEvaluation.id]: evalSet };
        });
        setSelectedEvaluation(null);
        setSelectedEvaluatee(null);
        setRatings({});
        setRemarks("");
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (evaluations.length === 0) {
    return (
      <div
        className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8 text-center animate-fade-up"
        style={{ animationDelay: "0.1s" }}
      >
        <ClipboardCheck className="h-12 w-12 mx-auto text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          No evaluations available
        </h2>
        <p className="text-sm text-gray-500">
          There are no active evaluations at this time. Check back later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 rounded-xl bg-violet-50">
          <ClipboardCheck className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Evaluations</h2>
          <p className="text-sm text-gray-500">
            Rate your teachers and school head for the current school year
          </p>
        </div>
      </div>

      {evaluations.map((ev) => (
        <div
          key={ev.id}
          className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/50">
            <h3 className="text-base font-semibold text-gray-900">
              {ev.title}
            </h3>
            {ev.description && (
              <p className="text-sm text-gray-500 mt-0.5">{ev.description}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              {ev.questions.length} question{ev.questions.length !== 1 ? "s" : ""}{" "}
              | {ev.school_year}
            </p>
          </div>

          <div className="divide-y divide-gray-50">
            {ev.evaluatees.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-gray-500">
                  {ev.type === "student_to_principal"
                    ? "No school head assigned for this evaluation."
                    : "No teachers found for your current enrollment."}
                </p>
              </div>
            ) : (
              ev.evaluatees.map((evaluatee) => {
                const isSubmitted =
                  submitted[ev.id]?.has(evaluatee.id) ?? false;

                return (
                  <div
                    key={evaluatee.id}
                    className="flex items-center justify-between px-6 py-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-gray-100">
                        <UserCircle className="h-4 w-4 text-gray-500" />
                      </div>
                      <span className="text-sm font-medium text-gray-800">
                        {evaluatee.name}
                      </span>
                    </div>
                    {isSubmitted ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-green-50 text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Completed
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStartEvaluation(ev, evaluatee)}
                        className="h-8 text-xs"
                      >
                        Evaluate
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}

      {/* Evaluation Form Dialog */}
      <Dialog
        open={!!selectedEvaluation && !!selectedEvaluatee}
        onOpenChange={() => {
          if (!submitting) {
            setSelectedEvaluation(null);
            setSelectedEvaluatee(null);
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
              Evaluating: {selectedEvaluatee?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {selectedEvaluation?.questions.map((q, index) => (
              <div key={q.id} className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium text-gray-800">
                  <span className="text-gray-400 mr-1.5">{index + 1}.</span>
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
                Remarks <span className="text-gray-400 font-normal">(optional)</span>
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
                setSelectedEvaluatee(null);
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
              className="h-10 min-w-[140px] bg-slate-900 hover:bg-slate-800"
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
  );
}
