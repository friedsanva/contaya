import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Diagnóstico: indica SOLO si cada variable existe (sí/no). Nunca muestra valores. */
export function GET() {
  const env = process.env as Record<string, string | undefined>;
  const pub = ["NEXT", "PUBLIC"].join("_") + "_";
  const hay = (n: string) => Boolean(env[n]?.trim());
  return NextResponse.json({
    entorno: "servidor",
    SUPABASE_URL: hay(`${pub}SUPABASE_URL`) || hay("SUPABASE_URL"),
    SUPABASE_ANON_KEY: hay(`${pub}SUPABASE_ANON_KEY`) || hay("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: hay("SUPABASE_SERVICE_ROLE_KEY"),
  });
}
