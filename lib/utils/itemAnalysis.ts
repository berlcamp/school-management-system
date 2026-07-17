/**
 * Item-analysis computations for the Examinations module.
 *
 * Given each learner's set of correctly-answered item numbers and the list of
 * auto-scorable item numbers on the exam, compute:
 *   - each learner's score and the class Mean Percentage Score (MPS)
 *   - per-item difficulty index (p) and discrimination index (D)
 *   - a retain / revise / reject verdict per item
 */

export interface AnalysisStudent {
  studentId: string;
  correctItems: Set<number>;
}

export interface ItemStat {
  itemNumber: number;
  correct: number;
  total: number;
  difficulty: number; // p = correct / total (0..1)
  difficultyLabel: string;
  discrimination: number; // D (-1..1)
  discriminationLabel: string;
  verdict: "Retain" | "Revise" | "Reject";
}

/** Score = number of the exam's item numbers the learner got correct. */
export function studentScore(
  correctItems: Set<number>,
  itemNumbers: number[],
): number {
  let n = 0;
  for (const item of itemNumbers) if (correctItems.has(item)) n += 1;
  return n;
}

/** Mean Percentage Score = mean(score) / totalItems * 100. */
export function computeMps(scores: number[], totalItems: number): number {
  if (scores.length === 0 || totalItems <= 0) return 0;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  return Math.round((mean / totalItems) * 100 * 100) / 100;
}

export function difficultyLabel(p: number): string {
  if (p >= 0.76) return "Easy";
  if (p >= 0.25) return "Moderate";
  return "Difficult";
}

export function discriminationLabel(d: number): string {
  if (d >= 0.4) return "Very Good";
  if (d >= 0.3) return "Good";
  if (d >= 0.2) return "Fair";
  if (d >= 0) return "Poor";
  return "Negative";
}

function verdict(p: number, d: number): ItemStat["verdict"] {
  if (d < 0) return "Reject";
  if (d < 0.2) return "Revise";
  if (p < 0.25 || p > 0.75) return "Revise";
  return "Retain";
}

/**
 * Per-item statistics. Discrimination uses the upper/lower 27% groups by total
 * score (at least one learner each). Returns one row per item number, in order.
 */
export function computeItemStats(
  students: AnalysisStudent[],
  itemNumbers: number[],
): ItemStat[] {
  const total = students.length;
  if (total === 0) {
    return itemNumbers.map((itemNumber) => ({
      itemNumber,
      correct: 0,
      total: 0,
      difficulty: 0,
      difficultyLabel: difficultyLabel(0),
      discrimination: 0,
      discriminationLabel: discriminationLabel(0),
      verdict: verdict(0, 0),
    }));
  }

  const scored = students
    .map((s) => ({
      s,
      score: studentScore(s.correctItems, itemNumbers),
    }))
    .sort((a, b) => b.score - a.score);

  const groupSize = Math.max(1, Math.round(total * 0.27));
  const upper = scored.slice(0, groupSize).map((x) => x.s);
  const lower = scored.slice(-groupSize).map((x) => x.s);

  const countCorrect = (group: AnalysisStudent[], item: number) =>
    group.reduce((n, st) => n + (st.correctItems.has(item) ? 1 : 0), 0);

  return itemNumbers.map((itemNumber) => {
    const correct = countCorrect(students, itemNumber);
    const p = correct / total;
    const cu = countCorrect(upper, itemNumber);
    const cl = countCorrect(lower, itemNumber);
    const d = (cu - cl) / groupSize;
    return {
      itemNumber,
      correct,
      total,
      difficulty: Math.round(p * 100) / 100,
      difficultyLabel: difficultyLabel(p),
      discrimination: Math.round(d * 100) / 100,
      discriminationLabel: discriminationLabel(d),
      verdict: verdict(p, d),
    };
  });
}

export interface CompetencyInput {
  competencyId: string;
  competencyText: string;
  lcCode?: string | null;
  itemNumbers: number[];
}

export interface CompetencyStat {
  competencyId: string;
  competencyText: string;
  lcCode: string | null;
  itemCount: number;
  correct: number;
  total: number; // itemCount * studentCount
  mps: number; // mean percentage score for the competency (0..100)
}

/**
 * Per-competency statistics: pooling every auto-scorable item mapped to a
 * competency, the MPS is (correct answers) / (items × learners) × 100. Feed the
 * MPS to getMasteryLevel() for a mastery band. Returns one row per competency,
 * in the given order.
 */
export function computeCompetencyStats(
  students: AnalysisStudent[],
  competencies: CompetencyInput[],
): CompetencyStat[] {
  const studentCount = students.length;
  return competencies.map((c) => {
    const itemCount = c.itemNumbers.length;
    const total = itemCount * studentCount;
    let correct = 0;
    for (const st of students) {
      for (const item of c.itemNumbers) {
        if (st.correctItems.has(item)) correct += 1;
      }
    }
    const mps = total > 0 ? Math.round((correct / total) * 100 * 100) / 100 : 0;
    return {
      competencyId: c.competencyId,
      competencyText: c.competencyText,
      lcCode: c.lcCode ?? null,
      itemCount,
      correct,
      total,
      mps,
    };
  });
}

/**
 * Least Learned Competencies (LLC): the competency rows with the lowest MPS.
 * Ties are all returned. Returns [] when there are no competency stats. Useful
 * for the DepEd item-analysis callout that flags what learners struggled with
 * most and warrants re-teaching / intervention.
 */
export function leastLearnedCompetencies(
  competencyStats: CompetencyStat[],
): CompetencyStat[] {
  if (competencyStats.length === 0) return [];
  const minMps = Math.min(...competencyStats.map((c) => c.mps));
  return competencyStats.filter((c) => c.mps === minMps);
}

export interface AnalysisSummary {
  studentCount: number;
  totalItems: number;
  mps: number;
  highest: number;
  lowest: number;
  meanScore: number;
  retain: number;
  revise: number;
  reject: number;
}

export function summarize(
  scores: number[],
  totalItems: number,
  itemStats: ItemStat[],
): AnalysisSummary {
  const studentCount = scores.length;
  const meanScore =
    studentCount > 0 ? scores.reduce((s, v) => s + v, 0) / studentCount : 0;
  return {
    studentCount,
    totalItems,
    mps: computeMps(scores, totalItems),
    highest: studentCount > 0 ? Math.max(...scores) : 0,
    lowest: studentCount > 0 ? Math.min(...scores) : 0,
    meanScore: Math.round(meanScore * 100) / 100,
    retain: itemStats.filter((i) => i.verdict === "Retain").length,
    revise: itemStats.filter((i) => i.verdict === "Revise").length,
    reject: itemStats.filter((i) => i.verdict === "Reject").length,
  };
}
