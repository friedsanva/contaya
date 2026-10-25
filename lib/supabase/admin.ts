import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseServiceKey } from "@/lib/env";

/** Cliente con la llave de servidor. SOLO para acciones del contador ya verificadas (invitar usuarios). */
export function supabaseAdmin() {
  return createClient(supabaseUrl(), supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
