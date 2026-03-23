import { LandingNav } from "@/components/LandingNav";
import { PublicPageBackground } from "@/components/PublicPageBackground";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen relative">
      <PublicPageBackground />
      <LandingNav />
      {children}
    </main>
  );
}
