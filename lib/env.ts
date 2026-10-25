/**
 * Lee la configuración en el momento en que se usa (no al construir la app).
 * Vercel no entrega las variables "sensibles" durante la construcción, y Next.js reemplaza
 * `process.env.NEXT_PUBLIC_*` escrito literalmente por su valor de ese momento. Por eso se lee
 * con un nombre armado en tiempo de ejecución. Supabase solo se usa en el servidor.
 */
function leer(...nombres: string[]): string {
  const env = process.env as Record<string, string | undefined>;
  for (const n of nombres) {
    const v = env[n]?.trim();
    if (v) return v;
  }
  throw new Error(`Falta la variable de entorno ${nombres[0]}. Revísala en Vercel → Settings → Environment Variables.`);
}

const PUB = ["NEXT", "PUBLIC"].join("_") + "_";

export const supabaseUrl = () => leer("SUPABASE_URL", `${PUB}SUPABASE_URL`);
export const supabaseAnonKey = () => leer("SUPABASE_ANON_KEY", `${PUB}SUPABASE_ANON_KEY`);
export const supabaseServiceKey = () => leer("SUPABASE_SERVICE_ROLE_KEY");
