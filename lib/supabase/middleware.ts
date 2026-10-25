import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLICAS = ["/login", "/auth", "/api/salud"];

function config(): { url: string; key: string } | null {
  const env = process.env as Record<string, string | undefined>;
  const pub = ["NEXT", "PUBLIC"].join("_") + "_";
  const url = (env[`${pub}SUPABASE_URL`] || env.SUPABASE_URL || "").trim();
  const key = (env[`${pub}SUPABASE_ANON_KEY`] || env.SUPABASE_ANON_KEY || "").trim();
  return url && key ? { url, key } : null;
}

export async function actualizarSesion(request: NextRequest) {
  const ruta = request.nextUrl.pathname;
  if (ruta.startsWith("/api/salud")) return NextResponse.next();

  const cfg = config();
  // Si el middleware no recibe la configuración, no tumbar la app:
  // las páginas igual verifican la sesión en el servidor.
  if (!cfg) {
    console.warn("Middleware sin configuración de Supabase; se omite el refresco de sesión.");
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !PUBLICAS.some((p) => ruta.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
