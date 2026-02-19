import { LandingNav } from "@/components/LandingNav";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <LandingNav />
      <main className="min-h-screen pt-[8.5rem] bg-gradient-to-b from-slate-50 via-slate-100/50 to-slate-200/30 dark:from-slate-950 dark:via-slate-900/80 dark:to-slate-900">
        {children}
      </main>
    </>
  );
}
