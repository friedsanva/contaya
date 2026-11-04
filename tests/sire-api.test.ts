import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { descargarPropuesta, SireError } from "@/lib/sire/api";
import { leerPropuesta } from "@/lib/sire/propuesta";

const cred = { ruc: "20608595148", usuario_sol: "contaya1", clave_sol: "Clave123", client_id: "abc-123", client_secret: "sec" };
const zip = zipSync({ "propuesta.txt": strToU8(readFileSync(path.join(__dirname, "fixtures", "sire", "rce-202610.txt"), "utf8")) });

/** SUNAT simulado: el ticket queda listo en la segunda consulta. */
function sunatFalso(opciones: { tokenFalla?: boolean } = {}) {
  const llamadas: { url: string; init?: RequestInit }[] = [];
  let consultas = 0;
  const f = (async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (url.includes("/oauth2/token/")) return opciones.tokenFalla ? json({ error_description: "Credenciales inválidas" }, 401) : json({ access_token: "TKN", expires_in: 3600 });
    if (url.includes("exportacioncomprobantepropuesta")) return json({ numTicket: "20260300000123" });
    if (url.includes("consultaestadotickets")) {
      consultas++;
      return json({ registros: [{ numTicket: "20260300000123", codProceso: "3", desEstadoProceso: consultas < 2 ? "En proceso" : "Terminado",
        archivoReporte: consultas < 2 ? [] : [{ codTipoAchivoReporte: "01", nomArchivoReporte: "LE2060859514820261008.zip" }] }] });
    }
    if (url.includes("archivoreporte")) return new Response(zip, { status: 200 });
    return json({ msg: "no encontrado" }, 404);
  }) as unknown as typeof fetch;
  return { f, llamadas };
}

describe("API SIRE (SUNAT simulado)", () => {
  it("token → ticket → espera → descarga ZIP → se lee la propuesta", async () => {
    const { f, llamadas } = sunatFalso();
    const r = await descargarPropuesta(cred, "compras", "2026-10", { fetch: f, pausaMs: 1 });
    expect(r.ticket).toBe("20260300000123");
    expect(leerPropuesta(r.datos, "compras")).toHaveLength(3);

    const token = llamadas[0];
    expect(token.url).toBe("https://api-seguridad.sunat.gob.pe/v1/clientessol/abc-123/oauth2/token/");
    const body = new URLSearchParams(String(token.init?.body));
    expect(body.get("grant_type")).toBe("password");
    expect(body.get("scope")).toBe("https://api-sire.sunat.gob.pe");
    expect(body.get("username")).toBe("20608595148 CONTAYA1");
    expect(llamadas[1].url).toContain("/rce/propuesta/web/propuesta/202610/exportacioncomprobantepropuesta");
    expect((llamadas[1].init?.headers as Record<string, string>).Authorization).toBe("Bearer TKN");
    const descarga = llamadas.find((l) => l.url.includes("archivoreporte"))!.url;
    expect(descarga).toContain("codLibro=080000");
    expect(descarga).toContain("nomArchivoReporte=LE2060859514820261008.zip");
  });

  it("explica el error si SUNAT rechaza las credenciales", async () => {
    const { f } = sunatFalso({ tokenFalla: true });
    await expect(descargarPropuesta(cred, "ventas", "2026-10", { fetch: f })).rejects.toThrow(SireError);
    await expect(descargarPropuesta(cred, "ventas", "2026-10", { fetch: f })).rejects.toThrow(/Credenciales inválidas/);
  });
});
