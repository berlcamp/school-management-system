"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PHILIRI_COMPREHENSION_QUESTIONS,
  PHILIRI_MISCUE_TYPES,
} from "@/lib/constants";
import { PhilIriMaterial } from "@/types";
import { computeIndividual, PhilIriIndividual } from "../philiriUtils";

export interface PassageFormValue {
  minutes: number | null;
  seconds: number | null;
  comprehensionRaw: number | null;
  answers: Record<string, string>;
  miscues: Record<string, number | null>;
  dateAssessed: string;
  remarks: string;
}

export const emptyMiscues = (): Record<string, number | null> =>
  Object.fromEntries(PHILIRI_MISCUE_TYPES.map((m) => [m.key, null]));

export const emptyAnswers = (): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: PHILIRI_COMPREHENSION_QUESTIONS }, (_, i) => [
      `q${i + 1}`,
      "",
    ]),
  );

export const emptyPassageValue = (): PassageFormValue => ({
  minutes: null,
  seconds: null,
  comprehensionRaw: null,
  answers: emptyAnswers(),
  miscues: emptyMiscues(),
  dateAssessed: "",
  remarks: "",
});

export function totalSecondsOf(v: PassageFormValue): number | null {
  return v.minutes === null && v.seconds === null
    ? null
    : (v.minutes ?? 0) * 60 + (v.seconds ?? 0);
}

export function passageComputed(
  material: PhilIriMaterial,
  v: PassageFormValue,
): PhilIriIndividual {
  return computeIndividual(
    Number(material.word_count),
    v.miscues,
    v.comprehensionRaw,
    PHILIRI_COMPREHENSION_QUESTIONS,
    totalSecondsOf(v),
  );
}

interface Props {
  material: PhilIriMaterial;
  value: PassageFormValue;
  onChange: (patch: Partial<PassageFormValue>) => void;
  disabled?: boolean;
}

/**
 * Presentational field set for one graded-passage read (Phil-IRI Form 3A/3B).
 * Fully controlled — the parent owns state and persistence; this only renders
 * inputs + the live-computed results for the given material.
 */
export function PhilIriPassageFields({
  material,
  value,
  onChange,
  disabled,
}: Props) {
  const computed = passageComputed(material, value);

  const setMiscue = (key: string, raw: string) =>
    onChange({
      miscues: {
        ...value.miscues,
        [key]: raw === "" ? null : Math.max(0, Math.trunc(Number(raw) || 0)),
      },
    });

  return (
    <div className="space-y-6">
      {/* PART A — Comprehension */}
      <section className="space-y-3">
        <p className="text-sm font-semibold border-b pb-1">
          Part A — Comprehension
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <Label className="mb-1 block text-xs">Time — minutes</Label>
            <Input
              type="number"
              min={0}
              value={value.minutes === null ? "" : value.minutes}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  minutes:
                    e.target.value === ""
                      ? null
                      : Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                })
              }
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Time — seconds</Label>
            <Input
              type="number"
              min={0}
              max={59}
              value={value.seconds === null ? "" : value.seconds}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  seconds:
                    e.target.value === ""
                      ? null
                      : Math.min(
                          59,
                          Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                        ),
                })
              }
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Reading rate (wpm)</Label>
            <Input value={computed.readingRate ?? "-"} disabled readOnly />
          </div>
          <div>
            <Label className="mb-1 block text-xs">
              Score (of {PHILIRI_COMPREHENSION_QUESTIONS})
            </Label>
            <Input
              type="number"
              min={0}
              max={PHILIRI_COMPREHENSION_QUESTIONS}
              value={value.comprehensionRaw === null ? "" : value.comprehensionRaw}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  comprehensionRaw:
                    e.target.value === ""
                      ? null
                      : Math.min(
                          PHILIRI_COMPREHENSION_QUESTIONS,
                          Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                        ),
                })
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-muted px-3 py-1">
            Comprehension: {computed.comprehensionScore ?? "-"}
            {computed.comprehensionScore !== null ? "%" : ""}
          </span>
          <span className="rounded-full bg-muted px-3 py-1">
            Level: {computed.comprehensionLevel ?? "-"}
          </span>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Responses to Questions</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
            {Array.from(
              { length: PHILIRI_COMPREHENSION_QUESTIONS },
              (_, i) => `q${i + 1}`,
            ).map((q, i) => (
              <div key={q}>
                <span className="text-[10px] text-muted-foreground">{i + 1}.</span>
                <Input
                  className="h-8"
                  value={value.answers[q] ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({ answers: { ...value.answers, [q]: e.target.value } })
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PART B — Word Reading */}
      <section className="space-y-3">
        <p className="text-sm font-semibold border-b pb-1">
          Part B — Word Reading (Pagbasa)
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="text-muted-foreground">Seleksyon (Selection): </span>
            <span className="font-medium">{material.title}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Level: </span>
            <span className="font-medium">{material.grade_level}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Set: </span>
            <span className="font-medium">{material.set_label ?? "-"}</span>
          </span>
        </div>
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60">
                <th className="px-3 py-1.5 text-left">
                  Types of Miscues{" "}
                  <span className="font-normal italic text-muted-foreground">
                    (Uri ng Mali)
                  </span>
                </th>
                <th className="px-3 py-1.5 text-center w-32">
                  Number of Miscues
                </th>
              </tr>
            </thead>
            <tbody>
              {PHILIRI_MISCUE_TYPES.map((mt, i) => (
                <tr key={mt.key} className="border-t">
                  <td className="px-3 py-1">
                    {i + 1}. {mt.en}{" "}
                    <span className="italic text-muted-foreground">
                      ({mt.fil})
                    </span>
                  </td>
                  <td className="p-0 text-center">
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-full rounded-none border-0 text-center"
                      value={value.miscues[mt.key] === null ? "" : value.miscues[mt.key]!}
                      disabled={disabled}
                      onChange={(e) => setMiscue(mt.key, e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                    />
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-3 py-1">Total Miscues (Kabuuan)</td>
                <td className="px-3 py-1 text-center">
                  {computed.totalMiscues ?? "-"}
                </td>
              </tr>
              <tr className="border-t">
                <td className="px-3 py-1">Number of Words in the Passage</td>
                <td className="px-3 py-1 text-center">{material.word_count}</td>
              </tr>
              <tr className="border-t">
                <td className="px-3 py-1">Word Reading Score</td>
                <td className="px-3 py-1 text-center">
                  {computed.wordReadingScore === null
                    ? "-"
                    : `${computed.wordReadingScore}%`}
                </td>
              </tr>
              <tr className="border-t font-medium">
                <td className="px-3 py-1">
                  Word Reading Level (Antas ng Pagbasa)
                </td>
                <td className="px-3 py-1 text-center">
                  {computed.wordReadingLevel ?? "-"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">
            Overall Reading Level: {computed.overallReadingLevel ?? "-"}
          </span>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="mb-1 block text-xs">Date assessed</Label>
          <Input
            type="date"
            value={value.dateAssessed}
            disabled={disabled}
            onChange={(e) => onChange({ dateAssessed: e.target.value })}
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Remarks</Label>
          <Input
            value={value.remarks}
            disabled={disabled}
            onChange={(e) => onChange({ remarks: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
