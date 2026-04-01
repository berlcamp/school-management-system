import { LandingNav } from "@/components/LandingNav";

export default function RequestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen">
      <LandingNav />
      {children}
    </main>
  );
}
