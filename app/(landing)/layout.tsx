import { LandingNav } from "@/components/LandingNav";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-gray-100 dark:bg-gray-900 pt-[8.5rem]">
        {children}
      </main>
    </>
  );
}
