import { PublicPageBackground } from "@/components/PublicPageBackground";
import { Button } from "@/components/ui/button";
import { FileQuestion, Home, LogIn, UserCircle } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-4 py-16">
      <PublicPageBackground />

      <div className="w-full max-w-lg relative z-10 animate-fade-up">
        <div className="relative overflow-hidden rounded-3xl bg-white/15 backdrop-blur-xl border border-white/25 p-8 sm:p-10 shadow-2xl text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/30 border border-emerald-400/30 flex items-center justify-center mb-6">
            <FileQuestion className="h-8 w-8 text-emerald-300" strokeWidth={2} />
          </div>

          <p className="text-7xl sm:text-8xl font-bold tracking-tight text-white tabular-nums leading-none mb-2">
            404
          </p>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90 mb-4">
            Page not found
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight mb-3">
            This page isn&apos;t here
          </h1>
          <p className="text-sm sm:text-base text-white/75 leading-relaxed max-w-sm mx-auto mb-8">
            The address may be wrong, the page was moved, or you don&apos;t have
            access. Check the URL or go back to a known area of the site.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              asChild
              size="lg"
              className="rounded-xl font-semibold bg-white text-slate-900 hover:bg-white/90 shadow-md"
            >
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                Division home
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-xl font-semibold border-2 border-white/35 bg-white/10 hover:bg-white/20 text-white hover:text-white"
            >
              <Link href="/login">
                <LogIn className="h-4 w-4 mr-2" />
                Staff login
              </Link>
            </Button>
          </div>

          <div className="mt-6 pt-6 border-t border-white/15">
            <Link
              href="/student-portal"
              className="inline-flex items-center gap-2 text-sm font-medium text-white/85 hover:text-white transition-colors"
            >
              <UserCircle className="h-4 w-4 text-violet-300/90" />
              Student portal
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-white/55">
          Schools Division of Bayugan City · DepEd
        </p>
      </div>
    </main>
  );
}
