// Service-role Supabase client for Edge Functions.
// The service role bypasses RLS, which is exactly what our ingestion writers need. NEVER expose
// this key to the browser — it is only ever read from the function's environment.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type { SupabaseClient };
