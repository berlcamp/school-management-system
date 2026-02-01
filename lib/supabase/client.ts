import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ✅ Create a single Supabase instance
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: "procurements", // ✅ Use the custom schema by default
  },
});
