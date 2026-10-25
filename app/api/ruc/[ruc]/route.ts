import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { rucValido, normalizarRuc, type DatosRuc } from "@/lib/ruc";

export const dynamic = "force-dynamic";

async function pedir(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers: { Accept: "application/json", ...headers }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  return (await r.json().catch(() => null)) as Record<string, unknown> | null;
}

/**
 * Consulta la razón social de un RUC. Solo para el contador.
 * Con DECOLECTA_TOKEN usa Decolecta (RUC 10 y 20, en línea). Sin token, usa OpenRUC (solo RUC 20, padrón).
 */
export async function GET(_req: Request, { params }: { params: { ruc: string } }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", user.id).single();
  if (perfil?.rol !== "contador") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const ruc = params.ruc;
  if (!rucValido(ruc)) return NextResponse.json({ error: "El RUC no es válido (revisa los 11 dígitos)." }, { status: 422 });

  let datos: DatosRuc | null = null;
  try {
    const token = (process.env as Record<string, string | undefined>).DECOLECTA_TOKEN?.trim();
    if (token) {
      const d = await pedir(`https://api.decolecta.com/v1/sunat/ruc?numero=${ruc}`, { Authorization: `Bearer ${token}` });
      if (d) datos = normalizarRuc(ruc, d, "Decolecta");
    }
    if (!datos && ruc.startsWith("20")) {
      const d = await pedir(`https://openruc.com/api/ruc/${ruc}`);
      if (d) datos = normalizarRuc(ruc, d, "OpenRUC");
    }
  } catch {
    // proveedor caído o lento: el contador escribe la razón social a mano
  }

  if (!datos) {
    const msg = ruc.startsWith("10") && !(process.env as Record<string, string | undefined>).DECOLECTA_TOKEN
      ? "Para RUC 10 se necesita configurar DECOLECTA_TOKEN. Escribe la razón social a mano."
      : "No se encontró el RUC. Escribe la razón social a mano.";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
  return NextResponse.json(datos);
}
