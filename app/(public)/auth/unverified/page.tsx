import LoginBox from "@/components/LoginBox";
import { getSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <LoginBox message="Authentication failed. Please try again or contact the administrator." />
  );
}
