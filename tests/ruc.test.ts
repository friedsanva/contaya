import { describe, it, expect } from "vitest";
import { rucValido, normalizarRuc, alertaRuc } from "@/lib/ruc";

describe("rucValido", () => {
  it("acepta RUC reales (dígito verificador correcto)", () => {
    for (const r of ["20131312955", "20100070970", "20608595148", "20100128056"]) expect(rucValido(r)).toBe(true);
  });
  it("rechaza dígito verificador incorrecto, largo o prefijo inválido", () => {
    expect(rucValido("20131312954")).toBe(false);
    expect(rucValido("2013131295")).toBe(false);
    expect(rucValido("30131312955")).toBe(false);
    expect(rucValido("20A31312955")).toBe(false);
  });
});

describe("normalizarRuc y alertaRuc", () => {
  it("unifica la respuesta del proveedor", () => {
    const d = normalizarRuc("20131312955", { razon_social: " SUPERINTENDENCIA NACIONAL ", estado: "ACTIVO", condicion: "HABIDO", direccion: "AV. GARCILASO" }, "decolecta");
    expect(d).toEqual({ ruc: "20131312955", razon_social: "SUPERINTENDENCIA NACIONAL", estado: "ACTIVO", condicion: "HABIDO", direccion: "AV. GARCILASO", fuente: "decolecta" });
    expect(alertaRuc(d!)).toBeNull();
  });
  it("devuelve null si no hay razón social y alerta si no está activo/habido", () => {
    expect(normalizarRuc("20131312955", { estado: "ACTIVO" }, "x")).toBeNull();
    expect(alertaRuc({ estado: "BAJA DE OFICIO", condicion: "NO HABIDO" })).toMatch(/BAJA DE OFICIO.*NO HABIDO/);
  });
});
