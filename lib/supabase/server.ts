import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getSupabaseClient() {
  const cookieStore = await cookies(); // ✅ Always get fresh cookies

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: {
        schema: "public", // ✅ Use the custom schema by default
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, { ...options, secure: true }); // ✅ Ensure cookies persist in HTTPS
            });
          } catch {
            // Ignore if called from a Server Component
          }
        },
      },
    }
  );
}
