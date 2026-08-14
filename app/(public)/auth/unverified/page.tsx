import LoginBox from "@/components/LoginBox";
import { NO_PORTAL_ACCESS_MESSAGE } from "@/lib/constants";
import { getSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const supabase = await getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  // `?reason=no-access` means the account is real but its role holds no login
  // (Accounting) — telling them to "try again" would just loop them.
  const { reason } = await searchParams;
  const message =
    reason === "no-access"
      ? NO_PORTAL_ACCESS_MESSAGE
      : "Authentication failed. Please try again or contact the administrator.";

  return <LoginBox message={message} />;
}
