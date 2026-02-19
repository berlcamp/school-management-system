"use client";

import { supabase } from "@/lib/supabase/client";
import { AlertCircle, Loader2, Shield } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LoadingSkeleton from "./LoadingSkeleton";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

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
      {/* Deep layered background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.12),transparent)] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.08),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_0%_100%,rgba(59,130,246,0.08),transparent)] dark:bg-[radial-gradient(ellipse_60%_50%_at_0%_100%,rgba(59,130,246,0.05),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_100%_100%,rgba(16,185,129,0.06),transparent)] dark:bg-[radial-gradient(ellipse_60%_50%_at_100%_100%,rgba(16,185,129,0.04),transparent)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-50/80 via-white to-slate-100/90 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />
      {/* Subtle grid overlay for depth */}
      <div
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      <div className="w-full max-w-md relative z-10">
        <Card className="relative overflow-hidden shadow-2xl shadow-slate-200/50 dark:shadow-none border border-slate-200/80 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl ring-1 ring-slate-900/5 dark:ring-white/5">
          {/* Accent glow at top */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-400/10 dark:bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-400/10 dark:bg-blue-500/5 rounded-full blur-3xl" />

          <CardHeader className="relative space-y-3 text-center pb-8 pt-10">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25 dark:shadow-emerald-600/20 mb-2">
              <Shield className="h-7 w-7 text-white" strokeWidth={2} />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
              School Management System
            </CardTitle>
            <CardDescription className="text-base font-medium text-slate-600 dark:text-slate-400">
              Schools Division of Bayugan City
            </CardDescription>
            <p className="text-sm text-slate-500 dark:text-slate-400 pt-1">
              Sign in to access your account
            </p>
          </CardHeader>

          <CardContent className="relative space-y-6 pb-10">
            {(errorMessage || message) && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50/80 dark:bg-red-950/40 border border-red-200/60 dark:border-red-900/50 text-red-700 dark:text-red-300 animate-in fade-in-0 slide-in-from-top-2">
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
              className="w-full h-14 text-base font-semibold rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500 shadow-sm hover:shadow-md transition-all duration-300 ease-out hover:scale-[1.01] active:scale-[0.99]"
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
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-[280px] mx-auto">
                By continuing, you agree to our terms of service and privacy
                policy
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-10 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
          <Shield className="h-4 w-4 text-emerald-500/80" />
          <p className="text-sm font-medium">
            Secure authentication powered by Google
          </p>
        </div>
      </div>
    </main>
  );
}
