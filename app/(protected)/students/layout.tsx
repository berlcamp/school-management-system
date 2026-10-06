"use client";

import { ModuleAccessDenied } from "@/components/ModuleAccessDenied";
import { isNonStaffUserType } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";

/**
 * Keeps a pure ARAL tutor out of the school's learner list. They have no menu
 * entry here, but the page has no role check of its own, so typing the URL
 * opened every learner at their school. Their own learners are on `/tutor`.
 * A teacher who also tutors keeps their own type and is unaffected.
 */
export default function StudentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAppSelector((state) => state.user.user);

  // Still resolving the profile — AuthGuard is already showing its own state.
  if (!user) return <>{children}</>;

  if (isNonStaffUserType(user.type)) return <ModuleAccessDenied />;

  return <>{children}</>;
}
