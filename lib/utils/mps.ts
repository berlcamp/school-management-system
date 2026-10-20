import { computeMps } from "@/lib/utils/itemAnalysis";
import type { LearnerSexKey } from "@/lib/utils/learnerSex";

export type MasteryBand = "mastered" | "closely" | "moving" | "average" | "low";

export interface MasteryLevel {
  band: MasteryBand;
  label: string;
  colorClass: string;
}

export function getMasteryLevel(mps: number): MasteryLevel {
  if (mps >= 90) {
    return {
      band: "mastered",
      label: "Mastered",
      colorClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
    };
  }
  if (mps >= 85) {
    return {
      band: "closely",
      label: "Closely Approximating Mastery",
      colorClass: "bg-green-100 text-green-800 border-green-300",
    };
  }
  if (mps >= 80) {
    return {
      band: "moving",
      label: "Moving Towards Mastery",
      colorClass: "bg-yellow-100 text-yellow-800 border-yellow-300",
    };
  }
  if (mps >= 75) {
    return {
      band: "average",
      label: "Average Mastery",
      colorClass: "bg-orange-100 text-orange-800 border-orange-300",
    };
  }
  return {
    band: "low",
    label: "Low Mastery",
    colorClass: "bg-red-100 text-red-800 border-red-300",
  };
}

export function getMasteryBarColor(mps: number): string {
  if (mps >= 90) return "bg-emerald-500";
  if (mps >= 85) return "bg-green-500";
  if (mps >= 80) return "bg-yellow-500";
  if (mps >= 75) return "bg-orange-500";
  return "bg-red-500";
}

/**
 * Male and female MPS of one exam administration, computed the way the stored
 * class MPS is (`computeMps`: mean score ÷ items). A learner with no recorded
 * sex counts toward the class MPS but toward neither half; a half with no
 * learners is null, not 0, so it reads as "—" rather than as Low Mastery.
 */
export function mpsBySex(
  learners: ReadonlyArray<{ sex: LearnerSexKey; score: number }>,
  totalItems: number,
): { male: number | null; female: number | null } {
  const half = (sex: LearnerSexKey) => {
    const scores = learners.filter((l) => l.sex === sex).map((l) => l.score);
    return scores.length > 0 && totalItems > 0
      ? computeMps(scores, totalItems)
      : null;
  };
  return { male: half("male"), female: half("female") };
}
