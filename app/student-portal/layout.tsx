import { PublicPageBackground } from "@/components/PublicPageBackground";
import { StudentSessionProvider } from "@/lib/student-portal/context";

export default function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen relative">
      <PublicPageBackground />
      <StudentSessionProvider>{children}</StudentSessionProvider>
    </main>
  );
}
