import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { cifrar, descifrar, llaveDesde } from "@/lib/cripto";

describe("cifrado de credenciales", () => {
  const k = randomBytes(32);
  it("cifra y descifra; cada cifrado es distinto", () => {
    const a = cifrar('{"clave_sol":"Secreta123"}', k);
    const b = cifrar('{"clave_sol":"Secreta123"}', k);
    expect(a).not.toBe(b);
    expect(a).not.toContain("Secreta123");
    expect(descifrar(a, k)).toBe('{"clave_sol":"Secreta123"}');
  });
  it("falla si el dato fue alterado o la llave es otra", () => {
    const a = cifrar("hola", k);
    const roto = a.slice(0, -2) + (a.endsWith("A") ? "B" : "A") + a.slice(-1);
    expect(() => descifrar(roto, k)).toThrow();
    expect(() => descifrar(a, randomBytes(32))).toThrow();
  });
  it("acepta una frase larga o 32 bytes en base64; rechaza frases cortas", () => {
    expect(llaveDesde("mi frase secreta muy larga de contaya 2026").length).toBe(32);
    expect(llaveDesde("mi frase secreta muy larga de contaya 2026")).toEqual(llaveDesde("  mi frase secreta muy larga de contaya 2026 "));
    const b = randomBytes(32);
    expect(llaveDesde(b.toString("base64"))).toEqual(b);
    expect(() => llaveDesde("corta")).toThrow(/32 caracteres/);
  });
});
