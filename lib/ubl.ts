import { XMLParser } from "fast-xml-parser";
import { r2 } from "./format";
import { periodoDeFecha } from "./periodo";
import type { TipoRegistro } from "./types";

/**
 * Lector de comprobantes electrónicos SUNAT (UBL 2.1, y lo básico de 2.0).
 * Soporta Factura/Boleta (Invoice), Nota de Crédito (CreditNote) y Nota de Débito (DebitNote).
 * Es una función pura: no toca la base de datos, para poder probarla.
 */

export interface ComprobanteLeido {
  tipo_doc: string; // 01, 03, 07, 08
  serie_numero: string;
  fecha_emision: string; // YYYY-MM-DD
  moneda: string;
  emisor: { ruc: string; nombre: string };
  receptor: { doc: string; tipoDoc: string; nombre: string };
  base_gravada: number;
  no_gravado: number;
  igv: number;
  total: number;
  referencia: string | null; // comprobante que modifica (notas)
}

export class XmlInvalidoError extends Error {}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false, // conservar ceros a la izquierda (RUC, series)
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ["TaxTotal", "TaxSubtotal", "PartyIdentification", "PartyName", "InvoiceLine", "CreditNoteLine", "DebitNoteLine", "BillingReference"].includes(name),
});

type Nodo = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function txt(n: Nodo): string {
  if (n === undefined || n === null) return "";
  if (typeof n === "string" || typeof n === "number") return String(n).trim();
  if (Array.isArray(n)) return txt(n[0]);
  if (typeof n === "object" && "#text" in n) return String(n["#text"]).trim();
  return "";
}

function num(n: Nodo): number {
  const v = parseFloat(txt(n).replace(/,/g, ""));
  return Number.isFinite(v) ? v : 0;
}

function primero<T>(x: T | T[] | undefined): T | undefined {
  return Array.isArray(x) ? x[0] : x;
}

function leerParte(party: Nodo, legacyId?: Nodo): { id: string; tipoDoc: string; nombre: string } {
  const p = party?.Party ?? party;
  const ident = primero(p?.PartyIdentification);
  let id = txt(ident?.ID);
  let tipoDoc = ident?.ID?.["@_schemeID"] ?? "";
  if (!id && legacyId) {
    id = txt(legacyId);
    tipoDoc = legacyId?.["@_schemeID"] ?? txt(party?.AdditionalAccountID);
  }
  const nombre = txt(p?.PartyLegalEntity?.RegistrationName) || txt(primero(p?.PartyName)?.Name) || "";
  return { id, tipoDoc: String(tipoDoc), nombre };
}

export function leerUBL(xml: string): ComprobanteLeido {
  let doc: Nodo;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new XmlInvalidoError("El archivo no es un XML válido.");
  }
  const rootName = ["Invoice", "CreditNote", "DebitNote"].find((k) => doc && doc[k]);
  if (!rootName) throw new XmlInvalidoError("El XML no es un comprobante electrónico (factura, boleta o nota).");
  const r = doc[rootName];

  const tipo_doc =
    rootName === "CreditNote" ? "07" : rootName === "DebitNote" ? "08" : txt(r.InvoiceTypeCode) || "01";
  const serie_numero = txt(r.ID);
  const fecha_emision = txt(r.IssueDate);
  if (!serie_numero || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_emision)) {
    throw new XmlInvalidoError("Al XML le falta la serie-número o la fecha de emisión.");
  }

  const sup = leerParte(r.AccountingSupplierParty, r.AccountingSupplierParty?.CustomerAssignedAccountID);
  const cus = leerParte(r.AccountingCustomerParty, r.AccountingCustomerParty?.CustomerAssignedAccountID);
  if (!sup.id) throw new XmlInvalidoError("No se encontró el RUC del emisor en el XML.");

  // Impuestos por tributo (catálogo 05 SUNAT): 1000 IGV, 9995 exportación, 9997 exonerado, 9998 inafecto.
  let base = 0, igv = 0, noGrav = 0, haySub = false;
  const taxTotals: Nodo[] = r.TaxTotal ?? [];
  for (const tt of taxTotals) {
    for (const st of tt.TaxSubtotal ?? []) {
      haySub = true;
      const codigo = txt(st?.TaxCategory?.TaxScheme?.ID);
      if (codigo === "1000") {
        base += num(st.TaxableAmount);
        igv += num(st.TaxAmount);
      } else if (["9995", "9997", "9998"].includes(codigo)) {
        noGrav += num(st.TaxableAmount);
      }
    }
  }
  const totales = r.LegalMonetaryTotal ?? r.RequestedMonetaryTotal ?? {};
  if (!haySub) {
    base = num(totales.LineExtensionAmount);
    igv = taxTotals.reduce((s, t) => s + num(t.TaxAmount), 0);
  }
  const total = num(totales.PayableAmount) || r2(base + igv + noGrav);

  const ref = primero(r.BillingReference)?.InvoiceDocumentReference?.ID;

  return {
    tipo_doc,
    serie_numero,
    fecha_emision,
    moneda: txt(r.DocumentCurrencyCode) || "PEN",
    emisor: { ruc: sup.id, nombre: sup.nombre },
    receptor: { doc: cus.id, tipoDoc: cus.tipoDoc, nombre: cus.nombre },
    base_gravada: r2(base),
    no_gravado: r2(noGrav),
    igv: r2(igv),
    total: r2(total),
    referencia: ref ? txt(ref) : null,
  };
}

/** Decide si el comprobante es venta o compra para el cliente dueño del RUC. */
export function clasificar(c: ComprobanteLeido, rucCliente: string): { tipo: TipoRegistro; contraparte_ruc: string; contraparte_nombre: string } {
  if (c.emisor.ruc === rucCliente) {
    return { tipo: "venta", contraparte_ruc: c.receptor.doc || "-", contraparte_nombre: c.receptor.nombre || "Cliente varios" };
  }
  if (c.receptor.doc === rucCliente) {
    return { tipo: "compra", contraparte_ruc: c.emisor.ruc, contraparte_nombre: c.emisor.nombre || "(sin razón social)" };
  }
  throw new XmlInvalidoError(`El RUC ${rucCliente} no figura como emisor ni como receptor de este comprobante.`);
}

/** Alertas para que el contador revise. No bloquean la carga. */
export function alertasDe(c: ComprobanteLeido, tipo: TipoRegistro, periodo: string): string[] {
  const a: string[] = [];
  const pf = periodoDeFecha(c.fecha_emision);
  if (tipo === "venta" && pf !== periodo) a.push(`Fecha de emisión (${c.fecha_emision}) fuera del periodo ${periodo}`);
  if (tipo === "compra" && pf > periodo) a.push(`Emitido después del periodo ${periodo}`);
  if (tipo === "compra" && pf < periodo) a.push(`Emitido en ${pf}: verificar plazo de anotación del crédito fiscal`);
  if (c.moneda !== "PEN") a.push(`Comprobante en ${c.moneda}: registrar el tipo de cambio`);
  if (tipo === "compra" && c.tipo_doc === "03") a.push("Boleta de venta: no otorga crédito fiscal");
  if (c.base_gravada > 0) {
    const t18 = Math.abs(c.base_gravada * 0.18 - c.igv);
    const t10 = Math.abs(c.base_gravada * 0.1 - c.igv); // tasa reducida restaurantes/hoteles MYPE
    if (t18 > 1 && t10 > 1) a.push("El IGV no coincide con la base imponible");
  }
  return a;
}
