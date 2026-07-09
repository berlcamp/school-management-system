import { PABASA_LEVELS } from "@/lib/constants";
import { Student } from "@/types";

/** Per-learner PABASA entry for the active language + phase. */
export interface PabasaEntry {
  reading_level: string | null; // Average | Fast | Spontaneous | null
  remarks: string | null;
}

// studentId -> entry
export type PabasaEntryMap = Record<string, PabasaEntry>;

/** Split a roster into male / female groups, each sorted by last then first name. */
export function groupByGender(
  students: Student[],
  ascending = true,
): { male: Student[]; female: Student[] } {
  const byName = (a: Student, b: Student) => {
    const an = `${a.last_name} ${a.first_name}`.toLowerCase();
    const bn = `${b.last_name} ${b.first_name}`.toLowerCase();
    const cmp = an.localeCompare(bn);
    return ascending ? cmp : -cmp;
  };
  return {
    male: students.filter((s) => s.gender === "male").sort(byName),
    female: students.filter((s) => s.gender === "female").sort(byName),
  };
}

export interface PabasaSummaryColumn {
  enrolment: number;
  assessed: number;
  average: number;
  fast: number;
  spontaneous: number;
}

export interface PabasaSummary {
  male: PabasaSummaryColumn;
  female: PabasaSummaryColumn;
  total: PabasaSummaryColumn;
}

const emptyColumn = (): PabasaSummaryColumn => ({
  enrolment: 0,
  assessed: 0,
  average: 0,
  fast: 0,
  spontaneous: 0,
});

/** Live reading-readiness summary for the active language/phase (Male / Female / Total). */
export function summaryByGender(
  students: Student[],
  entries: PabasaEntryMap,
): PabasaSummary {
  const male = emptyColumn();
  const female = emptyColumn();

  students.forEach((s) => {
    const col = s.gender === "female" ? female : male;
    col.enrolment += 1;
    const level = entries[s.id]?.reading_level ?? null;
    if (!level || !PABASA_LEVELS.includes(level as (typeof PABASA_LEVELS)[number]))
      return;
    col.assessed += 1;
    if (level === "Average") col.average += 1;
    else if (level === "Fast") col.fast += 1;
    else if (level === "Spontaneous") col.spontaneous += 1;
  });

  const total: PabasaSummaryColumn = {
    enrolment: male.enrolment + female.enrolment,
    assessed: male.assessed + female.assessed,
    average: male.average + female.average,
    fast: male.fast + female.fast,
    spontaneous: male.spontaneous + female.spontaneous,
  };

  return { male, female, total };
}
