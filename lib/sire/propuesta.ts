import { unzipSync, strFromU8 } from "fflate";
import { r2 } from "../format";

/**
 * Lector de las propuestas del SIRE (RVIE ventas / RCE compras) en TXT o CSV, sueltos o dentro de un ZIP.
 * Se guía por los NOMBRES de las columnas (no por su posición) para no romperse si SUNAT agrega campos.
 * Si falta una columna obligatoria, falla con un mensaje claro: nunca importa a medias.
 */

export type Registro = "ventas" | "compras";

export interface FilaSire {
  car: string | null;
  fecha_emision: string;      // YYYY-MM-DD
  tipo_doc: string;           // 01, 03, 07, 08...
  serie_numero: string;       // SERIE-numero sin ceros a la izquierda
  contraparte_doc: string;
  contraparte_nombre: string;
  base_gravada: number;       // siempre positivo (las NC restan en el cálculo)
  igv: number;
  no_gravado: number;
  total: number;
  moneda: string;
  tipo_cambio: number | null;
  extras: { dgng: number; otros: number; anulado: boolean };
}

export class PropuestaInvalidaError extends Error {}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Normaliza "F001-00000123" o ("F001","123") a "F001-123". Mismo formato para XML y SIRE. */
export function normalizarSerieNumero(serie: string, numero?: string): string {
  let s = serie, n = numero;
  if (n === undefined) {
    const i = serie.lastIndexOf("-");
    if (i < 0) return serie.trim().toUpperCase();
    s = serie.slice(0, i); n = serie.slice(i + 1);
  }
  const num = String(n).trim().replace(/^0+(?=\d)/, "");
  return `${s.trim().toUpperCase()}-${num}`;
}

function aNumero(v: string | undefined): number {
  if (v === undefined) return 0;
  const t = v.trim().replace(/\s/g, "");
  if (!t) return 0;
  const n = Number(t.replace(/,(?=\d{3}(\D|$))/g, ""));
  if (!Number.isFinite(n)) throw new PropuestaInvalidaError(`Monto no válido en la propuesta: "${v}"`);
  return n;
}

function aFecha(v: string): string {
  const t = v.trim();
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  throw new PropuestaInvalidaError(`Fecha no válida en la propuesta: "${v}"`);
}

/** Acepta el contenido del archivo (texto o bytes, TXT/CSV o ZIP) y devuelve el texto del registro. */
export function textoDeArchivo(datos: Uint8Array | string): string {
  if (typeof datos === "string") return datos;
  if (datos[0] === 0x50 && datos[1] === 0x4b) { // "PK": es un ZIP
    const archivos = unzipSync(datos);
    const nombre = Object.keys(archivos).find((n) => /\.(txt|csv)$/i.test(n));
    if (!nombre) throw new PropuestaInvalidaError("El ZIP no contiene un archivo TXT o CSV de propuesta.");
    return strFromU8(archivos[nombre]);
  }
  return strFromU8(datos);
}

type Cols = Record<string, number>;

function ubicar(cab: string[], registro: Registro): Cols {
  const n = cab.map(norm);
  const buscar = (...cands: string[]) => {
    for (const c of cands) { const i = n.indexOf(norm(c)); if (i >= 0) return i; }
    return -1;
  };
  const docId = buscar("Nro Doc Identidad", "Nro Doc. Identidad", "Número Doc Identidad");
  // La razón social de la contraparte es la columna que sigue al documento de identidad
  // (la primera "razón social" del archivo es la del propio contribuyente).
  const nombre = docId >= 0 && n[docId + 1]?.includes("razonsocial") ? docId + 1 : -1;
  const c: Cols = {
    car: buscar("CAR SUNAT", "CAR"),
    fecha: buscar("Fecha de emisión", "Fecha emisión", "Fec. Emisión"),
    tipo: buscar("Tipo CP/Doc.", "Tipo CP/Doc", "Tipo CP"),
    serie: buscar("Serie del CDP", "Serie CDP", "Serie"),
    numero: buscar("Nro CP o Doc. Nro Inicial (Rango)", "Nro CP o Doc. Nro Inicial", "Nro CP", "Número CP"),
    docId, nombre,
    total: buscar("Total CP", "Importe Total", "Total"),
    moneda: buscar("Moneda", "Código Moneda"),
    tc: buscar("Tipo Cambio", "Tipo de Cambio"),
  };
  if (registro === "ventas") {
    Object.assign(c, {
      base: buscar("BI Gravada", "Base Imponible Gravada"),
      dscBase: buscar("Dscto BI"),
      igv: buscar("IGV / IPM", "IGV/IPM", "IGV"),
      dscIgv: buscar("Dscto IGV / IPM", "Dscto IGV/IPM"),
      exp: buscar("Valor Facturado Exportación", "Valor Facturado Exportacion"),
      exo: buscar("Mto Exonerado", "Monto Exonerado"),
      ina: buscar("Mto Inafecto", "Monto Inafecto"),
      isc: buscar("ISC"), ivap: buscar("IVAP"), bivap: buscar("BI Grav IVAP"), icbper: buscar("ICBPER"), otros: buscar("Otros Tributos"),
      estado: buscar("Est. Comp", "Est. Comp.", "Estado Comp"),
    });
  } else {
    Object.assign(c, {
      base: buscar("BI Gravado DG", "BI Gravada DG"),
      igv: buscar("IGV / IPM DG", "IGV/IPM DG"),
      baseDgng: buscar("BI Gravado DGNG"), igvDgng: buscar("IGV / IPM DGNG", "IGV/IPM DGNG"),
      baseDng: buscar("BI Gravado DNG"), igvDng: buscar("IGV / IPM DNG", "IGV/IPM DNG"),
      ng: buscar("Valor Adq. NG", "Valor Adq NG"),
      isc: buscar("ISC"), icbper: buscar("ICBPER"), otros: buscar("Otros Trib/ Cargos", "Otros Trib/Cargos", "Otros Tributos"),
      estado: buscar("Est. Comp.", "Est. Comp"),
    });
  }
  const obligatorias = ["fecha", "tipo", "serie", "numero", "docId", "nombre", "base", "igv", "total"];
  const faltan = obligatorias.filter((k) => c[k] < 0);
  if (faltan.length) {
    throw new PropuestaInvalidaError(
      `El archivo no parece una propuesta de ${registro} del SIRE (faltan columnas: ${faltan.join(", ")}). ` +
      `Descárgalo desde el SIRE con "Exportar" en formato TXT o CSV.`);
  }
  return c;
}

export function leerPropuesta(datos: Uint8Array | string, registro: Registro): FilaSire[] {
  const texto = textoDeArchivo(datos).replace(/^﻿/, "");
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  const iCab = lineas.findIndex((l) => /ruc/i.test(l) && /fecha/i.test(l) && /(serie|cdp)/i.test(l));
  if (iCab < 0) throw new PropuestaInvalidaError("No se encontró la fila de títulos de la propuesta del SIRE.");
  const sep = lineas[iCab].includes("|") ? "|" : lineas[iCab].includes(";") ? ";" : ",";
  const partir = (l: string) => l.split(sep).map((x) => x.replace(/^"(.*)"$/, "$1").trim());
  const c = ubicar(partir(lineas[iCab]), registro);
  const v = (f: string[], k: string) => (c[k] !== undefined && c[k] >= 0 ? f[c[k]] : undefined);
  const abs = (x: number) => Math.abs(x);

  return lineas.slice(iCab + 1).map((l, i) => {
    const f = partir(l);
    if (f.length < 5) throw new PropuestaInvalidaError(`La fila ${i + 2} de la propuesta está incompleta.`);
    const tipo = String(v(f, "tipo") ?? "").padStart(2, "0");
    let base: number, igv: number, noGrav: number, dgng = 0, otros = 0;
    if (registro === "ventas") {
      base = abs(aNumero(v(f, "base"))) - abs(aNumero(v(f, "dscBase")));
      igv = abs(aNumero(v(f, "igv"))) - abs(aNumero(v(f, "dscIgv")));
      noGrav = abs(aNumero(v(f, "exp"))) + abs(aNumero(v(f, "exo"))) + abs(aNumero(v(f, "ina")));
      otros = ["isc", "ivap", "bivap", "icbper", "otros"].reduce((s, k) => s + abs(aNumero(v(f, k))), 0);
    } else {
      dgng = abs(aNumero(v(f, "baseDgng"))) + abs(aNumero(v(f, "igvDgng")));
      base = abs(aNumero(v(f, "base"))) + abs(aNumero(v(f, "baseDgng")));
      igv = abs(aNumero(v(f, "igv"))) + abs(aNumero(v(f, "igvDgng")));
      // Adquisiciones destinadas a operaciones no gravadas: no dan crédito fiscal
      noGrav = abs(aNumero(v(f, "ng"))) + abs(aNumero(v(f, "baseDng"))) + abs(aNumero(v(f, "igvDng")));
      otros = ["isc", "icbper", "otros"].reduce((s, k) => s + abs(aNumero(v(f, k))), 0);
    }
    const tc = aNumero(v(f, "tc"));
    const estado = (v(f, "estado") ?? "").toLowerCase();
    const total = abs(aNumero(v(f, "total")));
    return {
      car: v(f, "car") || null,
      fecha_emision: aFecha(v(f, "fecha") ?? ""),
      tipo_doc: tipo,
      serie_numero: normalizarSerieNumero(v(f, "serie") ?? "", v(f, "numero") ?? ""),
      contraparte_doc: (v(f, "docId") || "-").trim(),
      contraparte_nombre: (v(f, "nombre") || "Cliente varios").trim(),
      base_gravada: r2(base),
      igv: r2(igv),
      no_gravado: r2(noGrav),
      total: r2(total),
      moneda: (v(f, "moneda") || "PEN").toUpperCase(),
      tipo_cambio: tc > 0 ? tc : null,
      extras: { dgng: r2(dgng), otros: r2(otros), anulado: estado.includes("anul") || (total === 0 && base === 0 && igv === 0) },
    };
  });
}

/** Sumas de control para cuadrar la importación contra los totales del SIRE. */
export function totalesPropuesta(filas: FilaSire[]) {
  let base = 0, igv = 0;
  for (const f of filas) {
    const s = (f.tipo_doc === "07" ? -1 : 1) * (f.moneda === "PEN" ? 1 : f.tipo_cambio ?? 0);
    base += f.base_gravada * s; igv += f.igv * s;
  }
  return { filas: filas.length, base: r2(base), igv: r2(igv) };
}
