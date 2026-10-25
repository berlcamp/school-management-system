"use client";

import { ModuleAccessDenied } from "@/components/ModuleAccessDenied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSbfpEnabled } from "@/hooks/useSbfpEnabled";
import { isTeacherRole } from "@/lib/constants";
import {
  SBFP_DIVISION_MANAGER_TYPES,
  SBFP_DIVISION_VIEWER_TYPES,
  SBFP_MANAGER_TYPES,
} from "@/lib/constants/sbfp";
import { useAppSelector } from "@/lib/redux/hook";
import {
  fetchProgram,
  fetchSchoolHeader,
  fetchSchoolSections,
  saveProgram,
  type SbfpProgram,
  type SbfpSection,
} from "@/lib/sbfp/queries";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { ArrowLeft, Soup } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { BeneficiariesTab } from "./components/BeneficiariesTab";
import { DeliveriesTab } from "./components/DeliveriesTab";
import { FeedbackTab } from "./components/FeedbackTab";
import { FeedingTab } from "./components/FeedingTab";
import { FormsTab } from "./components/FormsTab";
import { MonitoringTab } from "./components/MonitoringTab";
import { ProgramTab } from "./components/ProgramTab";
import type { SbfpTabProps } from "./components/types";
import { WeighingTab } from "./components/WeighingTab";

/** School staff who may open the module read-only when they manage nothing. */
const SCHOOL_READER_TYPES = ["registrar", "librarian"];

export default function SbfpPage() {
  // Migration 221: a super admin may switch the whole module off. Checked
  // before the module mounts, because opening it can create the programme.
  const { enabled, loading } = useSbfpEnabled();
  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!enabled) return <SbfpTurnedOff />;
  return <SbfpModule />;
}

function SbfpTurnedOff() {
  const isSuperAdmin = useAppSelector((state) => state.user.user?.type === "super admin");
  return (
    <div className="p-6">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Feeding Program is turned off</CardTitle>
          <CardDescription>
            The division office has switched this module off. Records already encoded are kept.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/home">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          {isSuperAdmin && (
            <Link href="/division/sbfp-settings">
              <Button variant="outline" size="sm">
                Feeding Program Settings
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SbfpModule() {
  const user = useAppSelector((state) => state.user.user);
  const userType = user?.type ?? "";
  const isDivision = (SBFP_DIVISION_VIEWER_TYPES as readonly string[]).includes(userType);
  const isManagerType = (SBFP_MANAGER_TYPES as readonly string[]).includes(userType);
  const allowed =
    isDivision ||
    isManagerType ||
    isTeacherRole(userType) ||
    SCHOOL_READER_TYPES.includes(userType);

  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [pickedSchoolId, setPickedSchoolId] = useState("");
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [program, setProgram] = useState<SbfpProgram | null>(null);
  const [sections, setSections] = useState<SbfpSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("program");

  const schoolId = isDivision
    ? pickedSchoolId
    : user?.school_id != null
      ? String(user.school_id)
      : "";
  const actorId = user?.system_user_id != null ? String(user.system_user_id) : null;
  const isTeacher = isTeacherRole(userType);
  // Migration 210: a manager or any teacher of the school may open the
  // programme; the first one to arrive does, and the head completes the header.
  const canOpen = !isDivision && (isManagerType || isTeacher);

  useEffect(() => {
    if (!isDivision) return;
    let isMounted = true;
    supabase
      .from("sms_schools")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (isMounted) {
          setSchools((data ?? []).map((s) => ({ id: String(s.id), name: s.name })));
        }
      });
    return () => {
      isMounted = false;
    };
  }, [isDivision]);

  const load = useCallback(async () => {
    if (!schoolId) {
      setProgram(null);
      setSections([]);
      return;
    }
    setLoading(true);
    try {
      const [found, s] = await Promise.all([
        fetchProgram(schoolId, schoolYear),
        fetchSchoolSections(schoolId, schoolYear),
      ]);
      let p = found;
      if (!p && canOpen) {
        try {
          const school = await fetchSchoolHeader(schoolId);
          p = await saveProgram(
            {
              school_id: schoolId,
              school_year: schoolYear,
              region: school.region,
              division_name: null,
              district: school.district,
              municipality_barangay:
                [school.municipality_city, school.barangay].filter(Boolean).join(" / ") || null,
              focal_person_id: null,
              focal_person_name: null,
              feeding_start_date: null,
              feeding_end_date: null,
              baseline_weighing_date: null,
              midline_weighing_date: null,
              endline_weighing_date: null,
              is_last_mile_school: null,
            },
            null,
            actorId,
          );
        } catch {
          // A colleague opened it at the same moment (unique school + year).
          p = await fetchProgram(schoolId, schoolYear);
        }
      }
      setProgram(p);
      // A teacher's advisory sections come first in every section picker.
      setSections(
        isTeacher && actorId
          ? [...s].sort(
              (a, b) =>
                Number(b.section_adviser_id === actorId) - Number(a.section_adviser_id === actorId),
            )
          : s,
      );
    } catch (err) {
      console.error("Error loading SBFP programme:", err);
      toast.error("Failed to load the feeding programme");
    } finally {
      setLoading(false);
    }
  }, [schoolId, schoolYear, canOpen, isTeacher, actorId]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) await load();
    })();
    return () => {
      isMounted = false;
    };
  }, [load]);

  // The database (migration 209) is the permission; this only decides what the
  // screen offers. The focal person is a designation on the programme row.
  const isFocalPerson =
    program?.focal_person_id != null && program.focal_person_id === actorId;
  const canManage = !isDivision && (isManagerType || isFocalPerson);

  const recordableSectionIds = useMemo(() => {
    if (isDivision) return new Set<string>();
    // A teacher may encode a learner from any section of the school; what they
    // see afterwards is only what they encoded (RLS, migration 210).
    if (canManage || isTeacher) return new Set(sections.map((s) => s.id));
    return new Set<string>();
  }, [isDivision, canManage, isTeacher, sections]);
  const ownRecordsOnly = !canManage && isTeacher;
  // Migration 212's rule, reused by the monitoring tools (220).
  const canLog = canManage || (!isDivision && isTeacher);
  const isDivisionManager = (SBFP_DIVISION_MANAGER_TYPES as readonly string[]).includes(userType);

  if (!user) return null;
  if (!allowed) return <ModuleAccessDenied />;

  const tabProps: SbfpTabProps = {
    schoolId,
    schoolYear,
    program,
    sections,
    canManage,
    recordableSectionIds,
    ownRecordsOnly,
    actorId,
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <Soup className="h-5 w-5" />
          School-Based Feeding Program
        </h1>
      </div>

      <div className="app__content space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              SBFP {schoolYear}
              {canManage && <Badge variant="secondary">You manage this programme</Badge>}
              {ownRecordsOnly && (
                <Badge variant="outline">Showing only the learners you encoded</Badge>
              )}
              {!canManage && !ownRecordsOnly && (
                <Badge variant="outline">Read only</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Select beneficiaries, weigh them at baseline, midline and endline,
              record daily feeding and deliveries (including hot meals), file the
              daily monitoring tools, and print SBFP Forms 1A–6. Baseline and endline
              weighings can be copied from Learner Health.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {isDivision && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">School</label>
                  <Select value={pickedSchoolId} onValueChange={setPickedSchoolId}>
                    <SelectTrigger className="w-[300px]">
                      <SelectValue placeholder="Select school" />
                    </SelectTrigger>
                    <SelectContent>
                      {schools.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">School Year</label>
                <Select value={schoolYear} onValueChange={setSchoolYear}>
                  <SelectTrigger className="w-[140px]">
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
            </div>
          </CardContent>
        </Card>

        {!schoolId ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Select a school to view its feeding programme.
          </p>
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="program">Program</TabsTrigger>
              <TabsTrigger value="beneficiaries" disabled={!program}>
                Beneficiaries
              </TabsTrigger>
              <TabsTrigger value="weighing" disabled={!program}>
                Weighing
              </TabsTrigger>
              <TabsTrigger value="feeding" disabled={!program}>
                Daily Feeding
              </TabsTrigger>
              <TabsTrigger value="deliveries" disabled={!program}>
                Deliveries
              </TabsTrigger>
              <TabsTrigger value="monitoring" disabled={!program}>
                Monitoring
              </TabsTrigger>
              <TabsTrigger value="feedback" disabled={!program}>
                Feedback Mechanism
              </TabsTrigger>
              <TabsTrigger value="forms" disabled={!program}>
                Forms
              </TabsTrigger>
            </TabsList>
            <TabsContent value="program">
              <ProgramTab
                {...tabProps}
                canAssignFocal={!isDivision && isManagerType}
                onSaved={setProgram}
              />
            </TabsContent>
            {program && (
              <>
                <TabsContent value="beneficiaries">
                  <BeneficiariesTab {...tabProps} />
                </TabsContent>
                <TabsContent value="weighing">
                  <WeighingTab {...tabProps} />
                </TabsContent>
                <TabsContent value="feeding">
                  <FeedingTab {...tabProps} />
                </TabsContent>
                <TabsContent value="deliveries">
                  <DeliveriesTab {...tabProps} />
                </TabsContent>
                <TabsContent value="monitoring">
                  <MonitoringTab
                    {...tabProps}
                    canLog={canLog}
                    isDivisionManager={isDivisionManager}
                  />
                </TabsContent>
                <TabsContent value="feedback">
                  <FeedbackTab {...tabProps} canLog={canLog} />
                </TabsContent>
                <TabsContent value="forms">
                  <FormsTab {...tabProps} />
                </TabsContent>
              </>
            )}
          </Tabs>
        )}
      </div>
    </div>
  );
}
