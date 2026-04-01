"use client";

import { StarRatingDisplay } from "@/components/StarRating";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { printHTMLContent } from "@/lib/pdf/utils";
import { Evaluation, EvaluationQuestion, EvaluationResponse } from "@/types";
import { Loader2, Printer, Users } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface Props {
  isOpen: boolean;
  evaluation: Evaluation;
  onClose: () => void;
}

interface EvaluateeResult {
  evaluateeId: string;
  evaluateeName: string;
  totalRespondents: number;
  overallAverage: number;
  questionResults: {
    questionId: string;
    questionText: string;
    orderNumber: number;
    average: number;
    distribution: number[]; // [count of 1s, 2s, 3s, 4s, 5s]
  }[];
}

export const ResultsModal = ({ isOpen, evaluation, onClose }: Props) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<EvaluateeResult[]>([]);
  const [selectedEvaluatee, setSelectedEvaluatee] = useState<string>("all");

  useEffect(() => {
    if (!isOpen) return;

    const fetchResults = async () => {
      setLoading(true);
      try {
        // Fetch questions
        const { data: questions } = await supabase
          .from("sms_evaluation_questions")
          .select("*")
          .eq("evaluation_id", evaluation.id)
          .order("order_number");

        // Fetch responses
        const { data: responses } = await supabase
          .from("sms_evaluation_responses")
          .select("*")
          .eq("evaluation_id", evaluation.id);

        if (!questions || !responses || responses.length === 0) {
          setResults([]);
          setLoading(false);
          return;
        }

        // Get unique evaluatee IDs and fetch names
        const evaluateeIds = [
          ...new Set(responses.map((r: EvaluationResponse) => r.evaluatee_id)),
        ];
        const { data: users } = await supabase
          .from("sms_users")
          .select("id, name")
          .in("id", evaluateeIds);

        const userNames = new Map<string, string>();
        for (const u of users || []) {
          userNames.set(String(u.id), u.name || "Unknown");
        }

        // Group responses by evaluatee
        const byEvaluatee = new Map<string, EvaluationResponse[]>();
        for (const r of responses as EvaluationResponse[]) {
          const eid = String(r.evaluatee_id);
          if (!byEvaluatee.has(eid)) byEvaluatee.set(eid, []);
          byEvaluatee.get(eid)!.push(r);
        }

        const evaluateeResults: EvaluateeResult[] = [];

        for (const [evaluateeId, evalResponses] of byEvaluatee.entries()) {
          // Count unique respondents
          const respondentIds = new Set(
            evalResponses.map(
              (r) => `${r.respondent_type}-${r.respondent_id}`,
            ),
          );

          // Calculate per-question stats
          const questionResults = (questions as EvaluationQuestion[]).map(
            (q) => {
              const qResponses = evalResponses.filter(
                (r) => String(r.question_id) === String(q.id),
              );
              const distribution = [0, 0, 0, 0, 0];
              let sum = 0;
              for (const r of qResponses) {
                sum += r.rating;
                distribution[r.rating - 1]++;
              }
              return {
                questionId: q.id,
                questionText: q.question_text,
                orderNumber: q.order_number,
                average: qResponses.length > 0 ? sum / qResponses.length : 0,
                distribution,
              };
            },
          );

          const overallSum = questionResults.reduce(
            (s, q) => s + q.average,
            0,
          );
          const overallAverage =
            questionResults.length > 0
              ? overallSum / questionResults.length
              : 0;

          evaluateeResults.push({
            evaluateeId,
            evaluateeName:
              userNames.get(evaluateeId) || `User #${evaluateeId}`,
            totalRespondents: respondentIds.size,
            overallAverage,
            questionResults,
          });
        }

        evaluateeResults.sort((a, b) =>
          a.evaluateeName.localeCompare(b.evaluateeName),
        );
        setResults(evaluateeResults);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load results");
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [isOpen, evaluation.id]);

  const visibleResults =
    selectedEvaluatee === "all"
      ? results
      : results.filter((r) => r.evaluateeId === selectedEvaluatee);

  const handlePrint = () => {
    const typeLabel =
      evaluation.type === "student_to_teacher"
        ? "Student to Teacher"
        : "Teacher to Principal";

    const evaluateeSections = visibleResults
      .map(
        (result) => `
      <div style="margin-bottom: 24px; page-break-inside: avoid;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">${result.evaluateeName}</h3>
        <p style="font-size: 13px; color: #666; margin-bottom: 12px;">
          Respondents: ${result.totalRespondents} | Overall Average: ${result.overallAverage.toFixed(2)} / 5.00
        </p>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: #f8f9fa;">
              <th style="border: 1px solid #dee2e6; padding: 8px; text-align: left; width: 40px;">#</th>
              <th style="border: 1px solid #dee2e6; padding: 8px; text-align: left;">Question</th>
              <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; width: 80px;">Average</th>
              <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; width: 50px;">1</th>
              <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; width: 50px;">2</th>
              <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; width: 50px;">3</th>
              <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; width: 50px;">4</th>
              <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; width: 50px;">5</th>
            </tr>
          </thead>
          <tbody>
            ${result.questionResults
              .map(
                (q) => `
              <tr>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${q.orderNumber}</td>
                <td style="border: 1px solid #dee2e6; padding: 8px;">${q.questionText}</td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center; font-weight: 600;">${q.average.toFixed(2)}</td>
                ${q.distribution.map((d) => `<td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${d}</td>`).join("")}
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `,
      )
      .join("");

    const html = `
      <html>
      <head>
        <title>Evaluation Results - ${evaluation.title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #333; }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>
        <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">${evaluation.title}</h1>
        <p style="font-size: 14px; color: #666; margin-bottom: 4px;">${typeLabel} | School Year: ${evaluation.school_year}</p>
        <p style="font-size: 12px; color: #999; margin-bottom: 24px;">Note: Respondent identities are kept anonymous.</p>
        <hr style="border: none; border-top: 1px solid #dee2e6; margin-bottom: 24px;" />
        ${evaluateeSections}
      </body>
      </html>
    `;

    printHTMLContent(html);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Evaluation Results
          </DialogTitle>
          <DialogDescription>{evaluation.title}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-gray-900">
              No responses yet
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Results will appear here once respondents submit their evaluations.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <Select
                value={selectedEvaluatee}
                onValueChange={setSelectedEvaluatee}
              >
                <SelectTrigger className="w-64 h-9">
                  <SelectValue placeholder="All evaluatees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Evaluatees</SelectItem>
                  {results.map((r) => (
                    <SelectItem key={r.evaluateeId} value={r.evaluateeId}>
                      {r.evaluateeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-9"
              >
                <Printer className="h-4 w-4 mr-1.5" />
                Print
              </Button>
            </div>

            {visibleResults.map((result) => (
              <div
                key={result.evaluateeId}
                className="rounded-xl border bg-white p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      {result.evaluateeName}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {result.totalRespondents} respondent
                      {result.totalRespondents !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground mb-1">
                      Overall Average
                    </p>
                    <StarRatingDisplay value={result.overallAverage} size="md" />
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-10">
                          #
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                          Question
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-28">
                          Average
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-40">
                          Distribution
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.questionResults.map((q) => (
                        <tr key={q.questionId} className="border-b last:border-0">
                          <td className="px-3 py-2.5 text-gray-500">
                            {q.orderNumber}
                          </td>
                          <td className="px-3 py-2.5 text-gray-700">
                            {q.questionText}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <StarRatingDisplay value={q.average} />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-center gap-1.5">
                              {q.distribution.map((count, i) => (
                                <div
                                  key={i}
                                  className="flex flex-col items-center"
                                >
                                  <span className="text-[10px] text-gray-400">
                                    {i + 1}
                                  </span>
                                  <span className="text-xs font-medium text-gray-700 bg-gray-100 rounded px-1.5 py-0.5 min-w-[20px] text-center">
                                    {count}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
