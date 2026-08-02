"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { fetchSchoolSettings } from "@/lib/utils/schoolSettings";
import { fromDatetimeLocal } from "@/lib/utils/supervision";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { Loader2, Plus, Telescope } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ObservationPanel } from "../../supervision/components/ObservationPanel";
import { ScheduleCard } from "../../supervision/components/ScheduleCard";
import {
  ScheduleModal,
  type ScheduleFormValues,
} from "../../supervision/components/ScheduleModal";
import {
  useDesignatedObservers,
  useSupervisionSchedules,
  useSupervisionStaff,
} from "../../supervision/useSupervision";

/**
 * The teacher's own view of instructional supervision.
 *
 * Two tabs, because a master teacher is routinely both:
 *   "My observations"      — slots where this user is the teacher observed. They
 *                            may suggest a schedule; the School Head approves.
 *   "Observations I conduct" — slots where this user is an assigned observer.
 *                            COT forms are restricted to their own sheet, so one
 *                            observer cannot edit another's rating.
 */
export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const schoolId = user?.school_id ?? null;
  const userId = user?.id ?? null;

  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const { staff } = useSupervisionStaff(schoolId);
  const { observers: designated } = useDesignatedObservers(schoolId, schoolYear);

  // Every schedule at the school for the year: the observer tab needs slots
  // where this user is an observer, not the teacher, so it cannot be filtered
  // by teacher_id at the query level.
  const { bundles, loading, reload } = useSupervisionSchedules({
    schoolId,
    schoolYear,
  });

  const [school, setSchool] = useState<{ name: string; address: string } | null>(
    null,
  );
  const [principal, setPrincipal] = useState<{ name: string; title: string }>({
    name: "",
    title: "Principal",
  });

  useEffect(() => {
    let isMounted = true;
    if (schoolId == null) return;
    (async () => {
      const [{ data }, settings] = await Promise.all([
        supabase
          .from("sms_schools")
          .select("name, address")
          .eq("id", Number(schoolId))
          .maybeSingle(),
        fetchSchoolSettings(String(schoolId)),
      ]);
      if (!isMounted) return;
      setSchool({
        name: (data?.name as string) ?? "",
        address: (data?.address as string) ?? "",
      });
      setPrincipal({
        name: settings.principal_name ?? "",
        title: settings.principal_title ?? "Principal",
      });
    })();
    return () => {
      isMounted = false;
    };
  }, [schoolId]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const me = userId ? staffById.get(String(userId)) ?? null : null;

  const mine = useMemo(
    () =>
      bundles.filter((b) => String(b.schedule.teacher_id) === String(userId)),
    [bundles, userId],
  );

  const toObserve = useMemo(
    () =>
      bundles.filter((b) =>
        b.observers.some((o) => String(o.user_id) === String(userId)),
      ),
    [bundles, userId],
  );

  const isDesignated = useMemo(
    () =>
      designated.some(
        (o) => o.is_active && String(o.user_id) === String(userId),
      ),
    [designated, userId],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const propose = async (values: ScheduleFormValues) => {
    if (schoolId == null || userId == null) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("sms_supervision_schedules")
        .insert({
          school_id: Number(schoolId),
          school_year: schoolYear,
          term: values.term,
          teacher_id: Number(userId),
          teacher_position: values.teacher_position || null,
          career_stage: values.career_stage,
          supervision_type: values.supervision_type,
          observation_round: values.observation_round,
          quarter: values.quarter,
          class_label: values.class_label || null,
          pre_conference_at: fromDatetimeLocal(values.pre_conference_at),
          observation_at: fromDatetimeLocal(values.observation_at),
          observation_end_at: fromDatetimeLocal(values.observation_end_at),
          focus_kra: values.focus_kra || null,
          focus_indicator: values.focus_indicator || null,
          lesson_plan_url: values.lesson_plan_url || null,
          notes: values.notes || null,
          status: "proposed",
          proposed_by: Number(userId),
        });
      if (error) throw new Error(error.message);
      toast.success("Suggested schedule sent for approval.");
      setModalOpen(false);
      reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to submit the schedule.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderList = (
    list: typeof bundles,
    empty: string,
    restrictObserver: boolean,
  ) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading…
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {empty}
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        {list.map((bundle) => (
          <ScheduleCard
            key={String(bundle.schedule.id)}
            bundle={bundle}
            staffById={staffById}
            schoolName={school?.name}
            schoolAddress={school?.address}
            principalName={principal.name}
            principalTitle={principal.title}
            onExported={reload}
          >
            <ObservationPanel
              bundle={bundle}
              teacherName={
                staffById.get(String(bundle.schedule.teacher_id))?.name ?? ""
              }
              staffById={staffById}
              schoolName={school?.name}
              schoolAddress={school?.address}
              restrictToObserverId={
                restrictObserver ? String(userId ?? "") : undefined
              }
              currentUserId={userId ?? null}
              onChanged={reload}
            />
          </ScheduleCard>
        ))}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Telescope className="h-6 w-6" />
            Instructional Supervision
          </h1>
          <p className="text-sm text-muted-foreground">
            Suggest when you would like to be observed, then add the approved slot
            to your calendar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-36">
            <Select value={schoolYear} onValueChange={setSchoolYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getSchoolYearOptions().map((sy) => (
                  <SelectItem key={sy} value={sy}>
                    {sy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Suggest schedule
          </Button>
        </div>
      </div>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">
            My observations
            {mine.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {mine.length}
              </Badge>
            )}
          </TabsTrigger>
          {isDesignated && (
            <TabsTrigger value="conduct">
              Observations I conduct
              {toObserve.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {toObserve.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="mine" className="mt-4">
          {renderList(
            mine,
            "No observation schedules yet. Suggest one and the School Head will approve it.",
            false,
          )}
        </TabsContent>

        {isDesignated && (
          <TabsContent value="conduct" className="mt-4">
            {renderList(
              toObserve,
              "You have not been assigned to observe anyone this school year.",
              true,
            )}
          </TabsContent>
        )}
      </Tabs>

      <ScheduleModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        schoolYear={schoolYear}
        existing={null}
        staff={staff}
        observerPool={[]}
        lockedTeacher={me}
        submitting={submitting}
        onSubmit={propose}
      />
    </div>
  );
}
