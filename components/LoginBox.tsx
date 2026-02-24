"use client";

import { PublicPageBackground } from "@/components/PublicPageBackground";
import { supabase } from "@/lib/supabase/client";
import { AlertCircle, Loader2, Shield } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LoadingSkeleton from "./LoadingSkeleton";
import { Button } from "./ui/button";

interface LoginBoxProps {
  message?: string;
}

export default function LoginBox({ message }: LoginBoxProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) console.warn("Auth error:", error.message);
      if (data.user) router.push("/home");
      setCheckingSession(false);
    };

    checkSession();
  }, [router]);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
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
      setIsLoading(false);
    }
  };

  if (checkingSession) {
    return <LoadingSkeleton />;
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-4 py-12">
      <PublicPageBackground />

      <div className="w-full max-w-md relative z-10">
        <div className="relative overflow-hidden rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 p-8 sm:p-10 shadow-xl">
          <div className="space-y-6 text-center pb-8">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/30 border border-emerald-400/30 flex items-center justify-center mb-2">
              <Shield className="h-7 w-7 text-emerald-300" strokeWidth={2} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              School Management System
            </h1>
            <p className="text-base font-medium text-white/80">
              Schools Division of Bayugan City
            </p>
            <p className="text-sm text-white/60 pt-1">
              Sign in to access your account
            </p>
          </div>

          <div className="relative space-y-6 pb-6">
            {(errorMessage || message) && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/20 border border-red-400/30 text-red-200 animate-in fade-in-0 slide-in-from-top-2">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {errorMessage || message}
                  </p>
                </div>
              </div>
            )}

            <Button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              variant="outline"
              size="lg"
              className="w-full h-14 text-base font-semibold rounded-xl border-2 border-white/30 bg-white/10 hover:bg-white/20 text-white hover:text-white shadow-sm hover:shadow-md transition-all duration-300 ease-out hover:scale-[1.01] active:scale-[0.99]"
            >
              {isLoading ? (
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

            <div className="text-center pt-2">
              <p className="text-xs text-white/50 leading-relaxed max-w-[280px] mx-auto">
                By continuing, you agree to our terms of service and privacy
                policy
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4">
          <div className="flex items-center justify-center gap-2 text-white/60">
            <Shield className="h-4 w-4 text-emerald-400/80" />
            <p className="text-sm font-medium">
              Secure authentication powered by Google
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-white/80 hover:text-white transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
