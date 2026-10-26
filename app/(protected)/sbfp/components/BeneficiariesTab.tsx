"use client";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SBFP_CLASSIFICATION_OPTIONS,
  SBFP_MILK_TOLERANCE_OPTIONS,
  type SbfpClassification,
  type SbfpMilkTolerance,
} from "@/lib/constants/sbfp";
import {
  fetchBeneficiaryViews,
  fetchFeedingRecords,
  fetchSectionRoster,
  fetchTakenStudents,
  saveSectionBeneficiaries,
  type SbfpBeneficiaryFields,
  type SbfpRosterLearner,
} from "@/lib/sbfp/queries";
import {
  heightForAgeLabel,
  nutritionalStatusLabel,
} from "@/lib/utils/nutritionalStatus";
import { suggestClassification } from "@/lib/utils/sbfp";
import { Loader2, Save, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { gradeSectionLabel, sectionOptionLabel, type SbfpTabProps } from "./types";

const UNSET = "__unset__";

const DEFAULT_FIELDS: SbfpBeneficiaryFields = {
  classification: "primary",
  is_pregnant: false,
  has_infant: false,
  is_dewormed: false,
  milk_consent: null,
  is_previous_beneficiary: false,
  is_pardo: false,
  is_indigent: false,
  milk_tolerance: null,
};

/** The yes/no flags, in Form 1A / Form 2 column order. */
const FLAGS: { key: keyof SbfpBeneficiaryFields; label: string; title: string }[] = [
  { key: "is_pregnant", label: "Preg.", title: "Pregnant" },
  { key: "has_infant", label: "0-1 child", title: "With 0-1 year-old child/ren" },
  { key: "is_dewormed", label: "Dewormed", title: "Dewormed" },
  { key: "is_previous_beneficiary", label: "Prev.", title: "Beneficiary of SBFP in previous years" },
  { key: "is_pardo", label: "PARDO", title: "Pupil at risk of dropping out" },
  { key: "is_indigent", label: "Indigent", title: "Indigent learner" },
];

export function BeneficiariesTab({
  program,
  schoolYear,
  sections,
  recordableSectionIds,
  ownRecordsOnly,
  actorId,
}: SbfpTabProps) {
  const [sectionId, setSectionId] = useState("");
  const [roster, setRoster] = useState<SbfpRosterLearner[]>([]);
  /** studentId → fields, for every ticked learner. */
  const [selected, setSelected] = useState<Map<string, SbfpBeneficiaryFields>>(new Map());
  /** studentId → beneficiary id, as stored. */
  const [existing, setExisting] = useState<Map<string, string>>(new Map());
  /** Learners already beneficiaries under someone else's record (210). */
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState<{ learners: number; records: number } | null>(
    null,
  );

  // Encoders see the sections they may encode first; readers see every section.
  const visibleSections = useMemo(() => {
    const own = sections.filter((s) => recordableSectionIds.has(s.id));
    return own.length > 0 ? own : sections;
  }, [sections, recordableSectionIds]);
  const canEdit = recordableSectionIds.has(sectionId);
  const currentSection = sections.find((s) => s.id === sectionId);
  const gradeSection = currentSection
    ? gradeSectionLabel(currentSection.grade_level, currentSection.name)
    : "—";

  useEffect(() => {
    if (!sectionId && visibleSections.length > 0) setSectionId(visibleSections[0].id);
  }, [sectionId, visibleSections]);

  const load = useCallback(async () => {
    if (!program || !sectionId) return;
    setLoading(true);
    try {
      const [learners, views, takenIds] = await Promise.all([
        fetchSectionRoster(sectionId, schoolYear),
        fetchBeneficiaryViews(program, sectionId),
        fetchTakenStudents(program.id, sectionId),
      ]);
      setRoster(learners);
      setTaken(takenIds);
      setSelected(
        new Map(
          views.map((v) => [
            v.student_id,
            {
              classification: v.classification,
              is_pregnant: v.is_pregnant,
              has_infant: v.has_infant,
              is_dewormed: v.is_dewormed,
              milk_consent: v.milk_consent,
              is_previous_beneficiary: v.is_previous_beneficiary,
              is_pardo: v.is_pardo,
              is_indigent: v.is_indigent,
              milk_tolerance: v.milk_tolerance,
            },
          ]),
        ),
      );
      setExisting(new Map(views.map((v) => [v.student_id, v.id])));
    } catch (err) {
      console.error("Error loading SBFP beneficiaries:", err);
      toast.error("Failed to load the section");
    } finally {
      setLoading(false);
    }
  }, [program, sectionId, schoolYear]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) await load();
    })();
    return () => {
      isMounted = false;
    };
  }, [load]);

  const toggle = (learner: SbfpRosterLearner, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) {
        next.set(learner.student_id, {
          ...DEFAULT_FIELDS,
          classification: suggestClassification(learner.baseline) ?? "primary",
        });
      } else {
        next.delete(learner.student_id);
      }
      return next;
    });

  const patch = (studentId: string, p: Partial<SbfpBeneficiaryFields>) =>
    setSelected((prev) => {
      const current = prev.get(studentId);
      if (!current) return prev;
      return new Map(prev).set(studentId, { ...current, ...p });
    });

  const selectSuggested = () => {
    const next = new Map(selected);
    let added = 0;
    for (const l of roster) {
      const c = suggestClassification(l.baseline);
      if (c && !next.has(l.student_id) && !taken.has(l.student_id)) {
        next.set(l.student_id, { ...DEFAULT_FIELDS, classification: c });
        added += 1;
      }
    }
    setSelected(next);
    toast.success(
      added > 0
        ? `Ticked ${added} learner(s) from the baseline`
        : "No further wasted or stunted learners in the baseline",
    );
  };

  const selectAll = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const l of roster) {
        if (!next.has(l.student_id) && !taken.has(l.student_id)) {
          next.set(l.student_id, {
            ...DEFAULT_FIELDS,
            classification: suggestClassification(l.baseline) ?? "primary",
          });
        }
      }
      return next;
    });

  const doSave = async () => {
    if (!program) return;
    setSaving(true);
    try {
      await saveSectionBeneficiaries({
        programId: program.id,
        sectionId,
        selected,
        existing,
        actorId,
      });
      toast.success("Beneficiaries saved");
      await load();
    } catch (err) {
      console.error("Error saving SBFP beneficiaries:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
      setConfirmRemoval(null);
    }
  };

  /** Unticking a learner deletes their feeding records with them — ask first. */
  const handleSave = async () => {
    const removedIds = [...existing]
      .filter(([studentId]) => !selected.has(studentId))
      .map(([, id]) => id);
    if (removedIds.length > 0) {
      const records = await fetchFeedingRecords(removedIds);
      const count = [...records.values()].reduce((n, m) => n + m.size, 0);
      if (count > 0) {
        setConfirmRemoval({ learners: removedIds.length, records: count });
        return;
      }
    }
    await doSave();
  };

  const missingBaseline = roster.filter((l) => !l.baseline?.nutritional_status).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Section</label>
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select section" />
            </SelectTrigger>
            <SelectContent>
              {visibleSections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {sectionOptionLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canEdit && (
          <>
            <Button variant="outline" onClick={selectSuggested} disabled={loading}>
              <Sparkles className="h-4 w-4 mr-2" />
              Tick wasted &amp; stunted
            </Button>
            <Button variant="outline" onClick={selectAll} disabled={loading}>
              Tick whole section
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </>
        )}
      </div>

      {!loading && roster.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {selected.size} of {roster.length} learners are
          {ownRecordsOnly ? " your" : ""} beneficiaries.
          {taken.size > 0 &&
            ` ${taken.size} more ${taken.size === 1 ? "was" : "were"} encoded by someone else and ${taken.size === 1 ? "is" : "are"} not shown.`}
          {missingBaseline > 0 &&
            ` ${missingBaseline} learner(s) have no baseline nutritional status on Learner Health yet.`}{" "}
          Severely Wasted and Wasted learners are primary targets; Stunted learners
          are secondary. 4Ps and IP come from the learner record.
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : roster.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {sectionId ? "No enrolled learners in this section." : "Select a section."}
        </p>
      ) : (
        <div className="app__table_shell">
          <div className="app__table_wrapper">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="w-8"></th>
                  <th className="text-left font-medium">Learner</th>
                  <th className="text-left font-medium">Grade &amp; Section</th>
                  <th className="text-left font-medium">Baseline BMI-A</th>
                  <th className="text-left font-medium">HFA</th>
                  <th className="text-left font-medium">Classification</th>
                  {FLAGS.map((f) => (
                    <th key={f.key} className="text-center font-medium" title={f.title}>
                      {f.label}
                    </th>
                  ))}
                  <th className="text-left font-medium">Milk consent</th>
                  <th className="text-left font-medium">Milk tolerance</th>
                  <th className="text-center font-medium">4Ps</th>
                  <th className="text-center font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((l) => {
                  const fields = selected.get(l.student_id);
                  const on = Boolean(fields);
                  const isTaken = taken.has(l.student_id);
                  const suggestion = suggestClassification(l.baseline);
                  return (
                    <tr key={l.student_id} className={on ? "" : "text-muted-foreground"}>
                      <td>
                        <Checkbox
                          checked={on || isTaken}
                          disabled={!canEdit || isTaken}
                          title={isTaken ? "Already a beneficiary, encoded by someone else" : undefined}
                          onChange={(e) => toggle(l, e.target.checked)}
                          aria-label={`Beneficiary: ${l.name}`}
                        />
                      </td>
                      <td className="whitespace-nowrap">
                        {l.name}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {l.sex === "male" ? "M" : l.sex === "female" ? "F" : ""}
                        </span>
                        {isTaken && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (encoded by someone else)
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">{gradeSection}</td>
                      <td className={suggestion === "primary" ? "font-medium text-destructive" : ""}>
                        {l.baseline?.nutritional_status
                          ? nutritionalStatusLabel(l.baseline.nutritional_status)
                          : "—"}
                      </td>
                      <td className={suggestion === "secondary" ? "font-medium text-amber-600" : ""}>
                        {l.baseline?.height_for_age
                          ? heightForAgeLabel(l.baseline.height_for_age)
                          : "—"}
                      </td>
                      <td>
                        {fields ? (
                          <Select
                            value={fields.classification}
                            disabled={!canEdit}
                            onValueChange={(v) =>
                              patch(l.student_id, { classification: v as SbfpClassification })
                            }
                          >
                            <SelectTrigger className="h-8 w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SBFP_CLASSIFICATION_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </td>
                      {FLAGS.map((f) => (
                        <td key={f.key} className="text-center">
                          {fields && (
                            <Checkbox
                              checked={fields[f.key] === true}
                              disabled={!canEdit}
                              onChange={(e) =>
                                patch(l.student_id, { [f.key]: e.target.checked })
                              }
                              aria-label={f.title}
                            />
                          )}
                        </td>
                      ))}
                      <td>
                        {fields && (
                          <Select
                            value={
                              fields.milk_consent == null
                                ? UNSET
                                : fields.milk_consent
                                  ? "yes"
                                  : "no"
                            }
                            disabled={!canEdit}
                            onValueChange={(v) =>
                              patch(l.student_id, {
                                milk_consent: v === UNSET ? null : v === "yes",
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-[90px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UNSET}>—</SelectItem>
                              <SelectItem value="yes">Yes</SelectItem>
                              <SelectItem value="no">No</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td>
                        {fields && (
                          <Select
                            value={fields.milk_tolerance ?? UNSET}
                            disabled={!canEdit}
                            onValueChange={(v) =>
                              patch(l.student_id, {
                                milk_tolerance: v === UNSET ? null : (v as SbfpMilkTolerance),
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-[170px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UNSET}>—</SelectItem>
                              {SBFP_MILK_TOLERANCE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value} title={o.label}>
                                  {o.shortLabel}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="text-center">{l.is_4ps ? "Yes" : ""}</td>
                      <td className="text-center">{l.is_ip ? "Yes" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRemoval !== null}
        onOpenChange={(open) => !open && setConfirmRemoval(null)}
        title="Remove beneficiaries?"
        description={
          confirmRemoval &&
          `${confirmRemoval.learners} learner(s) you unticked have ${confirmRemoval.records} daily feeding record(s). Removing them deletes those records too.`
        }
        confirmText="Remove and save"
        variant="destructive"
        loading={saving}
        onConfirm={doSave}
      />
    </div>
  );
}
