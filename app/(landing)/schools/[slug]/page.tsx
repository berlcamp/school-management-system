"use client";

import {
  EnrollmentStatCards,
  GradeLevelChart,
  type EnrollmentStats,
} from "@/components/landing/EnrollmentFigures";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase/client";
import {
  fetchPublicEnrollmentCounts,
  gradeBand,
  PUBLIC_GRADE_LEVELS,
} from "@/lib/utils/publicEnrollment";
import { ArrowLeft, LogIn, MapPin, School, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";

interface SchoolInfo {
  id: string;
  school_id: string;
  slug: string;
  name: string;
  school_type: string | null;
  address: string | null;
  district: string | null;
}

const getDefaultSchoolYear = getCurrentSchoolYear;

/**
 * The school page's own top bar. The landing nav is hidden on /schools/[slug]
 * (LandingLayoutShell), so this carries the way back to the school list and
 * the school's sign-in, in the page flow rather than floating over the hero.
 */
function SchoolTopBar({ loginHref }: { loginHref: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-900/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/schools"
          className="inline-flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span className="relative size-7 shrink-0 rounded-md bg-white/10 p-0.5">
            <Image src="/deped-logo.svg" alt="" fill className="object-contain" />
          </span>
          All schools
        </Link>
        <Link
          href={loginHref}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <LogIn className="size-4" aria-hidden="true" />
          Sign in
        </Link>
      </div>
    </header>
  );
}

export default function SchoolDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const schoolDbId = school?.id ?? null;
  const schoolYear = getDefaultSchoolYear();
  const [stats, setStats] = useState<EnrollmentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const loginHref = slug ? `/schools/${slug}/login` : "/schools";

  const fetchSchool = useCallback(async () => {
    if (!slug) return;
    const { data, error } = await supabase
      .from("sms_schools")
      .select("id, school_id, slug, name, school_type, address, district")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data) {
      setSchool(null);
      setNotFound(true);
      return;
    }
    setSchool(data as SchoolInfo);
  }, [slug]);

  const fetchStats = useCallback(async () => {
    if (!schoolDbId) return;
    setLoading(true);
    try {
      // schoolDbId is the sms_schools.id PK, typed string here but BIGINT in
      // the database — the RPC keys on the number.
      const counts = await fetchPublicEnrollmentCounts(
        schoolYear,
        Number(schoolDbId),
      );

      let male = 0;
      let female = 0;
      const elem = { male: 0, female: 0, total: 0 };
      const jhs = { male: 0, female: 0, total: 0 };
      const shs = { male: 0, female: 0, total: 0 };
      const byGrade = PUBLIC_GRADE_LEVELS.map((grade) => ({ grade, count: 0 }));
      const byGradeIndex = new Map(byGrade.map((g) => [g.grade, g]));

      for (const c of counts) {
        const learners = c.male + c.female;

        male += c.male;
        female += c.female;

        // Elementary here is labelled "SNED / Kinder – Grade 6", so it takes
        // both the kinder and elementary bands.
        const band = gradeBand(c.grade_level);
        const bucket =
          band === "kinder" || band === "elementary"
            ? elem
            : band === "juniorHigh"
              ? jhs
              : band === "seniorHigh"
                ? shs
                : null;

        if (bucket) {
          bucket.male += c.male;
          bucket.female += c.female;
          bucket.total += learners;
        }

        const gradeEntry = byGradeIndex.get(c.grade_level);
        if (gradeEntry) gradeEntry.count += learners;
      }

      setStats({
        male,
        female,
        total: male + female,
        elementary: elem,
        juniorHigh: jhs,
        seniorHigh: shs,
        byGradeLevel: byGrade,
      });
    } catch (err) {
      console.error("Stats fetch error:", err);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [schoolDbId, schoolYear]);

  useEffect(() => {
    fetchSchool();
  }, [fetchSchool]);

  useEffect(() => {
    if (!schoolDbId) return;
    let cancelled = false;
    (async () => {
      // Function lives in `public`; default client uses procurements for .from()
      const { data, error } = await supabase.schema("public").rpc(
        "get_school_landing_hero",
        { p_school_id: String(schoolDbId) },
      );
      if (cancelled) return;
      if (error) {
        console.warn("Landing hero URL:", error.message);
        setHeroImageUrl(null);
        return;
      }
      if (typeof data === "string" && data.trim().length > 0) {
        setHeroImageUrl(data.trim());
      } else {
        setHeroImageUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolDbId]);

  useEffect(() => {
    if (school) {
      fetchStats();
    } else if (!slug) {
      setLoading(false);
    }
  }, [school, fetchStats, slug]);

  if (!slug || notFound) {
    return (
      <div className="min-h-screen bg-slate-50">
        <SchoolTopBar loginHref={loginHref} />
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-xs">
            <School className="mx-auto size-8 text-slate-400" aria-hidden="true" />
            <h1 className="mt-3 text-lg font-semibold text-slate-900">School not found</h1>
            <p className="mt-1 text-sm text-slate-600">
              The link may be out of date, or the school is no longer listed.
            </p>
            <Link
              href="/schools"
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Browse all schools
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="min-h-screen bg-slate-50">
        <SchoolTopBar loginHref={loginHref} />
        <div className="bg-slate-800">
          <div className="mx-auto max-w-7xl space-y-4 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <Skeleton className="h-6 w-32 rounded-full bg-white/10" />
            <Skeleton className="h-12 w-full max-w-xl bg-white/10" />
            <Skeleton className="h-5 w-64 bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  const chip =
    "inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white sm:text-sm";

  return (
    <div className="min-h-screen bg-slate-50">
      <SchoolTopBar loginHref={loginHref} />

      <section
        className={`relative isolate overflow-hidden ${heroImageUrl ? "bg-slate-900" : "bg-slate-800"}`}
      >
        {heroImageUrl && (
          <div
            className="absolute inset-0 -z-10 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImageUrl})` }}
            aria-hidden="true"
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950/95 via-slate-950/70 to-slate-950/50"
        />

        <div className="mx-auto flex min-h-[320px] max-w-7xl flex-col justify-end px-4 pb-10 pt-14 sm:min-h-[420px] sm:px-6 sm:pb-14 lg:min-h-[480px] lg:px-8 lg:pb-16">
          <div className="max-w-4xl space-y-4 animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/90">
              <School className="size-3.5" aria-hidden="true" />
              School profile
            </p>
            <h1 className="text-balance break-words text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              {school.name}
            </h1>
            {school.address && (
              <p className="flex max-w-3xl items-start gap-2 text-base text-white/90 sm:text-lg">
                <MapPin className="mt-1 size-5 shrink-0 text-white/70" aria-hidden="true" />
                <span>{school.address}</span>
              </p>
            )}
            <ul className="flex flex-wrap items-center gap-2 pt-1" aria-label="School details">
              <li className={chip}>School ID {school.school_id}</li>
              {school.district && <li className={chip}>{school.district}</li>}
              <li className={chip}>SY {schoolYear}</li>
            </ul>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="school-enrollment-heading"
        className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8"
      >
        <div className="mb-6 flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-xs">
            <Users className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="school-enrollment-heading" className="text-xl font-bold text-slate-900">
              Enrollment
            </h2>
            <p className="text-sm text-slate-600">
              Learners currently enrolled · SY {schoolYear}
            </p>
          </div>
        </div>

        <EnrollmentStatCards stats={stats} loading={loading} hideEmpty />

        <div className="mt-6 sm:mt-8">
          <GradeLevelChart
            stats={stats}
            loading={loading}
            schoolYear={schoolYear}
            description={`Approved enrollments · SY ${schoolYear}`}
            hideEmpty
          />
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-8 text-center sm:flex-row sm:px-6 sm:text-left lg:px-8">
          <p className="text-sm text-slate-600">
            Department of Education &mdash; Schools Division of Bayugan City
          </p>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center rounded-md px-3 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Division home
          </Link>
        </div>
      </footer>
    </div>
  );
}
