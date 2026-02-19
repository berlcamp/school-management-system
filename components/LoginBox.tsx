"use client";

import { supabase } from "@/lib/supabase/client";
import { AlertCircle, Loader2 } from "lucide-react";
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
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 px-4 py-12">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border bg-card/95 backdrop-blur-sm">
          <CardHeader className="space-y-4 text-center pb-6">
            <CardTitle className="text-3xl font-bold tracking-tight">
              School Management System
            </CardTitle>
            <CardDescription className="text-base">
              Schools Division of Bayugan City
            </CardDescription>
            <p className="text-sm text-muted-foreground pt-2">
              Sign in to access your account
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {(errorMessage || message) && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive animate-in fade-in-0 slide-in-from-top-2">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="flex-1">
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
              className="w-full h-12 text-base font-medium shadow-sm hover:shadow-md transition-all duration-200 border-2 hover:border-primary/20 dark:hover:border-primary/30"
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
                    width={20}
                    height={20}
                    className="shrink-0"
                  />
                  <span>Continue with Google</span>
                </>
              )}
            </Button>

            <div className="text-center pt-4">
              <p className="text-xs text-muted-foreground">
                By continuing, you agree to our terms of service and privacy
                policy
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            Secure authentication powered by Google
          </p>
        </div>
      </div>
    </main>
  );
}
