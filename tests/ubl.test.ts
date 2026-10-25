import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { leerUBL, clasificar, alertasDe, XmlInvalidoError } from "@/lib/ubl";

const fx = (f: string) => readFileSync(path.join(__dirname, "fixtures", f), "utf8");

describe("leerUBL", () => {
  it("lee una factura UBL 2.1 con base gravada y exonerada", () => {
    const c = leerUBL(fx("factura-venta.xml"));
    expect(c.tipo_doc).toBe("01");
    expect(c.serie_numero).toBe("F001-00000123");
    expect(c.fecha_emision).toBe("2026-11-05");
    expect(c.emisor.ruc).toBe("20601234561");
    expect(c.receptor.doc).toBe("20452393493");
    expect(c.base_gravada).toBe(1000);
    expect(c.no_gravado).toBe(50);
    expect(c.igv).toBe(180);
    expect(c.total).toBe(1230);
  });

  it("lee una nota de crédito en dólares con su referencia", () => {
    const c = leerUBL(fx("nota-credito-compra.xml"));
    expect(c.tipo_doc).toBe("07");
    expect(c.moneda).toBe("USD");
    expect(c.referencia).toBe("F001-00009876");
    expect(c.igv).toBe(18);
  });

  it("rechaza archivos que no son comprobantes", () => {
    expect(() => leerUBL("<hola/>")).toThrow(XmlInvalidoError);
    expect(() => leerUBL("esto no es xml <<<")).toThrow(XmlInvalidoError);
  });
});

describe("clasificar y alertas", () => {
  it("es venta cuando el cliente es el emisor", () => {
    const c = leerUBL(fx("factura-venta.xml"));
    expect(clasificar(c, "20601234561").tipo).toBe("venta");
    expect(alertasDe(c, "venta", "2026-11")).toEqual([]);
    expect(alertasDe(c, "venta", "2026-10")[0]).toMatch(/fuera del periodo/);
  });

  it("es compra cuando el cliente es el receptor; avisa moneda extranjera", () => {
    const c = leerUBL(fx("nota-credito-compra.xml"));
    const k = clasificar(c, "20601234561");
    expect(k.tipo).toBe("compra");
    expect(k.contraparte_ruc).toBe("20100070970");
    expect(alertasDe(c, "compra", "2026-11").join(" ")).toMatch(/USD/);
  });

  it("falla si el RUC no participa en el comprobante", () => {
    const c = leerUBL(fx("factura-venta.xml"));
    expect(() => clasificar(c, "20999999999")).toThrow(/no figura/);
  });
});
