import type { SupabaseClient } from "@supabase/supabase-js";
import { leerPropuesta, totalesPropuesta, type Registro } from "./propuesta";
import { evaluar, duplicadasDe, claveFila } from "./semaforo";
import type { Comprobante } from "../types";

export interface ResumenImportacion {
  filas: number; nuevos: number; actualizados: number;
  verdes: number; ambar: number; rojos: number;
  total_base: number; total_igv: number;
  soloEnContaya: number; // comprobantes subidos por el cliente que NO están en el SIRE
}

const NO_EN_SIRE = "No figura en la propuesta del SIRE: confirmar con el cliente";

/**
 * Importa una propuesta del SIRE al periodo del cliente.
 * - Lo VERDE queda validado automáticamente; ámbar/rojo va a la bandeja del contador.
 * - Si el comprobante ya existía (XML del cliente), se cruza y se marca en_sire.
 * - Lo que el cliente subió pero no está en el SIRE se marca para revisión.
 * Es idempotente: importar dos veces el mismo archivo no duplica nada.
 */
export async function importarPropuesta(
  supabase: SupabaseClient, clienteId: string, periodo: string, registro: Registro, datos: Uint8Array | string,
): Promise<ResumenImportacion> {
  const filas = leerPropuesta(datos, registro);
  const tipo = registro === "ventas" ? "venta" : "compra";
  const dup = duplicadasDe(filas);

  const { data: existentes, error: errSel } = await supabase.from("comprobantes")
    .select("*").eq("cliente_id", clienteId).eq("periodo", periodo).eq("tipo", tipo).returns<(Comprobante & { en_sire: boolean })[]>();
  if (errSel) throw new Error("No se pudieron leer los comprobantes existentes.");
  const porClave = new Map((existentes ?? []).map((c) => [`${c.tipo_doc}|${c.contraparte_ruc}|${c.serie_numero}`, c]));

  const r: ResumenImportacion = { filas: filas.length, nuevos: 0, actualizados: 0, verdes: 0, ambar: 0, rojos: 0, total_base: 0, total_igv: 0, soloEnContaya: 0 };
  const nuevos: Record<string, unknown>[] = [];
  const ahora = new Date().toISOString();
  const vistos = new Set<string>();

  for (const f of filas) {
    const clave = claveFila(f);
    if (vistos.has(clave)) continue; // el repetido ya quedó en rojo en su primera aparición
    vistos.add(clave);
    const previo = porClave.get(clave);
    const ev = evaluar(f, registro, { periodo, duplicadas: dup, xmlDelCliente: previo && previo.origen !== "sire" ? { total: Number(previo.total) } : null });
    if (ev.semaforo === "verde") r.verdes++; else if (ev.semaforo === "ambar") r.ambar++; else r.rojos++;

    const datosFila = {
      fecha_emision: f.fecha_emision, contraparte_nombre: f.contraparte_nombre, moneda: f.moneda,
      tipo_cambio: f.tipo_cambio, base_gravada: f.base_gravada, no_gravado: f.no_gravado, igv: f.igv, total: f.total,
      car_sunat: f.car, en_sire: true, semaforo: ev.semaforo, alertas: ev.alertas,
    };

    if (previo) {
      // No pisar lo que el contador ya validó u observó a mano, salvo que el SIRE muestre una diferencia.
      const tocar = previo.estado === "recibido" || ev.semaforo !== "verde";
      const cambios: Record<string, unknown> = tocar
        ? { ...datosFila, ...(ev.semaforo === "verde" && previo.estado === "recibido" ? { estado: "validado", validado_at: ahora } : {}) }
        : { en_sire: true, car_sunat: f.car };
      if (ev.semaforo !== "verde" && previo.estado === "validado") Object.assign(cambios, { estado: "recibido", validado_por: null, validado_at: null });
      const { error } = await supabase.from("comprobantes").update(cambios).eq("id", previo.id);
      if (error) throw new Error(`No se pudo actualizar ${f.serie_numero}.`);
      r.actualizados++;
    } else {
      nuevos.push({
        cliente_id: clienteId, periodo, tipo, tipo_doc: f.tipo_doc, serie_numero: f.serie_numero,
        contraparte_ruc: f.contraparte_doc, origen: "sire", ...datosFila,
        estado: ev.semaforo === "verde" ? "validado" : "recibido",
        validado_at: ev.semaforo === "verde" ? ahora : null,
      });
    }
  }

  for (let i = 0; i < nuevos.length; i += 200) {
    const { error } = await supabase.from("comprobantes").insert(nuevos.slice(i, i + 200));
    if (error) throw new Error("No se pudieron guardar los comprobantes del SIRE.");
  }
  r.nuevos = nuevos.length;

  // Cruce inverso: lo que el cliente subió y SUNAT no tiene.
  for (const c of existentes ?? []) {
    const clave = `${c.tipo_doc}|${c.contraparte_ruc}|${c.serie_numero}`;
    if (vistos.has(clave) || c.origen === "sire") continue;
    r.soloEnContaya++;
    if (!c.alertas.includes(NO_EN_SIRE)) {
      await supabase.from("comprobantes").update({ alertas: [...c.alertas, NO_EN_SIRE], semaforo: "ambar", en_sire: false }).eq("id", c.id);
    }
  }

  const t = totalesPropuesta(filas);
  r.total_base = t.base; r.total_igv = t.igv;
  return r;
}
