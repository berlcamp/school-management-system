"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase/client";
import { AlertCircle, ArrowLeft, Loader2, School, Shield } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface SchoolBrand {
  id: string;
  slug: string;
  name: string;
  district: string | null;
}

export default function SchoolLoginPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const router = useRouter();

  const [school, setSchool] = useState<SchoolBrand | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [signInLoading, setSignInLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  // If already signed in, bounce to /home (matches LoginBox behavior).
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.warn("Auth check:", error.message);
      if (data.user) {
        router.replace("/home");
      } else {
        setCheckingSession(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const fetchSchool = useCallback(async () => {
    if (!slug) return;
    const { data, error } = await supabase
      .from("sms_schools")
      .select("id, slug, name, district")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data) {
      setSchool(null);
      setNotFound(true);
      return;
    }
    setSchool(data as SchoolBrand);
  }, [slug]);

  useEffect(() => {
    fetchSchool();
  }, [fetchSchool]);

  useEffect(() => {
    if (!school?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.schema("public").rpc(
        "get_school_landing_hero",
        { p_school_id: String(school.id) },
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
  }, [school?.id]);

  const handleGoogleLogin = async () => {
    setSignInLoading(true);
    setErrorMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        queryParams: {
          prompt: "select_account",
        },
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setSignInLoading(false);
    }
  };

  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-12 text-center max-w-md">
          <p className="text-gray-700 text-lg mb-6">School not found.</p>
          <Link
            href="/schools"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to schools
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`relative min-h-screen flex items-center justify-center px-4 py-16 overflow-hidden ${
        heroImageUrl
          ? "bg-slate-900"
          : "bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900"
      }`}
    >
      {heroImageUrl && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 scale-105"
          style={{
            backgroundImage: `url(${heroImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/65 to-slate-950/85"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,0,0,0)_0%,_rgba(2,6,23,0.55)_100%)]"
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="relative overflow-hidden rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 p-8 sm:p-10 shadow-2xl">
          <div className="space-y-5 text-center pb-7">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/25 border border-emerald-400/30 flex items-center justify-center">
              <Shield className="h-7 w-7 text-emerald-300" strokeWidth={2} />
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/85">
              <School className="h-3.5 w-3.5" />
              School staff sign-in
            </div>

            {school ? (
              <>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white drop-shadow-sm leading-tight">
                  {school.name}
                </h1>
                {school.district && (
                  <p className="text-sm text-white/70">{school.district}</p>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-8 w-3/4 mx-auto bg-white/10" />
                <Skeleton className="h-4 w-1/2 mx-auto bg-white/10" />
              </div>
            )}

            <p className="text-sm text-white/75 pt-1">
              Sign in with your DepEd Google account to continue.
            </p>
          </div>

          <div className="space-y-5 pb-2">
            {errorMessage && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/20 border border-red-400/30 text-red-100 animate-in fade-in-0 slide-in-from-top-2">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <p className="text-sm font-medium flex-1 min-w-0 break-words">
                  {errorMessage}
                </p>
              </div>
            )}

            <Button
              onClick={handleGoogleLogin}
              disabled={signInLoading || checkingSession || !school}
              variant="outline"
              size="lg"
              className="w-full h-14 text-base font-semibold rounded-xl border-2 border-white/35 bg-white/15 hover:bg-white/25 text-white hover:text-white shadow-sm hover:shadow-md transition-all duration-300 ease-out hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:hover:scale-100"
            >
              {signInLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Image
                    src="/icons8-google-100.svg"
                    alt="Google"
                    width={22}
                    height={22}
                    className="shrink-0"
                  />
                  <span>Continue with Google</span>
                </>
              )}
            </Button>

            <p className="text-xs text-white/55 leading-relaxed text-center max-w-[280px] mx-auto">
              Only staff and teachers registered for this school can access the
              system.
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center">
          <Link
            href={slug ? `/schools/${slug}` : "/schools"}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/85 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to school page
          </Link>
        </div>
      </div>
    </main>
  );
}
