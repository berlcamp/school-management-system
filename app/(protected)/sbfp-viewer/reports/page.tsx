"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchDivisionSchools,
  fetchProgram,
  fetchSchoolSections,
  type SbfpProgram,
  type SbfpSection,
} from "@/lib/sbfp/queries";
import { mdy } from "@/lib/pdf/generateSbfpForms";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import type { SbfpSchoolOption } from "@/lib/utils/sbfp";
import { AlertCircle, CalendarRange, FileBarChart, MapPin, School, UserRound } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { DeliveriesTab } from "../../sbfp/components/DeliveriesTab";
import { FeedbackTab } from "../../sbfp/components/FeedbackTab";
import { FormsTab } from "../../sbfp/components/FormsTab";
import { MonitoringTab } from "../../sbfp/components/MonitoringTab";
import type { SbfpTabProps } from "../../sbfp/components/types";
import { SchoolPicker } from "../components/SchoolPicker";
import { SchoolYearSelect } from "../components/ViewerFilters";

const NO_SECTIONS: ReadonlySet<string> = new Set();

export default function SbfpViewerReportsPage() {
  return (
    <Suspense fallback={null}>
      <SbfpViewerReports />
    </Suspense>
  );
}

/**
 * One school's feeding programme, read-only (migration 222): the issued SBFP
 * forms, deliveries and hot meals, the four monitoring tools and the feedback
 * log — the same tabs the school works in, mounted with every write switched
 * off. The database refuses an SBFP Viewer's writes regardless (222's
 * restrictive policies); these props only keep the buttons from being offered.
 *
 * The school and year live in the URL so a dashboard row can link straight
 * here and the back button behaves.
 */
function SbfpViewerReports() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const schoolId = params.get("school") ?? "";
  const schoolYear = params.get("sy") ?? getCurrentSchoolYear();

  const [schools, setSchools] = useState<SbfpSchoolOption[]>([]);
  const [program, setProgram] = useState<SbfpProgram | null>(null);
  const [sections, setSections] = useState<SbfpSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("forms");

  const setParam = useCallback(
    (next: { school?: string; sy?: string }) => {
      const q = new URLSearchParams(params.toString());
      if (next.school !== undefined) q.set("school", next.school);
      if (next.sy !== undefined) q.set("sy", next.sy);
      router.replace(`${pathname}?${q.toString()}`);
    },
    [params, pathname, router],
  );

  useEffect(() => {
    let isMounted = true;
    fetchDivisionSchools()
      .then((s) => isMounted && setSchools(s))
      .catch((err: unknown) => console.error("Error loading schools:", err));
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!schoolId) {
      setProgram(null);
      setSections([]);
      return;
    }
    let isMounted = true;
    setLoading(true);
    setError(null);
    Promise.all([fetchProgram(schoolId, schoolYear), fetchSchoolSections(schoolId, schoolYear)])
      .then(([p, s]) => {
        if (!isMounted) return;
        setProgram(p);
        setSections(s);
      })
      .catch((err: unknown) => {
        console.error("Error loading the school's feeding programme:", err);
        if (isMounted) setError("This school's feeding programme could not be loaded. Please try again.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [schoolId, schoolYear]);

  const school = schools.find((s) => s.id === schoolId);

  const tabProps: SbfpTabProps = {
    schoolId,
    schoolYear,
    program,
    sections,
    canManage: false,
    recordableSectionIds: NO_SECTIONS,
    ownRecordsOnly: false,
    actorId: null,
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-sky-800">School-Based Feeding Program</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">School reports</h1>
        <p className="mt-1 text-sm text-slate-600">
          View and print a school&apos;s SBFP forms, deliveries, monitoring logs and feedback.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <SchoolPicker schools={schools} value={schoolId} onChange={(id) => setParam({ school: id })} />
        <SchoolYearSelect id="sbfp-reports-sy" value={schoolYear} onChange={(sy) => setParam({ sy })} />
      </div>

      {!schoolId ? (
        <EmptyState
          title="Choose a school"
          body="Pick a school above, or open one from the Schools table on the dashboard."
        />
      ) : error ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-11 w-96 max-w-full" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : !program ? (
        <EmptyState
          title="No feeding programme yet"
          body={`${school?.name ?? "This school"} has not opened a feeding programme for SY ${schoolYear}.`}
        />
      ) : (
        <>
          <dl className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            <Fact icon={School} label="School" value={school?.name ?? "—"} />
            <Fact icon={MapPin} label="District" value={program.district || school?.district || "—"} />
            <Fact icon={UserRound} label="SBFP focal person" value={program.focal_person_name || "Not designated"} />
            <Fact
              icon={CalendarRange}
              label="Feeding period"
              value={
                program.feeding_start_date
                  ? `${mdy(program.feeding_start_date)} – ${program.feeding_end_date ? mdy(program.feeding_end_date) : "ongoing"}`
                  : "Not set"
              }
            />
          </dl>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="forms">SBFP Forms</TabsTrigger>
              <TabsTrigger value="deliveries">Deliveries &amp; Hot Meals</TabsTrigger>
              <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
              <TabsTrigger value="feedback">Feedback</TabsTrigger>
            </TabsList>
            <TabsContent value="forms">
              <FormsTab {...tabProps} />
            </TabsContent>
            <TabsContent value="deliveries">
              <DeliveriesTab {...tabProps} />
            </TabsContent>
            <TabsContent value="monitoring">
              <MonitoringTab {...tabProps} canLog={false} isDivisionManager={false} />
            </TabsContent>
            <TabsContent value="feedback">
              <FeedbackTab {...tabProps} canLog={false} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof School; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50">
        <Icon className="h-4 w-4 text-sky-800" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-slate-500">{label}</dt>
        <dd className="truncate text-sm font-medium text-slate-900">{value}</dd>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <FileBarChart className="h-6 w-6 text-slate-600" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{body}</p>
    </section>
  );
}
