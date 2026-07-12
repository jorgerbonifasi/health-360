import { createClient } from "@supabase/supabase-js";

// Anon client. RLS on the database allows SELECT-only for anon on the data tables (oauth_tokens
// is not exposed). All writes happen server-side via Edge Functions using the service role.
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Surface a clear message rather than a cryptic network error.
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy web/.env.example to web/.env.local.",
  );
}

// Fall back to a placeholder so createClient() doesn't throw at import time when env is unset;
// the resulting queries fail and the UI shows a helpful error card instead of a blank screen.
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key",
);
