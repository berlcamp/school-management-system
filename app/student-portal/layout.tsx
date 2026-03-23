import { LandingNav } from "@/components/LandingNav";
import { StudentSessionProvider } from "@/lib/student-portal/context";

export default function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen">
      <LandingNav />
      <StudentSessionProvider>{children}</StudentSessionProvider>
    </main>
  );
}
