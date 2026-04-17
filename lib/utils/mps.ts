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
