import { createServerClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey } from "@/lib/env";
import { cookies } from "next/headers";

/** Cliente de Supabase para Server Components, Server Actions y Route Handlers (usa la sesión del usuario). */
export function supabaseServer() {
  const store = cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // llamado desde un Server Component: el middleware ya refresca la sesión
        }
      },
    },
  });
}
