import type { SupabaseClient } from "@supabase/supabase-js";
import { leerUBL, clasificar, alertasDe, XmlInvalidoError } from "./ubl";
import type { Cliente } from "./types";

export interface ResultadoCarga {
  archivo: string;
  ok: boolean;
  mensaje: string;
}

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Lee un XML, lo guarda en el almacenamiento privado y registra el comprobante.
 * Se ejecuta con la sesión del usuario: los permisos (RLS) de Supabase deciden si puede hacerlo.
 */
export async function registrarXml(
  supabase: SupabaseClient,
  cliente: Pick<Cliente, "id" | "ruc">,
  periodo: string,
  archivo: File,
  usuarioId: string,
): Promise<ResultadoCarga> {
  const nombre = archivo.name;
  try {
    if (archivo.size > MAX_BYTES) return { archivo: nombre, ok: false, mensaje: "El archivo pesa más de 2 MB." };
    const xml = await archivo.text();
    const c = leerUBL(xml);
    const k = clasificar(c, cliente.ruc);
    const alertas = alertasDe(c, k.tipo, periodo);

    const ruta = `${cliente.id}/${periodo}/${k.tipo}-${c.tipo_doc}-${k.contraparte_ruc}-${c.serie_numero}.xml`.replace(/[^\w./-]/g, "_");

    const { error: errIns } = await supabase.from("comprobantes").insert({
      cliente_id: cliente.id,
      periodo,
      tipo: k.tipo,
      tipo_doc: c.tipo_doc,
      serie_numero: c.serie_numero,
      fecha_emision: c.fecha_emision,
      contraparte_ruc: k.contraparte_ruc,
      contraparte_nombre: k.contraparte_nombre,
      moneda: c.moneda,
      base_gravada: c.base_gravada,
      no_gravado: c.no_gravado,
      igv: c.igv,
      total: c.total,
      alertas,
      archivo_path: ruta,
      origen: "xml",
      subido_por: usuarioId,
    });
    if (errIns) {
      if (errIns.code === "23505") return { archivo: nombre, ok: false, mensaje: `${c.serie_numero} ya estaba registrado.` };
      return { archivo: nombre, ok: false, mensaje: "No se pudo registrar el comprobante." };
    }

    const { error: errUp } = await supabase.storage.from("comprobantes").upload(ruta, new Blob([xml], { type: "text/xml" }), { upsert: false, contentType: "text/xml" });
    const nota = errUp ? " (el archivo original no se pudo guardar)" : "";
    const tipoTxt = k.tipo === "venta" ? "venta" : "compra";
    return { archivo: nombre, ok: true, mensaje: `${c.serie_numero} registrado como ${tipoTxt}${alertas.length ? " · con alertas" : ""}${nota}.` };
  } catch (e) {
    if (e instanceof XmlInvalidoError) return { archivo: nombre, ok: false, mensaje: e.message };
    return { archivo: nombre, ok: false, mensaje: "No se pudo leer el archivo." };
  }
}
