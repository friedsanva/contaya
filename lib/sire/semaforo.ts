import type { FilaSire, Registro } from "./propuesta";

export type Semaforo = "verde" | "ambar" | "rojo";

export interface Evaluacion {
  semaforo: Semaforo;
  alertas: string[]; // lo que el contador debe ver; las notas informativas empiezan con "ℹ"
}

export interface ContextoSemaforo {
  periodo: string;                     // YYYY-MM
  duplicadas: Set<string>;             // claves repetidas dentro del mismo archivo
  xmlDelCliente?: { total: number } | null; // si el cliente subió el XML de este comprobante
}

const ORDEN: Record<Semaforo, number> = { verde: 0, ambar: 1, rojo: 2 };
const peor = (a: Semaforo, b: Semaforo) => (ORDEN[b] > ORDEN[a] ? b : a);

export const claveFila = (f: Pick<FilaSire, "tipo_doc" | "contraparte_doc" | "serie_numero">) =>
  `${f.tipo_doc}|${f.contraparte_doc}|${f.serie_numero}`;

/**
 * Reglas del semáforo (ver docs/proceso-mensual.md). Solo lo VERDE se valida solo.
 * Toda regla nueva debe llevar su prueba en tests/semaforo.test.ts.
 */
export function evaluar(f: FilaSire, registro: Registro, ctx: ContextoSemaforo): Evaluacion {
  let s: Semaforo = "verde";
  const a: string[] = [];
  const marcar = (nivel: Semaforo, msg: string) => { s = peor(s, nivel); a.push(msg); };

  if (ctx.duplicadas.has(claveFila(f))) marcar("rojo", "Comprobante repetido en la propuesta");
  if (f.extras.anulado) marcar("ambar", "Importe cero o anulado: confirmar que no deba registrarse");

  if (f.base_gravada > 0) {
    const d18 = Math.abs(f.base_gravada * 0.18 - f.igv);
    const d10 = Math.abs(f.base_gravada * 0.10 - f.igv); // tasa MYPE restaurantes/hoteles
    if (d18 > 1 && d10 > 1) marcar("rojo", "El IGV no coincide con la base imponible");
  } else if (f.igv > 0) {
    marcar("rojo", "Tiene IGV pero no base imponible");
  }

  if (f.moneda !== "PEN" && !f.tipo_cambio) marcar("ambar", `Comprobante en ${f.moneda} sin tipo de cambio`);

  const pf = f.fecha_emision.slice(0, 7);
  if (registro === "ventas" && pf !== ctx.periodo) marcar("ambar", `Fecha de emisión (${f.fecha_emision}) fuera del periodo`);
  if (registro === "compras" && pf > ctx.periodo) marcar("rojo", "Emitido después del periodo");
  if (registro === "compras" && pf < ctx.periodo) a.push(`ℹ Emitido en ${pf}: dentro del plazo de anotación`);

  if (registro === "compras") {
    if (f.tipo_doc === "03" && f.igv > 0) marcar("ambar", "Boleta de venta: no otorga crédito fiscal");
    if (f.extras.dgng > 0) marcar("ambar", "Destinada a operaciones gravadas y no gravadas: requiere prorrata");
    const enSoles = f.moneda === "PEN" ? f.total : f.total * (f.tipo_cambio ?? 0);
    if (enSoles >= 2000) a.push("ℹ Monto ≥ S/ 2,000: el pago debe hacerse por medio bancario (bancarización)");
  }
  if (f.extras.otros > 0) marcar("ambar", "Incluye ISC, IVAP u otros tributos: revisar");

  if (ctx.xmlDelCliente && Math.abs(ctx.xmlDelCliente.total - f.total) > 0.05) {
    marcar("ambar", `El XML del cliente (${ctx.xmlDelCliente.total.toFixed(2)}) no coincide con SUNAT (${f.total.toFixed(2)})`);
  }
  return { semaforo: s, alertas: a };
}

/** Claves que aparecen más de una vez en el archivo. */
export function duplicadasDe(filas: FilaSire[]): Set<string> {
  const vistos = new Set<string>(), dup = new Set<string>();
  for (const f of filas) { const k = claveFila(f); if (vistos.has(k)) dup.add(k); vistos.add(k); }
  return dup;
}
