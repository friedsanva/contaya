import { describe, it, expect } from "vitest";
import { liquidar } from "@/lib/calculos";

const base = { moneda: "PEN", tipo_cambio: null, no_gravado: 0, estado: "validado" as const };
const P = { saldo_favor_anterior: 0, percepciones: 0, retenciones: 0, saldo_percepciones_anterior: 0, tasa_pago_cuenta: 1 };

describe("liquidar", () => {
  it("calcula IGV por pagar y pago a cuenta del 1%", () => {
    const l = liquidar([
      { ...base, tipo: "venta", tipo_doc: "01", base_gravada: 10000, igv: 1800 },
      { ...base, tipo: "compra", tipo_doc: "01", base_gravada: 6000, igv: 1080 },
    ], P);
    expect(l.igv_por_pagar).toBe(720);
    expect(l.pago_a_cuenta).toBe(100);
    expect(l.declarar).toEqual({ igv: 720, renta: 100 });
  });

  it("genera saldo a favor cuando el crédito supera al débito", () => {
    const l = liquidar([
      { ...base, tipo: "venta", tipo_doc: "01", base_gravada: 1000, igv: 180 },
      { ...base, tipo: "compra", tipo_doc: "01", base_gravada: 2000, igv: 360 },
    ], { ...P, saldo_favor_anterior: 50 });
    expect(l.igv_por_pagar).toBe(0);
    expect(l.saldo_favor_siguiente).toBe(230);
  });

  it("aplica percepciones y guarda el exceso para el mes siguiente", () => {
    const l = liquidar([{ ...base, tipo: "venta", tipo_doc: "01", base_gravada: 1000, igv: 180 }],
      { ...P, percepciones: 100, retenciones: 30, saldo_percepciones_anterior: 70 });
    expect(l.percepciones_aplicadas).toBe(180);
    expect(l.percepciones_por_aplicar).toBe(20);
    expect(l.igv_por_pagar).toBe(0);
  });

  it("resta notas de crédito, convierte dólares, excluye boletas de compra y no validados", () => {
    const l = liquidar([
      { ...base, tipo: "venta", tipo_doc: "01", base_gravada: 2000, igv: 360 },
      { ...base, tipo: "venta", tipo_doc: "07", base_gravada: 500, igv: 90 },
      { ...base, tipo: "compra", tipo_doc: "01", moneda: "USD", tipo_cambio: 3.75, base_gravada: 100, igv: 18 },
      { ...base, tipo: "compra", tipo_doc: "03", base_gravada: 100, igv: 18 },
      { ...base, tipo: "compra", tipo_doc: "01", estado: "recibido", base_gravada: 999, igv: 179.82 },
    ], P);
    expect(l.ventas_base).toBe(1500);
    expect(l.igv_ventas).toBe(270);
    expect(l.igv_compras).toBe(67.5);
    expect(l.compras_sin_credito).toBe(118);
    expect(l.igv_por_pagar).toBe(202.5);
    expect(l.declarar.igv).toBe(203);
    expect(l.pendientes).toBe(1);
  });
});
