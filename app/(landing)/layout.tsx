import { LandingLayoutShell } from "@/components/LandingLayoutShell";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LandingLayoutShell>{children}</LandingLayoutShell>;
}
