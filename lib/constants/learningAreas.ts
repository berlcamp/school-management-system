// DepEd K-12 learning areas (teaching specializations)
export interface LearningArea {
  code: string;
  label: string;
}

export const LEARNING_AREAS: LearningArea[] = [
  { code: "filipino", label: "Filipino" },
  { code: "english", label: "English" },
  { code: "math", label: "Mathematics" },
  { code: "science", label: "Science" },
  { code: "ap", label: "Araling Panlipunan" },
  { code: "esp", label: "Edukasyon sa Pagpapakatao" },
  { code: "mapeh", label: "MAPEH" },
  { code: "tle", label: "TLE / EPP" },
  { code: "mt", label: "Mother Tongue" },
  { code: "kinder", label: "Kindergarten" },
  { code: "other", label: "Other" },
];

export const getLearningAreaLabel = (code: string): string =>
  LEARNING_AREAS.find((a) => a.code === code)?.label ?? code;
