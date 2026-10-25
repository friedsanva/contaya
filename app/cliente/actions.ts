"use server";
import { exigirCliente } from "@/lib/sesion";
import { registrarXml, type ResultadoCarga } from "@/lib/registrar";
import { esPeriodo } from "@/lib/periodo";

export async function subirXmlCliente(form: FormData): Promise<ResultadoCarga[]> {
  const { supabase, user, cliente } = await exigirCliente();
  const periodo = form.get("periodo");
  if (!esPeriodo(periodo)) return [{ archivo: "", ok: false, mensaje: "Periodo no válido." }];
  const archivos = form.getAll("archivos").filter((f): f is File => f instanceof File).slice(0, 50);
  const out: ResultadoCarga[] = [];
  for (const a of archivos) out.push(await registrarXml(supabase, cliente, periodo, a, user.id));
  return out;
}
