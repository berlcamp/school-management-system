"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DESIGNATION_LABELS,
  STAFF_DESIGNATIONS,
  designationNeeds,
  type StaffDesignation,
} from "@/lib/constants/designations";
import { supabase } from "@/lib/supabase/client";
import { form6GradeLabel } from "@/lib/utils/sbfp";
import { useEffect, useMemo, useState } from "react";

export type DesignationDraft = {
  designations: StaffDesignation[];
  subjectIds: string[];
  gradeLevels: number[];
};

export const EMPTY_DESIGNATION_DRAFT: DesignationDraft = {
  designations: [],
  subjectIds: [],
  gradeLevels: [],
};

interface SubjectOption {
  id: string;
  code: string;
  name: string;
  grade_level: number;
}

interface Props {
  schoolId: number;
  value: DesignationDraft;
  onChange: (v: DesignationDraft) => void;
  disabled?: boolean;
  /** Shown under the heading, e.g. why the controls are disabled. */
  note?: string;
  /** The person being edited, so "also headed by" leaves them out. */
  userId?: number;
}

function isDesignation(value: string): value is StaffDesignation {
  return (STAFF_DESIGNATIONS as readonly string[]).includes(value);
}

export function DesignationsFields({
  schoolId,
  value,
  onChange,
  disabled,
  note,
  userId,
}: Props) {
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [sectionGrades, setSectionGrades] = useState<number[]>([]);
  const [otherHeads, setOtherHeads] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");

  const wantsSubjects = value.designations.includes("department_head");
  const wantsGrades = value.designations.includes("grade_level_coordinator");

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const [subj, sect, links] = await Promise.all([
        supabase
          .from("sms_subjects")
          .select("id, code, name, grade_level")
          .eq("school_id", schoolId)
          .eq("is_active", true)
          .order("grade_level")
          .order("code"),
        supabase
          .from("sms_sections")
          .select("grade_level")
          .eq("school_id", schoolId)
          .eq("is_active", true),
        supabase
          .from("sms_department_head_subjects")
          .select("subject_id, user_id")
          .eq("school_id", schoolId),
      ]);
      if (!isMounted) return;
      if (!subj.error) {
        setSubjects(
          (subj.data ?? []).map((s) => ({
            id: String(s.id),
            code: String(s.code),
            name: String(s.name),
            grade_level: Number(s.grade_level),
          })),
        );
      }
      if (!sect.error) {
        setSectionGrades(
          Array.from(
            new Set((sect.data ?? []).map((s) => Number(s.grade_level))),
          ).sort((a, b) => a - b),
        );
      }
      if (!links.error) {
        const others = (links.data ?? []).filter(
          (l) => userId == null || Number(l.user_id) !== userId,
        );
        const ids = Array.from(new Set(others.map((l) => Number(l.user_id))));
        const names: Record<string, string> = {};
        if (ids.length > 0) {
          const { data } = await supabase
            .from("sms_users")
            .select("id, name")
            .in("id", ids);
          for (const u of data ?? []) names[String(u.id)] = String(u.name);
        }
        if (!isMounted) return;
        const map: Record<string, string[]> = {};
        for (const l of others) {
          const key = String(l.subject_id);
          const name = names[String(l.user_id)];
          if (name) (map[key] ??= []).push(name);
        }
        setOtherHeads(map);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [schoolId, userId]);

  // Keep an already-saved grade visible even if no active section has it now.
  const gradeOptions = useMemo(
    () =>
      Array.from(new Set([...sectionGrades, ...value.gradeLevels])).sort(
        (a, b) => a - b,
      ),
    [sectionGrades, value.gradeLevels],
  );

  const filteredSubjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subjects.filter(
      (s) =>
        !q ||
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q),
    );
  }, [subjects, search]);

  const byGrade = useMemo(() => {
    const groups = new Map<number, SubjectOption[]>();
    for (const s of filteredSubjects) {
      const list = groups.get(s.grade_level) ?? [];
      list.push(s);
      groups.set(s.grade_level, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [filteredSubjects]);

  const toggleDesignation = (d: StaffDesignation, on: boolean) => {
    const designations = on
      ? [...value.designations, d]
      : value.designations.filter((x) => x !== d);
    onChange({
      ...value,
      designations,
      // Unticking drops what the designation was scoped to.
      subjectIds: designationNeeds(d) === "subjects" && !on ? [] : value.subjectIds,
      gradeLevels:
        designationNeeds(d) === "grade_levels" && !on ? [] : value.gradeLevels,
    });
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Designations</div>
      <div className="space-y-3 rounded-md border p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STAFF_DESIGNATIONS.map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={value.designations.includes(d)}
                disabled={disabled}
                onChange={(e) => toggleDesignation(d, e.target.checked)}
              />
              {DESIGNATION_LABELS[d]}
            </label>
          ))}
        </div>

        {wantsSubjects && (
          <div className="space-y-2 border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground">
              Subjects headed
            </div>
            <Input
              placeholder="Search subjects"
              className="h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={disabled}
            />
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
              {byGrade.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  No active subjects found.
                </div>
              )}
              {byGrade.map(([grade, list]) => (
                <div key={grade} className="space-y-1">
                  <div className="text-xs font-semibold">
                    {form6GradeLabel(grade)}
                  </div>
                  {list.map((s) => {
                    const others = otherHeads[s.id];
                    return (
                      <label
                        key={s.id}
                        className="flex items-start gap-2 text-sm"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={value.subjectIds.includes(s.id)}
                          disabled={disabled}
                          onChange={(e) =>
                            onChange({
                              ...value,
                              subjectIds: e.target.checked
                                ? [...value.subjectIds, s.id]
                                : value.subjectIds.filter((x) => x !== s.id),
                            })
                          }
                        />
                        <span>
                          {s.code} — {s.name}
                          {others && others.length > 0 && (
                            <span className="block text-xs text-muted-foreground">
                              also headed by {others.join(", ")}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {wantsGrades && (
          <div className="space-y-2 border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground">
              Grade levels coordinated
            </div>
            <div className="grid grid-cols-3 gap-2">
              {gradeOptions.map((g) => (
                <label key={g} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={value.gradeLevels.includes(g)}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        gradeLevels: e.target.checked
                          ? [...value.gradeLevels, g]
                          : value.gradeLevels.filter((x) => x !== g),
                      })
                    }
                  />
                  {form6GradeLabel(g)}
                </label>
              ))}
              {gradeOptions.length === 0 && (
                <div className="col-span-3 text-xs text-muted-foreground">
                  No active sections found.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Reads the person's saved designations at a school into a draft. */
export async function fetchDesignationDraft(
  userId: number,
  schoolId: number,
): Promise<DesignationDraft> {
  const [desig, links] = await Promise.all([
    supabase
      .from("sms_staff_designations")
      .select("designation, grade_levels")
      .eq("user_id", userId)
      .eq("school_id", schoolId),
    supabase
      .from("sms_department_head_subjects")
      .select("subject_id")
      .eq("user_id", userId)
      .eq("school_id", schoolId),
  ]);
  if (desig.error) throw new Error(desig.error.message);
  if (links.error) throw new Error(links.error.message);

  const designations: StaffDesignation[] = [];
  const gradeLevels: number[] = [];
  for (const row of desig.data ?? []) {
    const d = String(row.designation);
    if (!isDesignation(d)) continue;
    designations.push(d);
    for (const g of (row.grade_levels as number[] | null) ?? []) {
      gradeLevels.push(Number(g));
    }
  }
  return {
    designations,
    gradeLevels,
    subjectIds: (links.data ?? []).map((l) => String(l.subject_id)),
  };
}

/**
 * Brings the person's designations in line with the draft: inserts new ones,
 * deletes removed ones (a Department Head delete cascades its links by
 * trigger), updates Grade Level Coordinator grade levels, then diffs the
 * Department Head subject links.
 */
export async function saveDesignations(
  userId: number,
  schoolId: number,
  draft: DesignationDraft,
): Promise<void> {
  const { data: current, error: readError } = await supabase
    .from("sms_staff_designations")
    .select("designation, grade_levels")
    .eq("user_id", userId)
    .eq("school_id", schoolId);
  if (readError) throw new Error(readError.message);

  const existing = new Map<string, number[]>();
  for (const row of current ?? []) {
    existing.set(
      String(row.designation),
      ((row.grade_levels as number[] | null) ?? []).map(Number),
    );
  }
  const wanted = new Set<string>(draft.designations);
  const sortedGrades = [...draft.gradeLevels].sort((a, b) => a - b);

  const removed = [...existing.keys()].filter((d) => !wanted.has(d));
  if (removed.length > 0) {
    const { error } = await supabase
      .from("sms_staff_designations")
      .delete()
      .eq("user_id", userId)
      .eq("school_id", schoolId)
      .in("designation", removed);
    if (error) throw new Error(error.message);
  }

  const added = draft.designations.filter((d) => !existing.has(d));
  if (added.length > 0) {
    const { error } = await supabase.from("sms_staff_designations").insert(
      added.map((d) => ({
        user_id: userId,
        school_id: schoolId,
        designation: d,
        ...(d === "grade_level_coordinator" && { grade_levels: sortedGrades }),
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (wanted.has("grade_level_coordinator") && existing.has("grade_level_coordinator")) {
    const before = [...(existing.get("grade_level_coordinator") ?? [])].sort(
      (a, b) => a - b,
    );
    if (before.join(",") !== sortedGrades.join(",")) {
      const { error } = await supabase
        .from("sms_staff_designations")
        .update({ grade_levels: sortedGrades })
        .eq("user_id", userId)
        .eq("school_id", schoolId)
        .eq("designation", "grade_level_coordinator");
      if (error) throw new Error(error.message);
    }
  }

  // Department Head subject links. Removing the designation already cleared
  // them by trigger, so only a person who stays a head needs the diff.
  if (!wanted.has("department_head")) return;

  const { data: links, error: linkError } = await supabase
    .from("sms_department_head_subjects")
    .select("subject_id")
    .eq("user_id", userId)
    .eq("school_id", schoolId);
  if (linkError) throw new Error(linkError.message);

  const have = new Set((links ?? []).map((l) => String(l.subject_id)));
  const want = new Set(draft.subjectIds);
  const drop = [...have].filter((id) => !want.has(id));
  const add = [...want].filter((id) => !have.has(id));

  if (drop.length > 0) {
    const { error } = await supabase
      .from("sms_department_head_subjects")
      .delete()
      .eq("user_id", userId)
      .eq("school_id", schoolId)
      .in("subject_id", drop.map(Number));
    if (error) throw new Error(error.message);
  }
  if (add.length > 0) {
    const { error } = await supabase.from("sms_department_head_subjects").insert(
      add.map((id) => ({
        user_id: userId,
        subject_id: Number(id),
        school_id: schoolId,
      })),
    );
    if (error) throw new Error(error.message);
  }
}
