import type { SupabaseClient } from "@supabase/supabase-js";
import type { Comprobante } from "../types";
import { aplicarValidez, armarConsulta, consultarValidez, tokenValidez, ValidezError, PREFIJO } from "./validez";

export interface ResumenValidez {
  revisados: number;      // consultados con respuesta de SUNAT
  ok: number;             // siguen igual (válidos)
  ambar: number;
  rojos: number;
  noConsultables: number; // tipos que el servicio no cubre (se anota el motivo)
  pendientes: number;     // quedan sin verificar (tiempo agotado o error de SUNAT)
  error: string | null;
}

type Fila = Pick<Comprobante, "id" | "tipo" | "tipo_doc" | "serie_numero" | "fecha_emision" | "contraparte_ruc" | "total" | "semaforo" | "alertas" | "estado">;

/**
 * Consulta en SUNAT la validez de los comprobantes del periodo que aún no se verificaron.
 * Trabaja por tandas con límite de tiempo: si quedan pendientes, se vuelve a llamar.
 * `fetch` es inyectable para las pruebas.
 */
export async function verificarPeriodo(
  supabase: SupabaseClient, cliente: { id: string; ruc: string }, periodo: string,
  cred: { client_id: string; client_secret: string },
  opts: { fetch?: typeof fetch; maxMs?: number; paralelo?: number } = {},
): Promise<ResumenValidez> {
  const f = opts.fetch ?? fetch;
  const fin = Date.now() + (opts.maxMs ?? 25000);
  const r: ResumenValidez = { revisados: 0, ok: 0, ambar: 0, rojos: 0, noConsultables: 0, pendientes: 0, error: null };

  const { data, error } = await supabase.from("comprobantes")
    .select("id,tipo,tipo_doc,serie_numero,fecha_emision,contraparte_ruc,total,semaforo,alertas,estado")
    .eq("cliente_id", cliente.id).eq("periodo", periodo).is("validez_at", null).returns<Fila[]>();
  if (error) throw new Error("No se pudieron leer los comprobantes del periodo.");
  const cola = [...(data ?? [])];
  if (!cola.length) return r;

  let token: string;
  try { token = await tokenValidez(cred.client_id, cred.client_secret, f); } catch (e) {
    r.pendientes = cola.length;
    r.error = e instanceof ValidezError ? e.message : "No se pudo conectar con SUNAT.";
    return r;
  }

  let erroresSeguidos = 0;
  const trabajar = async () => {
    for (;;) {
      if (Date.now() > fin || erroresSeguidos >= 3) return;
      const c = cola.shift();
      if (!c) return;
      const ahora = new Date().toISOString();
      const q = armarConsulta(c, cliente.ruc);
      if ("motivo" in q) {
        const nota = `ℹ ${PREFIJO} validez no consultada: ${q.motivo}`;
        await supabase.from("comprobantes").update({
          validez_at: ahora, validez_motivo: q.motivo,
          alertas: [...c.alertas.filter((x) => !x.startsWith(`ℹ ${PREFIJO}`)), nota],
        }).eq("id", c.id);
        r.noConsultables++;
        continue;
      }
      try {
        const v = await consultarValidez(token, cliente.ruc, q.consulta, f);
        erroresSeguidos = 0;
        const m = aplicarValidez({ semaforo: c.semaforo, alertas: c.alertas, estado: c.estado }, v, c.tipo);
        const cambios: Record<string, unknown> = { validez_sunat: v, validez_at: ahora, validez_motivo: null, semaforo: m.semaforo, alertas: m.alertas };
        if (m.vuelveABandeja) Object.assign(cambios, { estado: "recibido", validado_por: null, validado_at: null });
        const { error: errUp } = await supabase.from("comprobantes").update(cambios).eq("id", c.id);
        if (errUp) throw new Error("db");
        r.revisados++;
        if (m.semaforo === "rojo" && c.semaforo !== "rojo") r.rojos++;
        else if (m.semaforo === "ambar" && c.semaforo === "verde") r.ambar++;
        else r.ok++;
      } catch (e) {
        erroresSeguidos++;
        r.pendientes++;
        r.error = e instanceof ValidezError ? e.message : "Error al guardar el resultado de SUNAT.";
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.paralelo ?? 4) }, trabajar));
  r.pendientes += cola.length;
  if (r.pendientes === 0) r.error = null;
  return r;
}

export function mensajeValidez(r: ResumenValidez): string {
  const partes = [`Validez SUNAT: ${r.revisados} consultados`];
  if (r.rojos) partes.push(`${r.rojos} pasan a rojo`);
  if (r.ambar) partes.push(`${r.ambar} pasan a ámbar`);
  if (r.noConsultables) partes.push(`${r.noConsultables} no consultables`);
  if (r.pendientes) partes.push(`${r.pendientes} pendientes (vuelve a presionar "Verificar validez")`);
  return partes.join(" · ") + (r.error ? `\n${r.error}` : "");
}
