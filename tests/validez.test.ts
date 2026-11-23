import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  armarConsulta, evaluarValidez, aplicarValidez, tokenValidez, consultarValidez, ValidezError, esElectronico, type ValidezSunat,
} from "@/lib/sunat/validez";
import { verificarPeriodo } from "@/lib/sunat/verificar";
import { evaluar } from "@/lib/sire/semaforo";
import { leerPropuesta } from "@/lib/sire/propuesta";

const RUC_CLIENTE = "20608595148";
const compra = { tipo: "compra" as const, tipo_doc: "01", serie_numero: "F001-123", fecha_emision: "2026-10-05", contraparte_ruc: "20100070970", total: 1180 };
const ok: ValidezSunat = { estadoCp: 1, estadoRuc: "00", condDomiRuc: "00", observaciones: [] };

describe("armarConsulta", () => {
  it("compra electrónica: el emisor es el proveedor, fecha dd/mm/aaaa y monto", () => {
    const r = armarConsulta(compra, RUC_CLIENTE);
    expect(r).toEqual({ consulta: { numRuc: "20100070970", codComp: "01", numeroSerie: "F001", numero: 123, fechaEmision: "05/10/2026", monto: 1180 } });
  });
  it("venta: el emisor es el propio cliente", () => {
    const r = armarConsulta({ ...compra, tipo: "venta", contraparte_ruc: "45678912" }, RUC_CLIENTE);
    expect("consulta" in r && r.consulta.numRuc).toBe(RUC_CLIENTE);
  });
  it("comprobante físico (serie numérica): sin monto", () => {
    const r = armarConsulta({ ...compra, serie_numero: "0001-456" }, RUC_CLIENTE);
    expect("consulta" in r && r.consulta.monto).toBeUndefined();
    expect(esElectronico("0001")).toBe(false);
    expect(esElectronico("E001")).toBe(true);
  });
  it("nota de crédito: monto siempre positivo", () => {
    const r = armarConsulta({ ...compra, tipo_doc: "07", serie_numero: "FC01-9", total: -118 }, RUC_CLIENTE);
    expect("consulta" in r && r.consulta.monto).toBe(118);
  });
  it("no consultables: tipo fuera del servicio o emisor sin RUC", () => {
    expect(armarConsulta({ ...compra, tipo_doc: "14" }, RUC_CLIENTE)).toHaveProperty("motivo");
    expect(armarConsulta({ ...compra, contraparte_ruc: "12345678" }, RUC_CLIENTE)).toHaveProperty("motivo");
    expect(armarConsulta({ ...compra, serie_numero: "F00123" }, RUC_CLIENTE)).toHaveProperty("motivo");
  });
});

describe("evaluarValidez (reglas del semáforo)", () => {
  it("verde: aceptado, proveedor activo y habido", () => {
    expect(evaluarValidez(ok, "compra")).toEqual({ semaforo: "verde", alertas: [] });
    expect(evaluarValidez({ ...ok, estadoCp: 3 }, "compra").semaforo).toBe("verde"); // físico autorizado
  });
  it("rojo: no existe, anulado o no autorizado", () => {
    for (const estadoCp of [0, 2, 4]) expect(evaluarValidez({ ...ok, estadoCp }, "compra").semaforo).toBe("rojo");
    expect(evaluarValidez({ ...ok, estadoCp: 2 }, "venta").alertas[0]).toMatch(/ANULADO/);
  });
  it("rojo: proveedor no habido o de baja", () => {
    expect(evaluarValidez({ ...ok, condDomiRuc: "12" }, "compra").semaforo).toBe("rojo");
    for (const estadoRuc of ["01", "02", "10", "11"]) expect(evaluarValidez({ ...ok, estadoRuc }, "compra").semaforo).toBe("rojo");
  });
  it("ámbar: suspensión temporal, inhabilitado o no hallado; informativo si está pendiente", () => {
    expect(evaluarValidez({ ...ok, estadoRuc: "03" }, "compra").semaforo).toBe("ambar");
    expect(evaluarValidez({ ...ok, estadoRuc: "22" }, "compra").semaforo).toBe("ambar");
    expect(evaluarValidez({ ...ok, condDomiRuc: "20" }, "compra").semaforo).toBe("ambar");
    const p = evaluarValidez({ ...ok, condDomiRuc: "09" }, "compra");
    expect(p.semaforo).toBe("verde");
    expect(p.alertas[0]).toMatch(/^ℹ SUNAT: .*PENDIENTE/);
  });
  it("ámbar: respuesta sin estado (nunca se da por bueno en silencio)", () => {
    expect(evaluarValidez({ ...ok, estadoCp: null }, "compra").semaforo).toBe("ambar");
  });
  it("en ventas no se juzga el RUC (es el propio cliente)", () => {
    expect(evaluarValidez({ ...ok, condDomiRuc: "12", estadoRuc: "10" }, "venta").semaforo).toBe("verde");
  });
});

describe("aplicarValidez", () => {
  it("solo empeora el semáforo y devuelve a la bandeja lo que estaba validado", () => {
    const r = aplicarValidez({ semaforo: "verde", alertas: ["ℹ Monto ≥ S/ 2,000"], estado: "validado" }, { ...ok, estadoCp: 2 }, "compra");
    expect(r.semaforo).toBe("rojo");
    expect(r.vuelveABandeja).toBe(true);
    expect(r.alertas).toEqual(["ℹ Monto ≥ S/ 2,000", "SUNAT: comprobante ANULADO (comunicado de baja)"]);
    const s = aplicarValidez({ semaforo: "ambar", alertas: ["x"], estado: "recibido" }, ok, "compra");
    expect(s).toEqual({ semaforo: "ambar", alertas: ["x"], vuelveABandeja: false });
  });
  it("no duplica alertas de SUNAT al volver a aplicarse", () => {
    const una = aplicarValidez({ semaforo: "verde", alertas: [], estado: "recibido" }, { ...ok, condDomiRuc: "12" }, "compra");
    const dos = aplicarValidez({ semaforo: una.semaforo, alertas: una.alertas, estado: "recibido" }, { ...ok, condDomiRuc: "12" }, "compra");
    expect(dos.alertas).toHaveLength(1);
  });
});

describe("semáforo del SIRE con la validez guardada", () => {
  const compras = leerPropuesta(readFileSync(path.join(__dirname, "fixtures", "sire", "rce-202610.txt"), "utf8"), "compras");
  const ctx = { periodo: "2026-10", duplicadas: new Set<string>() };
  it("al reimportar, un comprobante anulado sigue en rojo", () => {
    expect(evaluar(compras[0], "compras", ctx).semaforo).toBe("verde");
    expect(evaluar(compras[0], "compras", { ...ctx, validez: { ...ok, estadoCp: 2 } }).semaforo).toBe("rojo");
    expect(evaluar(compras[0], "compras", { ...ctx, validez: ok }).semaforo).toBe("verde");
  });
});

/* ---------- SUNAT simulado ---------- */
function sunatFalso(resp: (body: any) => unknown, opciones: { tokenFalla?: boolean } = {}) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const llamadas: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (url.includes("/oauth2/token/")) return opciones.tokenFalla ? json({ error_description: "cliente no autorizado" }, 401) : json({ access_token: "TKV", expires_in: 3600 });
    if (url.endsWith("/validarcomprobante")) return json(resp(JSON.parse(String(init?.body))));
    return json({}, 404);
  }) as unknown as typeof fetch;
  return { f, llamadas };
}

describe("API de validez (SUNAT simulado)", () => {
  it("token client_credentials y consulta con el RUC consultante en la ruta", async () => {
    const { f, llamadas } = sunatFalso(() => ({ success: true, message: "Operation Success! ", data: { estadoCp: "1", estadoRuc: "00", condDomiRuc: "00" } }));
    const t = await tokenValidez("id-1", "sec", f);
    expect(t).toBe("TKV");
    expect(llamadas[0].url).toBe("https://api-seguridad.sunat.gob.pe/v1/clientesextranet/id-1/oauth2/token/");
    const b = new URLSearchParams(String(llamadas[0].init?.body));
    expect(b.get("grant_type")).toBe("client_credentials");
    expect(b.get("scope")).toBe("https://api.sunat.gob.pe/v1/contribuyente/contribuyentes");
    const q = armarConsulta(compra, RUC_CLIENTE);
    if (!("consulta" in q)) throw new Error("debía armarse");
    const v = await consultarValidez(t, RUC_CLIENTE, q.consulta, f);
    expect(v).toEqual({ estadoCp: 1, estadoRuc: "00", condDomiRuc: "00", observaciones: [] });
    expect(llamadas[1].url).toBe(`https://api.sunat.gob.pe/v1/contribuyente/contribuyentes/${RUC_CLIENTE}/validarcomprobante`);
    expect((llamadas[1].init?.headers as Record<string, string>).Authorization).toBe("Bearer TKV");
  });
  it("errores claros: credenciales rechazadas o consulta fallida", async () => {
    await expect(tokenValidez("x", "y", sunatFalso(() => ({}), { tokenFalla: true }).f)).rejects.toThrow(/cliente no autorizado/);
    const { f } = sunatFalso(() => ({ success: false, message: "El comprobante no tiene el formato correcto" }));
    await expect(consultarValidez("T", RUC_CLIENTE, { numRuc: "20100070970", codComp: "01", numeroSerie: "F001", numero: 1, fechaEmision: "01/10/2026" }, f))
      .rejects.toThrow(ValidezError);
  });
});

/* ---------- Supabase simulado para verificarPeriodo ---------- */
function baseFalsa(filas: Record<string, any>[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const cambios: Record<string, Record<string, unknown>> = {};
  const consulta = {
    select: () => consulta, eq: () => consulta, is: () => consulta,
    returns: async () => ({ data: filas, error: null }),
  };
  const supa = {
    from: () => ({
      select: () => consulta,
      update: (c: Record<string, unknown>) => ({ eq: async (_k: string, id: string) => { cambios[id] = c; return { error: null }; } }),
    }),
  };
  return { supa: supa as any, cambios }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe("verificarPeriodo", () => {
  const filas = [
    { id: "a", ...compra, semaforo: "verde", alertas: [], estado: "validado" },
    { id: "b", ...compra, serie_numero: "F001-124", semaforo: "verde", alertas: [], estado: "validado" },
    { id: "c", ...compra, tipo_doc: "14", serie_numero: "S001-1", semaforo: "verde", alertas: [], estado: "validado" },
  ];
  it("verifica, pasa a rojo lo anulado y anota lo no consultable", async () => {
    const { supa, cambios } = baseFalsa(filas);
    const { f } = sunatFalso((b) => ({ success: true, data: { estadoCp: b.numero === 124 ? 2 : 1, estadoRuc: "00", condDomiRuc: "00" } }));
    const r = await verificarPeriodo(supa, { id: "cli", ruc: RUC_CLIENTE }, "2026-10", { client_id: "i", client_secret: "s" }, { fetch: f, paralelo: 2 });
    expect(r).toMatchObject({ revisados: 2, ok: 1, rojos: 1, noConsultables: 1, pendientes: 0, error: null });
    expect(cambios.b).toMatchObject({ semaforo: "rojo", estado: "recibido", validado_at: null });
    expect(cambios.a).toMatchObject({ semaforo: "verde" });
    expect(cambios.a.estado).toBeUndefined();
    expect(cambios.c).toMatchObject({ validez_motivo: expect.stringMatching(/14/) });
  });
  it("si SUNAT rechaza el acceso, nada se marca y todo queda pendiente con el motivo", async () => {
    const { supa, cambios } = baseFalsa(filas);
    const { f } = sunatFalso(() => ({}), { tokenFalla: true });
    const r = await verificarPeriodo(supa, { id: "cli", ruc: RUC_CLIENTE }, "2026-10", { client_id: "i", client_secret: "s" }, { fetch: f });
    expect(r.pendientes).toBe(3);
    expect(r.error).toMatch(/credenciales de API/);
    expect(Object.keys(cambios)).toHaveLength(0);
  });
});
