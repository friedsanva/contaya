import { r2 } from "./format";
import type { Comprobante } from "./types";

/**
 * Liquidación mensual de IGV y pago a cuenta de Renta. Funciones puras.
 * Solo cuentan los comprobantes VALIDADOS por el contador.
 * Notas de crédito (07) restan. Montos en moneda extranjera se convierten con su tipo de cambio.
 */

type ComprobanteCalc = Pick<Comprobante, "tipo" | "tipo_doc" | "estado" | "moneda" | "tipo_cambio" | "base_gravada" | "no_gravado" | "igv">;

export interface ParametrosCierre {
  saldo_favor_anterior: number;       // crédito fiscal arrastrado
  percepciones: number;               // del periodo
  retenciones: number;                // del periodo
  saldo_percepciones_anterior: number; // percepciones/retenciones no aplicadas de meses anteriores
  tasa_pago_cuenta: number;           // %
}

export interface Liquidacion {
  ventas_base: number;
  ventas_no_gravadas: number;
  igv_ventas: number;
  compras_base: number;
  igv_compras: number;
  compras_sin_credito: number; // boletas u otros que no dan crédito fiscal
  tributo_resultante: number;  // débito − crédito − saldo anterior (puede ser negativo)
  saldo_favor_siguiente: number;
  percepciones_aplicadas: number;
  percepciones_por_aplicar: number;
  igv_por_pagar: number;
  ingresos_netos: number;
  pago_a_cuenta: number;
  /** Montos redondeados a soles enteros, como se declaran en el Formulario 621 */
  declarar: { igv: number; renta: number };
  pendientes: number; // comprobantes del periodo aún no validados
}

function factor(c: ComprobanteCalc): number {
  const signo = c.tipo_doc === "07" ? -1 : 1;
  const tc = c.moneda === "PEN" ? 1 : Number(c.tipo_cambio) || 0;
  return signo * tc;
}

export function liquidar(comprobantes: ComprobanteCalc[], p: ParametrosCierre): Liquidacion {
  let vb = 0, vng = 0, vi = 0, cb = 0, ci = 0, csc = 0, pend = 0;
  for (const c of comprobantes) {
    if (c.estado !== "validado") { pend++; continue; }
    const f = factor(c);
    if (c.tipo === "venta") {
      vb += c.base_gravada * f;
      vng += c.no_gravado * f;
      vi += c.igv * f;
    } else if (c.tipo_doc === "03") {
      csc += (c.base_gravada + c.igv + c.no_gravado) * f;
    } else {
      cb += c.base_gravada * f;
      ci += c.igv * f;
    }
  }

  const tributo = vi - ci - (p.saldo_favor_anterior || 0);
  const igvAntes = Math.max(0, tributo);
  const disponiblePR = (p.percepciones || 0) + (p.retenciones || 0) + (p.saldo_percepciones_anterior || 0);
  const aplicadas = Math.min(igvAntes, disponiblePR);
  const ingresos = vb + vng;
  const renta = Math.max(0, ingresos) * (p.tasa_pago_cuenta || 0) / 100;
  const pagar = igvAntes - aplicadas;

  return {
    ventas_base: r2(vb),
    ventas_no_gravadas: r2(vng),
    igv_ventas: r2(vi),
    compras_base: r2(cb),
    igv_compras: r2(ci),
    compras_sin_credito: r2(csc),
    tributo_resultante: r2(tributo),
    saldo_favor_siguiente: r2(tributo < 0 ? -tributo : 0),
    percepciones_aplicadas: r2(aplicadas),
    percepciones_por_aplicar: r2(disponiblePR - aplicadas),
    igv_por_pagar: r2(pagar),
    ingresos_netos: r2(ingresos),
    pago_a_cuenta: r2(renta),
    declarar: { igv: Math.round(pagar), renta: Math.round(renta) },
    pendientes: pend,
  };
}

/** Diferencia entre lo validado y lo que muestra la propuesta del SIRE. null si no se ingresó el SIRE. */
export function diferenciaSire(valor: number, sire: number | null): number | null {
  if (sire === null || sire === undefined) return null;
  return r2(Number(sire) - valor);
}
