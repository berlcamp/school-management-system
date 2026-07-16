"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import {
  SRC_SECTION_GROUPS,
  SRC_SECTIONS,
  SRC_SIGNATORY_ROLES,
} from "@/lib/constants/src";
import { generateSchoolReportCard } from "@/lib/pdf/generateSchoolReportCard";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { emptySrcPayload, getSbmBand } from "@/lib/utils/src";
import type {
  SrcAutofill,
  SrcSectionKey,
  SrcSectionPayloadMap,
  SrcSignatory,
  SrcStatus,
} from "@/types";
import { Printer, Save, Sparkles, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { SrcSectionCard } from "./components/SrcSectionCard";

interface HeaderState {
  id: number;
  status: SrcStatus;
  sbm_rating: string;
  cfss_points: string;
  cfss_interpretation: string;
  mooe_amount: string;
  dropout_rate: string;
  promotion_rate: string;
  teacher_count: string;
  classroom_count: string;
  toilet_count: string;
  seat_count: string;
  signatories: SrcSignatory[];
}

type SectionState = {
  [K in SrcSectionKey]: {
    payload: SrcSectionPayloadMap[K];
    narrative: string;
  };
};

/**
 * SectionState is keyed per section, so writing through a union-typed key
 * would require the intersection of all 16 payload shapes. Build it through a
 * widened view; emptySrcPayload is what guarantees each value's shape.
 */
type SectionStateWrite = Record<
  SrcSectionKey,
  { payload: unknown; narrative: string }
>;

function blankSections(): SectionState {
  const state = {} as SectionState;
  const write = state as unknown as SectionStateWrite;
  for (const meta of SRC_SECTIONS) {
    write[meta.key] = {
      payload: emptySrcPayload(meta.key),
      narrative: "",
    };
  }
  return state;
}

function defaultSignatories(): SrcSignatory[] {
  return SRC_SIGNATORY_ROLES.map((r) => ({
    role: r.value,
    name: "",
    title: r.defaultTitle,
  }));
}

/** "" -> null so a cleared field clears the column instead of writing 0. */
function numOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [sy, setSy] = useState(getCurrentSchoolYear());
  const [header, setHeader] = useState<HeaderState | null>(null);
  const [sections, setSections] = useState<SectionState>(blankSections);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  const isSchoolUser =
    !!user?.school_id &&
    user.type !== "division_admin" &&
    user.type !== "division_type";

  const { settings } = useSchoolSettings(isSchoolUser, user?.school_id);

  const schoolYearOptions = useMemo(() => getSchoolYearOptions(), []);

  const load = useCallback(async () => {
    if (!isSchoolUser || !user?.school_id) return;
    setLoading(true);
    try {
      const { data: existing, error: selErr } = await supabase
        .from("sms_src_submissions")
        .select("*")
        .eq("school_id", Number(user.school_id))
        .eq("school_year", sy)
        .maybeSingle();
      if (selErr) throw selErr;

      let row = existing;
      if (!row) {
        const { data: inserted, error: insErr } = await supabase
          .from("sms_src_submissions")
          .insert({
            school_id: Number(user.school_id),
            school_year: sy,
            status: "draft",
            signatories: defaultSignatories(),
          })
          .select("*")
          .single();
        if (insErr) throw insErr;
        row = inserted;
      }

      const signatories =
        Array.isArray(row.signatories) && row.signatories.length > 0
          ? (row.signatories as SrcSignatory[])
          : defaultSignatories();

      setHeader({
        id: row.id,
        status: row.status,
        sbm_rating: row.sbm_rating?.toString() ?? "",
        cfss_points: row.cfss_points?.toString() ?? "",
        cfss_interpretation: row.cfss_interpretation ?? "",
        mooe_amount: row.mooe_amount?.toString() ?? "",
        dropout_rate: row.dropout_rate?.toString() ?? "",
        promotion_rate: row.promotion_rate?.toString() ?? "",
        teacher_count: row.teacher_count?.toString() ?? "",
        classroom_count: row.classroom_count?.toString() ?? "",
        toilet_count: row.toilet_count?.toString() ?? "",
        seat_count: row.seat_count?.toString() ?? "",
        signatories,
      });

      const { data: sectionRows, error: secErr } = await supabase
        .from("sms_src_sections")
        .select("section_key, narrative, payload")
        .eq("submission_id", row.id);
      if (secErr) throw secErr;

      const next = blankSections();
      for (const s of sectionRows ?? []) {
        const key = s.section_key as SrcSectionKey;
        if (!(key in next)) continue;
        next[key] = {
          payload: (s.payload ?? emptySrcPayload(key)) as never,
          narrative: s.narrative ?? "",
        };
      }
      setSections(next);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load the report card",
      );
    } finally {
      setLoading(false);
    }
  }, [isSchoolUser, user?.school_id, sy]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAutofill = async () => {
    if (!user?.school_id || !header) return;
    try {
      const { data, error } = await supabase.rpc("src_autofill", {
        p_school_id: Number(user.school_id),
        p_school_year: sy,
      });
      if (error) throw error;
      const fill = data as SrcAutofill;

      setSections((prev) => ({
        ...prev,
        enrollment: { ...prev.enrollment, payload: fill.enrollment },
        health: { ...prev.health, payload: fill.health },
        academic_performance: {
          ...prev.academic_performance,
          payload: fill.academic_performance,
        },
        dropouts: { ...prev.dropouts, payload: fill.dropouts },
        promotion: { ...prev.promotion, payload: fill.promotion },
        learner_teacher: {
          ...prev.learner_teacher,
          payload: fill.learner_teacher,
        },
        learner_classroom: {
          ...prev.learner_classroom,
          payload: fill.learner_classroom,
        },
      }));

      setHeader((prev) =>
        prev
          ? {
              ...prev,
              teacher_count: fill.indicators.teacher_count?.toString() ?? "",
              classroom_count:
                fill.indicators.classroom_count?.toString() ?? "",
              dropout_rate: fill.indicators.dropout_rate?.toString() ?? "",
              promotion_rate: fill.indicators.promotion_rate?.toString() ?? "",
            }
          : prev,
      );

      toast.success(
        "Autofilled the derivable sections. Review and correct before submitting.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Autofill failed");
    }
  };

  const handleSave = async (newStatus: SrcStatus) => {
    if (!header) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        status: newStatus,
        sbm_rating: numOrNull(header.sbm_rating),
        cfss_points: numOrNull(header.cfss_points),
        cfss_interpretation: header.cfss_interpretation.trim() || null,
        mooe_amount: numOrNull(header.mooe_amount),
        dropout_rate: numOrNull(header.dropout_rate),
        promotion_rate: numOrNull(header.promotion_rate),
        teacher_count: numOrNull(header.teacher_count),
        classroom_count: numOrNull(header.classroom_count),
        toilet_count: numOrNull(header.toilet_count),
        seat_count: numOrNull(header.seat_count),
        signatories: header.signatories,
      };
      if (newStatus === "submitted") {
        patch.submitted_at = new Date().toISOString();
        if (user?.system_user_id != null) {
          patch.submitted_by_user_id = user.system_user_id;
        }
      }

      const { error: hdrErr } = await supabase
        .from("sms_src_submissions")
        .update(patch)
        .eq("id", header.id);
      if (hdrErr) throw hdrErr;

      const rows = SRC_SECTIONS.map((meta) => ({
        submission_id: header.id,
        section_key: meta.key,
        narrative: sections[meta.key].narrative.trim() || null,
        payload: sections[meta.key].payload,
      }));

      const { error: secErr } = await supabase
        .from("sms_src_sections")
        .upsert(rows, { onConflict: "submission_id,section_key" });
      if (secErr) throw secErr;

      toast.success(
        newStatus === "submitted"
          ? "School Report Card submitted."
          : "Draft saved.",
      );
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    if (!user?.school_id) return;
    setPrinting(true);
    try {
      await generateSchoolReportCard({
        schoolId: String(user.school_id),
        schoolYear: sy,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Print failed");
    } finally {
      setPrinting(false);
    }
  };

  const sbmBand = getSbmBand(numOrNull(header?.sbm_rating ?? ""));
  const isLocked = header?.status === "locked";

  const patchHeader = (patch: Partial<HeaderState>) =>
    setHeader((prev) => (prev ? { ...prev, ...patch } : prev));

  const patchSignatory = (index: number, patch: Partial<SrcSignatory>) =>
    setHeader((prev) =>
      prev
        ? {
            ...prev,
            signatories: prev.signatories.map((s, i) =>
              i === index ? { ...s, ...patch } : s,
            ),
          }
        : prev,
    );

  if (!isSchoolUser) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>School Report Card</CardTitle>
            <CardDescription>
              This report is prepared by a school. Division accounts can view
              published report cards from the division reports module.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">School Report Card</h1>
          <p className="text-sm text-muted-foreground">
            The annual accountability report published to stakeholders. Figures
            are saved as a snapshot — once submitted, later data changes will
            not alter what was signed.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="sy">School Year</Label>
            <Select value={sy} onValueChange={setSy}>
              <SelectTrigger id="sy" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {schoolYearOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {header ? (
            <Badge
              variant={
                header.status === "draft"
                  ? "outline"
                  : header.status === "submitted"
                    ? "default"
                    : "secondary"
              }
            >
              {header.status === "draft"
                ? "Draft"
                : header.status === "submitted"
                  ? "Submitted"
                  : "Locked"}
            </Badge>
          ) : null}
        </div>
      </div>

      {loading || !header ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleAutofill}
              disabled={isLocked || saving}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Autofill from live data
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSave("draft")}
              disabled={isLocked || saving}
            >
              <Save className="mr-2 h-4 w-4" />
              Save draft
            </Button>
            <Button
              onClick={() => handleSave("submitted")}
              disabled={isLocked || saving}
            >
              <Upload className="mr-2 h-4 w-4" />
              Submit
            </Button>
            <Button
              variant="outline"
              onClick={handlePrint}
              disabled={printing}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print PDF
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Indicators</CardTitle>
              <CardDescription>
                Headline figures for sections V, VII, VIII and X–XVI. Teacher
                and classroom counts are autofilled; toilet and seat counts have
                no source in the system and are always entered here.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="sbm">SBM Rating (0.00–3.00)</Label>
                <Input
                  id="sbm"
                  type="number"
                  step="0.01"
                  min="0"
                  max="3"
                  value={header.sbm_rating}
                  onChange={(e) => patchHeader({ sbm_rating: e.target.value })}
                  disabled={isLocked}
                />
                <p className="text-xs text-muted-foreground">
                  {sbmBand
                    ? `Level ${sbmBand.level} — ${sbmBand.description}`
                    : "Level is derived from the rating."}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cfss">CFSS Points</Label>
                <Input
                  id="cfss"
                  type="number"
                  min="0"
                  value={header.cfss_points}
                  onChange={(e) => patchHeader({ cfss_points: e.target.value })}
                  disabled={isLocked}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cfss-interp">CFSS Interpretation</Label>
                <Input
                  id="cfss-interp"
                  value={header.cfss_interpretation}
                  onChange={(e) =>
                    patchHeader({ cfss_interpretation: e.target.value })
                  }
                  disabled={isLocked}
                  placeholder="e.g. Outstanding"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mooe">School MOOE (Php)</Label>
                <Input
                  id="mooe"
                  type="number"
                  step="0.01"
                  min="0"
                  value={header.mooe_amount}
                  onChange={(e) => patchHeader({ mooe_amount: e.target.value })}
                  disabled={isLocked}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dropout">Dropout Rate (%)</Label>
                <Input
                  id="dropout"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={header.dropout_rate}
                  onChange={(e) =>
                    patchHeader({ dropout_rate: e.target.value })
                  }
                  disabled={isLocked}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="promotion">Promotion / Graduation Rate (%)</Label>
                <Input
                  id="promotion"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={header.promotion_rate}
                  onChange={(e) =>
                    patchHeader({ promotion_rate: e.target.value })
                  }
                  disabled={isLocked}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="teachers">Teachers</Label>
                <Input
                  id="teachers"
                  type="number"
                  min="0"
                  value={header.teacher_count}
                  onChange={(e) =>
                    patchHeader({ teacher_count: e.target.value })
                  }
                  disabled={isLocked}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="classrooms">Classrooms</Label>
                <Input
                  id="classrooms"
                  type="number"
                  min="0"
                  value={header.classroom_count}
                  onChange={(e) =>
                    patchHeader({ classroom_count: e.target.value })
                  }
                  disabled={isLocked}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="toilets">Toilets</Label>
                <Input
                  id="toilets"
                  type="number"
                  min="0"
                  value={header.toilet_count}
                  onChange={(e) =>
                    patchHeader({ toilet_count: e.target.value })
                  }
                  disabled={isLocked}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="seats">Seats</Label>
                <Input
                  id="seats"
                  type="number"
                  min="0"
                  value={header.seat_count}
                  onChange={(e) => patchHeader({ seat_count: e.target.value })}
                  disabled={isLocked}
                />
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="profile">
            <TabsList>
              {SRC_SECTION_GROUPS.map((g) => (
                <TabsTrigger key={g.value} value={g.value}>
                  {g.label}
                </TabsTrigger>
              ))}
              <TabsTrigger value="signatories">Signatories</TabsTrigger>
            </TabsList>

            {SRC_SECTION_GROUPS.map((g) => (
              <TabsContent key={g.value} value={g.value} className="space-y-4">
                {SRC_SECTIONS.filter((s) => s.group === g.value).map((meta) => (
                  <SrcSectionCard
                    key={meta.key}
                    meta={meta}
                    payload={sections[meta.key].payload}
                    narrative={sections[meta.key].narrative}
                    disabled={isLocked}
                    onPayloadChange={(payload) =>
                      setSections((prev) => ({
                        ...prev,
                        [meta.key]: { ...prev[meta.key], payload },
                      }))
                    }
                    onNarrativeChange={(narrative) =>
                      setSections((prev) => ({
                        ...prev,
                        [meta.key]: { ...prev[meta.key], narrative },
                      }))
                    }
                  />
                ))}
              </TabsContent>
            ))}

            <TabsContent value="signatories">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Certified Accurate</CardTitle>
                  <CardDescription>
                    The four signatories printed on the last page. Only the
                    school head is known to the system
                    {settings.principal_name
                      ? ` (${settings.principal_name}, from Settings)`
                      : " (set the principal name in Settings)"}
                    ; the rest are entered here.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  {header.signatories.map((sig, index) => {
                    const roleMeta = SRC_SIGNATORY_ROLES.find(
                      (r) => r.value === sig.role,
                    );
                    return (
                      <div key={sig.role} className="space-y-2">
                        <Label>{roleMeta?.label ?? sig.role}</Label>
                        <Input
                          value={sig.name}
                          onChange={(e) =>
                            patchSignatory(index, { name: e.target.value })
                          }
                          disabled={isLocked}
                          placeholder="Full name"
                        />
                        <Input
                          value={sig.title ?? ""}
                          onChange={(e) =>
                            patchSignatory(index, { title: e.target.value })
                          }
                          disabled={isLocked}
                          placeholder="Title"
                        />
                        {sig.role === "school_head" &&
                        !sig.name &&
                        settings.principal_name ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isLocked}
                            onClick={() =>
                              patchSignatory(index, {
                                name: settings.principal_name ?? "",
                                title: settings.principal_title ?? "School Head",
                              })
                            }
                          >
                            Use {settings.principal_name}
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
