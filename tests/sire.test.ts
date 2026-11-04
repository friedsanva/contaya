import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { leerPropuesta, totalesPropuesta, normalizarSerieNumero, PropuestaInvalidaError } from "@/lib/sire/propuesta";
import { evaluar, duplicadasDe } from "@/lib/sire/semaforo";

const fx = (f: string) => readFileSync(path.join(__dirname, "fixtures", "sire", f), "utf8");

describe("normalizarSerieNumero", () => {
  it("unifica el formato de XML y SIRE", () => {
    expect(normalizarSerieNumero("F001-00000123")).toBe("F001-123");
    expect(normalizarSerieNumero("e001", "0000088")).toBe("E001-88");
    expect(normalizarSerieNumero("F001", "0")).toBe("F001-0");
  });
});

describe("propuesta RVIE (ventas)", () => {
  const filas = leerPropuesta(fx("rvie-202610.txt"), "ventas");
  it("lee todas las filas y la razón social de la contraparte (no la propia)", () => {
    expect(filas).toHaveLength(3);
    expect(filas[0].contraparte_nombre).toBe("SUPERINTENDENCIA NACIONAL");
    expect(filas[0].serie_numero).toBe("E001-123");
    expect(filas[0].fecha_emision).toBe("2026-10-05");
  });
  it("guarda la nota de crédito en positivo y la resta en los totales", () => {
    expect(filas[1].tipo_doc).toBe("07");
    expect(filas[1].base_gravada).toBe(1000);
    const t = totalesPropuesta(filas);
    expect(t.base).toBe(10000 - 1000 + 500 * 3.75);
    expect(t.igv).toBe(1800 - 180 + 90 * 3.75);
  });
  it("suma exonerado/inafecto como no gravado y lee moneda y tipo de cambio", () => {
    expect(filas[2].no_gravado).toBe(50);
    expect(filas[2].moneda).toBe("USD");
    expect(filas[2].tipo_cambio).toBe(3.75);
  });
  it("lee igual el mismo archivo dentro de un ZIP", () => {
    const zip = zipSync({ "LE20608595148202610140400.txt": strToU8(fx("rvie-202610.txt")) });
    expect(leerPropuesta(zip, "ventas")).toEqual(filas);
  });
});

describe("propuesta RCE (compras)", () => {
  const filas = leerPropuesta(fx("rce-202610.txt"), "compras");
  it("toma la base e IGV que dan crédito (DG + DGNG) y separa lo no gravado", () => {
    expect(filas[0].base_gravada).toBe(4000);
    expect(filas[0].igv).toBe(720);
    expect(filas[2].base_gravada).toBe(500);
    expect(filas[2].no_gravado).toBe(10);
    expect(filas[2].extras.dgng).toBe(236);
  });
  it("rechaza un archivo que no es propuesta, con mensaje claro", () => {
    expect(() => leerPropuesta("RUC|Fecha|Serie\n1|2|3", "compras")).toThrow(PropuestaInvalidaError);
    expect(() => leerPropuesta("hola mundo", "ventas")).toThrow(/títulos/);
  });
});

describe("semáforo", () => {
  const compras = leerPropuesta(fx("rce-202610.txt"), "compras");
  const ventas = leerPropuesta(fx("rvie-202610.txt"), "ventas");
  const ctx = { periodo: "2026-10", duplicadas: new Set<string>() };

  it("verde: factura correcta del periodo (con nota informativa de bancarización)", () => {
    const e = evaluar(compras[0], "compras", ctx);
    expect(e.semaforo).toBe("verde");
    expect(e.alertas.join()).toMatch(/bancarización/);
  });
  it("rojo: IGV que no cuadra con la base", () => {
    expect(evaluar(compras[1], "compras", ctx).semaforo).toBe("rojo");
  });
  it("ámbar: prorrata (DGNG); el mes anterior es solo informativo", () => {
    const e = evaluar(compras[2], "compras", ctx);
    expect(e.semaforo).toBe("ambar");
    expect(e.alertas.join()).toMatch(/prorrata/);
  });
  it("rojo: comprobante repetido; ámbar: diferencia con el XML del cliente", () => {
    const dup = duplicadasDe([ventas[0], ventas[0]]);
    expect(evaluar(ventas[0], "ventas", { ...ctx, duplicadas: dup }).semaforo).toBe("rojo");
    expect(evaluar(ventas[0], "ventas", { ...ctx, xmlDelCliente: { total: 11000 } }).semaforo).toBe("ambar");
    expect(evaluar(ventas[0], "ventas", { ...ctx, xmlDelCliente: { total: 11800 } }).semaforo).toBe("verde");
  });
  it("ámbar: venta fuera del periodo", () => {
    expect(evaluar(ventas[0], "ventas", { ...ctx, periodo: "2026-11" }).semaforo).toBe("ambar");
  });
});
