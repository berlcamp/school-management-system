/**
 * DepEd nutritional status — BMI-for-age and height-for-age, computed from the
 * learner's height, weight, sex and age.
 *
 * The bands stored in `sms_learner_health` (migration 111) are WHO z-score
 * bands, not BMI thresholds, so a status cannot be read off the BMI alone: it
 * moves with the learner's sex and age in months. The reference parameters live
 * in `lib/constants/whoGrowthReference.ts`; this module is the arithmetic and
 * the banding.
 *
 * Everything here only ever *suggests* a band. The entry screen fills the two
 * dropdowns and the encoder may overrule either — SF8 is signed on paper, so
 * what the school files is the value they stored, never a figure re-derived at
 * print time (the migration 121 `career_stage` rule).
 */

import {
  BMI_FOR_AGE_FEMALE,
  BMI_FOR_AGE_MALE,
  HEIGHT_FOR_AGE_FEMALE,
  HEIGHT_FOR_AGE_MALE,
  LMS_FIRST_MONTH,
  LMS_LAST_MONTH,
  type LmsRow,
} from "@/lib/constants/whoGrowthReference";

export type NutritionalStatus =
  | "severely_wasted"
  | "wasted"
  | "normal"
  | "overweight"
  | "obese";

export type HeightForAge =
  | "severely_stunted"
  | "stunted"
  | "normal"
  | "tall";

export const NUTRITIONAL_STATUS_OPTIONS: {
  value: NutritionalStatus;
  label: string;
}[] = [
  { value: "severely_wasted", label: "Severely Wasted" },
  { value: "wasted", label: "Wasted" },
  { value: "normal", label: "Normal" },
  { value: "overweight", label: "Overweight" },
  { value: "obese", label: "Obese" },
];

export const HEIGHT_FOR_AGE_OPTIONS: { value: HeightForAge; label: string }[] = [
  { value: "severely_stunted", label: "Severely Stunted" },
  { value: "stunted", label: "Stunted" },
  { value: "normal", label: "Normal" },
  { value: "tall", label: "Tall" },
];

export function nutritionalStatusLabel(value: NutritionalStatus): string {
  return (
    NUTRITIONAL_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
  );
}

export function heightForAgeLabel(value: HeightForAge): string {
  return HEIGHT_FOR_AGE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/**
 * Completed months between two dates — 5 years and 11 months is 71, not 72.
 * This is the age DepEd weighs against: age as at the date of measurement.
 */
export function ageInMonths(
  dateOfBirth: string | null | undefined,
  measuredOn: string | null | undefined,
): number | null {
  const birth = parseDate(dateOfBirth);
  const measured = parseDate(measuredOn);
  if (!birth || !measured) return null;

  let months =
    (measured.getFullYear() - birth.getFullYear()) * 12 +
    (measured.getMonth() - birth.getMonth());
  // The month has not completed until the day-of-month comes round again.
  if (measured.getDate() < birth.getDate()) months -= 1;
  return months < 0 ? null : months;
}

/** kg / m². Null when either measurement is missing or not a usable figure. */
export function bodyMassIndex(
  heightCm: number | null | undefined,
  weightKg: number | null | undefined,
): number | null {
  if (!isPositive(heightCm) || !isPositive(weightKg)) return null;
  const metres = heightCm / 100;
  return weightKg / (metres * metres);
}

/**
 * WHO's LMS z-score (see WHO's "computation of centiles and z-scores"):
 *   z = ((X/M)^L − 1) / (L·S),  or  ln(X/M)/S when L is 0.
 *
 * Reconstructing WHO's own published cutoff columns through this agrees with
 * them to 0.0005 across all four tables, which is their printed rounding.
 */
export function zScore(row: LmsRow, value: number): number {
  const [l, m, s] = row;
  if (l === 0) return Math.log(value / m) / s;
  return (Math.pow(value / m, l) - 1) / (l * s);
}

/**
 * DepEd BMI-for-age bands. The boundary sits with the *upper* band — a learner
 * exactly on −2SD is Normal, not Wasted, which is how the printed chart reads.
 */
export function classifyBmiForAge(z: number): NutritionalStatus {
  if (z < -3) return "severely_wasted";
  if (z < -2) return "wasted";
  if (z <= 1) return "normal";
  if (z <= 2) return "overweight";
  return "obese";
}

/** DepEd height-for-age bands, on the same boundary rule. */
export function classifyHeightForAge(z: number): HeightForAge {
  if (z < -3) return "severely_stunted";
  if (z < -2) return "stunted";
  if (z <= 2) return "normal";
  return "tall";
}

/**
 * What a school learner's measurements can plausibly be. These are not clinical
 * limits — they are wide enough that no real learner is refused — but a figure
 * outside them is a typo, not a measurement, and banding it produces nonsense:
 * a height typed in metres yields a BMI in the hundreds of thousands and a
 * confident "Obese". Refusing to band is the honest answer, and it also puts
 * the bad figure in front of the person who can fix it.
 */
export const PLAUSIBLE_HEIGHT_CM = { min: 40, max: 250 } as const;
export const PLAUSIBLE_WEIGHT_KG = { min: 2, max: 300 } as const;

/** The complaint about a measurement, or null when it is usable. */
export function measurementProblem(
  heightCm: number | null | undefined,
  weightKg: number | null | undefined,
): string | null {
  if (isPositive(heightCm)) {
    // By far the most common bad entry: metres typed into a column of
    // centimetres. Naming it is more use than a range.
    if (heightCm < 3) {
      return `the height (${heightCm}) looks like metres, not centimetres`;
    }
    if (heightCm < PLAUSIBLE_HEIGHT_CM.min || heightCm > PLAUSIBLE_HEIGHT_CM.max) {
      return `the height (${heightCm} cm) is outside ${PLAUSIBLE_HEIGHT_CM.min}–${PLAUSIBLE_HEIGHT_CM.max} cm`;
    }
  }
  if (isPositive(weightKg)) {
    if (weightKg < PLAUSIBLE_WEIGHT_KG.min || weightKg > PLAUSIBLE_WEIGHT_KG.max) {
      return `the weight (${weightKg} kg) is outside ${PLAUSIBLE_WEIGHT_KG.min}–${PLAUSIBLE_WEIGHT_KG.max} kg`;
    }
  }
  return null;
}

export interface GrowthInputs {
  dateOfBirth: string | null | undefined;
  /** `sms_students.gender` — "male" | "female", read tolerantly. */
  gender: string | null | undefined;
  heightCm: number | null | undefined;
  weightKg: number | null | undefined;
  /** Date of weighing. Falls back to today when the row has none yet. */
  measuredOn?: string | null | undefined;
}

export interface GrowthAssessment {
  ageMonths: number | null;
  bmi: number | null;
  bmiForAge: { z: number; status: NutritionalStatus } | null;
  heightForAge: { z: number; status: HeightForAge } | null;
  /**
   * Why nothing could be worked out, in words the encoder can act on. Null when
   * at least one of the two indicators came back.
   */
  unavailable: string | null;
}

const EMPTY: GrowthAssessment = {
  ageMonths: null,
  bmi: null,
  bmiForAge: null,
  heightForAge: null,
  unavailable: null,
};

/**
 * The two indicators are worked out independently: height alone already gives
 * height-for-age, so a half-filled row is not held back waiting for the weight.
 */
export function assessGrowth(inputs: GrowthInputs): GrowthAssessment {
  const sex = normalizeSex(inputs.gender);
  const measuredOn = inputs.measuredOn || todayIso();
  const months = ageInMonths(inputs.dateOfBirth, measuredOn);
  const bmi = bodyMassIndex(inputs.heightCm, inputs.weightKg);

  if (!isPositive(inputs.heightCm) && !isPositive(inputs.weightKg)) {
    return { ...EMPTY, ageMonths: months, bmi };
  }

  // Checked before anything else is worked out: a figure that cannot be a
  // measurement must never reach the chart.
  const problem = measurementProblem(inputs.heightCm, inputs.weightKg);
  if (problem) {
    return { ...EMPTY, ageMonths: months, bmi, unavailable: problem };
  }
  if (!sex) {
    return {
      ...EMPTY,
      ageMonths: months,
      bmi,
      unavailable: "the learner's sex is not recorded",
    };
  }
  if (months === null) {
    return {
      ...EMPTY,
      bmi,
      unavailable: "the learner's date of birth is not recorded",
    };
  }
  if (months < LMS_FIRST_MONTH || months > LMS_LAST_MONTH) {
    return {
      ...EMPTY,
      ageMonths: months,
      bmi,
      unavailable: `the learner is ${formatAge(months)} old, outside the WHO reference (${
        LMS_FIRST_MONTH / 12
      }–${LMS_LAST_MONTH / 12} years)`,
    };
  }

  const index = months - LMS_FIRST_MONTH;
  const bmiRow = (sex === "male" ? BMI_FOR_AGE_MALE : BMI_FOR_AGE_FEMALE)[index];
  const heightRow = (sex === "male" ? HEIGHT_FOR_AGE_MALE : HEIGHT_FOR_AGE_FEMALE)[
    index
  ];

  let bmiForAge: GrowthAssessment["bmiForAge"] = null;
  if (bmi !== null && bmiRow) {
    const z = zScore(bmiRow, bmi);
    bmiForAge = { z, status: classifyBmiForAge(z) };
  }

  let heightForAge: GrowthAssessment["heightForAge"] = null;
  if (isPositive(inputs.heightCm) && heightRow) {
    const z = zScore(heightRow, inputs.heightCm);
    heightForAge = { z, status: classifyHeightForAge(z) };
  }

  return {
    ageMonths: months,
    bmi,
    bmiForAge,
    heightForAge,
    unavailable:
      bmiForAge || heightForAge
        ? null
        : "height and weight are both needed for a nutritional status",
  };
}

/** "11 y 3 m", for the age column and the out-of-range message. */
export function formatAge(months: number): string {
  return `${Math.floor(months / 12)} y ${months % 12} m`;
}

/** BMI as the school writes it down — one decimal. */
export function formatBmi(bmi: number | null): string {
  return bmi === null ? "" : bmi.toFixed(1);
}

/** A z-score reads with its sign: "−1.42", "+0.33". */
export function formatZ(z: number): string {
  return `${z < 0 ? "−" : "+"}${Math.abs(z).toFixed(2)}`;
}

function normalizeSex(gender: string | null | undefined): "male" | "female" | null {
  const g = gender?.trim().toLowerCase();
  if (!g) return null;
  if (g === "male" || g === "m" || g === "boy") return "male";
  if (g === "female" || g === "f" || g === "girl") return "female";
  return null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Dates arrive as "YYYY-MM-DD" (or a timestamp). Read the parts rather than
  // letting Date parse them, so a UTC timestamp cannot shift the day locally
  // and cost the learner a month of age.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isPositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
