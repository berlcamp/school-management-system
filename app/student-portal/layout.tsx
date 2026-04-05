import { LandingNav } from "@/components/LandingNav";
import { StudentSessionProvider } from "@/lib/student-portal/context";
import { Toaster } from "react-hot-toast";

export default function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen">
      <LandingNav />
      <StudentSessionProvider>{children}</StudentSessionProvider>
      <Toaster />
    </main>
  );
}
