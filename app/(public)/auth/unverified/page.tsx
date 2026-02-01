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
    <LoginBox message="Account is invalid. Please contact the administrator." />
  );
}
