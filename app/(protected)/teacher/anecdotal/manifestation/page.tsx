"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getGradeLevelLabel } from "@/lib/constants";
import {
  CONSENT_STATUS_SHORT_LABELS,
  getLsenLabel,
  isConsentGranted,
  LSEN_CATEGORY_SHORT_LABELS,
} from "@/lib/constants/manifestation";
import { fetchLearnerPrintContext } from "@/lib/pdf/learnerRecordPrint";
import { generateSnedConsentForm } from "@/lib/pdf/generateSnedConsentForm";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { formatLrn, normalizeLrn } from "@/lib/utils";
import { fetchSchoolSettings } from "@/lib/utils/schoolSettings";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import type { ManifestationTag } from "@/types";
import {
  ArrowLeft,
  ClipboardList,
  FileSignature,
  Loader2,
  Printer,
  Tags,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  advisoryLearnerName,
  useAdvisoryLearners,
  type AdvisoryLearnerRow,
} from "../../useAdvisoryLearners";
import { ConsentModal, type ConsentFormValues } from "./components/ConsentModal";
import { InterventionsModal } from "./components/InterventionsModal";
import { TagModal, type TagFormValues } from "./components/TagModal";
import { useManifestationTags, type TagBundle } from "./useManifestationTags";

type RosterFilter =
  | "all"
  | "tagged"
  | "untagged"
  | "consent_pending"
  | "consented"
  | "for_sned"
  | "sned_enrolled"
  | "ta_requested";

const FILTER_LABELS: Record<RosterFilter, string> = {
  all: "All learners",
  tagged: "Tagged",
  untagged: "Not tagged",
  consent_pending: "Awaiting consent",
  consented: "Consent given",
  for_sned: "For SNED enrollment",
  sned_enrolled: "Enrolled in SNED",
  ta_requested: "TA requested",
};

/** A tagged learner with consent is identified for SNED enrollment. */
function isIdentifiedForSned(bundle: TagBundle | undefined): boolean {
  if (!bundle) return false;
  return (
    bundle.items.length > 0 && isConsentGranted(bundle.tag.consent_status)
  );
}

function hasPendingTa(bundle: TagBundle | undefined): boolean {
  return (
    bundle?.interventions.some((iv) => iv.ta_requested && !iv.ta_notes) ?? false
  );
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const {
    rows: learners,
    loading: learnersLoading,
    schoolId,
  } = useAdvisoryLearners(schoolYear);

  const studentIds = useMemo(
    () => learners.map((l) => String(l.id)),
    [learners],
  );
  const { bundles, loading: tagsLoading, reload } = useManifestationTags(
    studentIds,
    schoolYear,
  );

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");

  const [active, setActive] = useState<AdvisoryLearnerRow | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [intervOpen, setIntervOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const activeBundle = active ? bundles.get(String(active.id)) : undefined;

  // Memoized so the open TagModal does not reset its form on every re-render of
  // this page — the modal re-seeds itself whenever this prop's identity changes.
  const activeTagInput = useMemo(
    () =>
      activeBundle
        ? { tag: activeBundle.tag, items: activeBundle.items }
        : null,
    [activeBundle],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    // A pasted LRN carries the display dashes (see formatLrn) while l.lrn holds
    // bare digits, so match the stripped term too.
    const needleDigits = normalizeLrn(search);
    return learners.filter((l) => {
      if (needle) {
        const haystack =
          `${advisoryLearnerName(l)} ${l.lrn ?? ""}`.toLowerCase();
        const lrnMatch =
          needleDigits.length >= 4 &&
          normalizeLrn(l.lrn).includes(needleDigits);
        if (!haystack.includes(needle) && !lrnMatch) return false;
      }
      const bundle = bundles.get(String(l.id));
      switch (filter) {
        case "tagged":
          return !!bundle;
        case "untagged":
          return !bundle;
        case "consent_pending":
          return !!bundle && bundle.tag.consent_status === "pending";
        case "consented":
          return !!bundle && isConsentGranted(bundle.tag.consent_status);
        case "for_sned":
          return isIdentifiedForSned(bundle) && !bundle?.tag.sned_enrolled;
        case "sned_enrolled":
          return bundle?.tag.sned_enrolled === true;
        case "ta_requested":
          return hasPendingTa(bundle);
        default:
          return true;
      }
    });
  }, [learners, bundles, search, filter]);

  const summary = useMemo(() => {
    const all = [...bundles.values()];
    return {
      tagged: all.length,
      pending: all.filter((b) => b.tag.consent_status === "pending").length,
      consented: all.filter((b) => isConsentGranted(b.tag.consent_status))
        .length,
      withIntervention: all.filter((b) => b.interventions.length > 0).length,
      forSned: all.filter((b) => isIdentifiedForSned(b) && !b.tag.sned_enrolled)
        .length,
      snedEnrolled: all.filter((b) => b.tag.sned_enrolled).length,
    };
  }, [bundles]);

  const openTag = (learner: AdvisoryLearnerRow) => {
    setActive(learner);
    setTagOpen(true);
  };
  const openConsent = (learner: AdvisoryLearnerRow) => {
    setActive(learner);
    setConsentOpen(true);
  };
  const openInterventions = (learner: AdvisoryLearnerRow) => {
    setActive(learner);
    setIntervOpen(true);
  };

  // ── Mutations ─────────────────────────────────────────────────────────────

  const handleTagSubmit = async (values: TagFormValues) => {
    if (!active || schoolId == null) return;
    setSubmitting(true);
    try {
      const existing = bundles.get(String(active.id))?.tag ?? null;
      const payload = {
        class_type: values.class_type,
        non_graded_program:
          values.class_type === "non_graded" ? values.non_graded_program : null,
        tagged_date: values.tagged_date,
        observation: values.observation.trim() || null,
        remarks: values.remarks.trim() || null,
        lis_tagged: values.lis_tagged,
        lis_tagged_date: values.lis_tagged
          ? values.lis_tagged_date || null
          : null,
      };

      let tagId: string;
      if (existing) {
        const { error } = await supabase
          .from("sms_manifestation_tags")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        tagId = existing.id;
      } else {
        const { data, error } = await supabase
          .from("sms_manifestation_tags")
          .insert({
            ...payload,
            student_id: Number(active.id),
            school_id: Number(schoolId),
            school_year: schoolYear,
            created_by: user?.system_user_id ?? null,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        tagId = String((data as { id: string | number }).id);
      }

      // The item set is small and fully re-stated by the form, so replacing it
      // wholesale is simpler — and cheaper — than diffing add/remove/edit.
      const { error: delErr } = await supabase
        .from("sms_manifestation_tag_items")
        .delete()
        .eq("tag_id", Number(tagId));
      if (delErr) throw new Error(delErr.message);

      if (values.selections.length > 0) {
        const { error: insErr } = await supabase
          .from("sms_manifestation_tag_items")
          .insert(
            values.selections.map((s) => ({
              tag_id: Number(tagId),
              category: s.category,
              code: s.code,
              notes: s.notes.trim() || null,
            })),
          );
        if (insErr) throw new Error(insErr.message);
      }

      toast.success(existing ? "Tagging updated." : "Learner tagged.");
      setTagOpen(false);
      reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save tagging.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConsentSubmit = async (values: ConsentFormValues) => {
    const tag = activeBundle?.tag;
    if (!tag) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("sms_manifestation_tags")
      .update({
        consent_status: values.consent_status,
        consent_date: values.consent_date || null,
        consent_signatory: values.consent_signatory.trim() || null,
        consent_relationship: values.consent_relationship.trim() || null,
        disagree_reason:
          values.consent_status === "disagree"
            ? values.disagree_reason.trim() || null
            : null,
      })
      .eq("id", tag.id);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Consent recorded.");
    setConsentOpen(false);
    reload();
  };

  const toggleSnedEnrolled = async (tag: ManifestationTag) => {
    const next = !tag.sned_enrolled;
    const { error } = await supabase
      .from("sms_manifestation_tags")
      .update({
        sned_enrolled: next,
        sned_enrolled_date: next ? new Date().toISOString().slice(0, 10) : null,
      })
      .eq("id", tag.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(next ? "Marked as enrolled in SNED." : "SNED enrollment cleared.");
    reload();
  };

  const handleDeleteTag = async (
    learner: AdvisoryLearnerRow,
    tag: ManifestationTag,
  ) => {
    if (
      !window.confirm(
        `Remove the tagging record for ${advisoryLearnerName(learner)}? Its consent and interventions are deleted too.`,
      )
    )
      return;
    const { error } = await supabase
      .from("sms_manifestation_tags")
      .delete()
      .eq("id", tag.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tagging removed.");
    reload();
  };

  const handlePrintConsent = async (learner: AdvisoryLearnerRow) => {
    setPrintingId(String(learner.id));
    try {
      const [context, settings] = await Promise.all([
        fetchLearnerPrintContext(schoolId),
        fetchSchoolSettings(schoolId != null ? String(schoolId) : null),
      ]);
      generateSnedConsentForm({
        student: learner,
        gradeLevel: learner.section_grade_level,
        sectionName: learner.section_name,
        schoolYear,
        observation: bundles.get(String(learner.id))?.tag.observation ?? null,
        context,
        snedCoordinatorName: settings.sned_coordinator_name,
        adviserName: user?.name ?? null,
      });
    } catch {
      toast.error("Failed to generate the consent form.");
    } finally {
      setPrintingId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const loading = learnersLoading || tagsLoading;

  return (
    <div>
      <div className="app__title">
        <div className="flex-1">
          <h1 className="app__title_text flex items-center gap-2">
            <Tags className="h-5 w-5" />
            Learner Manifestation Tagging
          </h1>
          <p className="text-sm text-muted-foreground">
            Tag learners with their manifestation/s, secure parent consent,
            design an intervention, and identify them for SNED enrollment.
          </p>
        </div>
        <Link href="/teacher/anecdotal" className="shrink-0">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Anecdotal Record
          </Button>
        </Link>
      </div>

      <div className="app__content space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Tagged", value: summary.tagged },
            { label: "Awaiting consent", value: summary.pending },
            { label: "Consent given", value: summary.consented },
            { label: "With intervention", value: summary.withIntervention },
            { label: "For SNED enrollment", value: summary.forSned },
            { label: "Enrolled in SNED", value: summary.snedEnrolled },
          ].map((tile) => (
            <Card key={tile.label}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{tile.label}</p>
                <p className="text-xl font-semibold">{tile.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <label className="mb-1.5 block text-sm font-medium">
              School Year
            </label>
            <Select value={schoolYear} onValueChange={setSchoolYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getSchoolYearOptions().map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-56">
            <label className="mb-1.5 block text-sm font-medium">Show</label>
            <Select
              value={filter}
              onValueChange={(v) => setFilter(v as RosterFilter)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FILTER_LABELS) as RosterFilter[]).map((f) => (
                  <SelectItem key={f} value={f}>
                    {FILTER_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-56 flex-1 max-w-sm">
            <label className="mb-1.5 block text-sm font-medium">Search</label>
            <Input
              placeholder="Learner name or LRN"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : learners.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No advisory learners for {schoolYear}.
              </p>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No learner matches this filter.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="border px-3 py-2 text-left">Learner</th>
                      <th className="border px-3 py-2 text-left">
                        Manifestation/s
                      </th>
                      <th className="border px-3 py-2 text-left whitespace-nowrap">
                        Consent
                      </th>
                      <th className="border px-3 py-2 text-center whitespace-nowrap">
                        Intervention
                      </th>
                      <th className="border px-3 py-2 text-left whitespace-nowrap">
                        SNED
                      </th>
                      <th className="border px-3 py-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => {
                      const bundle = bundles.get(String(l.id));
                      const tag = bundle?.tag;
                      const identified = isIdentifiedForSned(bundle);
                      const taPending = hasPendingTa(bundle);
                      return (
                        <tr key={l.id} className="align-top hover:bg-muted/30">
                          <td className="border px-3 py-2">
                            <div className="font-medium">
                              {advisoryLearnerName(l)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span className="font-mono">
                                {formatLrn(l.lrn)}
                              </span>
                              {l.section_grade_level != null &&
                                ` · ${getGradeLevelLabel(l.section_grade_level)}`}
                              {l.section_name ? ` · ${l.section_name}` : ""}
                            </div>
                          </td>
                          <td className="border px-3 py-2">
                            {!bundle || bundle.items.length === 0 ? (
                              <span className="text-muted-foreground">
                                Not tagged
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {bundle.items.map((item) => (
                                  <Badge
                                    key={item.id}
                                    variant={
                                      item.category === "diagnosed"
                                        ? "red"
                                        : item.category === "gifted"
                                          ? "blue"
                                          : "secondary"
                                    }
                                    title={`${LSEN_CATEGORY_SHORT_LABELS[item.category]}${item.notes ? ` — ${item.notes}` : ""}`}
                                  >
                                    {getLsenLabel(item.code)}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="border px-3 py-2 whitespace-nowrap">
                            {!tag ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <Badge
                                variant={
                                  isConsentGranted(tag.consent_status)
                                    ? "green"
                                    : tag.consent_status === "disagree"
                                      ? "red"
                                      : "outline"
                                }
                              >
                                {CONSENT_STATUS_SHORT_LABELS[tag.consent_status]}
                              </Badge>
                            )}
                          </td>
                          <td className="border px-3 py-2 text-center">
                            {!bundle ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <span>{bundle.interventions.length}</span>
                                {taPending && (
                                  <Badge variant="orange">TA requested</Badge>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="border px-3 py-2 whitespace-nowrap">
                            {!tag ? (
                              <span className="text-muted-foreground">—</span>
                            ) : tag.sned_enrolled ? (
                              <button
                                type="button"
                                className="cursor-pointer"
                                onClick={() => toggleSnedEnrolled(tag)}
                                title="Clear SNED enrollment"
                              >
                                <Badge variant="green">Enrolled</Badge>
                              </button>
                            ) : identified ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7"
                                onClick={() => toggleSnedEnrolled(tag)}
                              >
                                Mark enrolled
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Needs consent
                              </span>
                            )}
                          </td>
                          <td className="border px-2 py-2">
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title={tag ? "Edit tagging" : "Tag learner"}
                                onClick={() => openTag(l)}
                              >
                                <Tags className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Consent"
                                disabled={!tag}
                                onClick={() => openConsent(l)}
                              >
                                <FileSignature className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Interventions"
                                disabled={!tag}
                                onClick={() => openInterventions(l)}
                              >
                                <ClipboardList className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Print consent form"
                                disabled={printingId === String(l.id)}
                                onClick={() => handlePrintConsent(l)}
                              >
                                {printingId === String(l.id) ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Printer className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              {tag && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-600"
                                  title="Remove tagging"
                                  onClick={() => handleDeleteTag(l, tag)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TagModal
        open={tagOpen}
        onOpenChange={setTagOpen}
        learnerName={active ? advisoryLearnerName(active) : ""}
        existing={activeTagInput}
        submitting={submitting}
        onSubmit={handleTagSubmit}
      />

      <ConsentModal
        open={consentOpen}
        onOpenChange={setConsentOpen}
        learnerName={active ? advisoryLearnerName(active) : ""}
        tag={activeBundle?.tag ?? null}
        submitting={submitting}
        printing={active ? printingId === String(active.id) : false}
        onPrint={() => active && handlePrintConsent(active)}
        onSubmit={handleConsentSubmit}
      />

      <InterventionsModal
        open={intervOpen}
        onOpenChange={setIntervOpen}
        learnerName={active ? advisoryLearnerName(active) : ""}
        tagId={activeBundle?.tag.id ?? null}
        interventions={activeBundle?.interventions ?? []}
        onChanged={reload}
      />
    </div>
  );
}
