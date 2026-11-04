import type { Registro } from "./propuesta";

/**
 * Cliente de la API oficial del SIRE (SUNAT), según los manuales "Servicios Web API SIRE Ventas/Compras".
 * Flujo: token OAuth2 → solicitar exportación de la propuesta (ticket) → consultar ticket → descargar ZIP.
 * Solo se usa en el servidor. `fetch` es inyectable para poder probarlo sin llamar a SUNAT.
 */

export interface CredencialesSire {
  ruc: string;
  usuario_sol: string;
  clave_sol: string;
  client_id: string;
  client_secret: string;
}

export class SireError extends Error {}

type Fetch = typeof fetch;

const env = () => process.env as Record<string, string | undefined>;
const BASE = () => (env().SIRE_API_BASE || "https://api-sire.sunat.gob.pe").replace(/\/$/, "");
const SEGURIDAD = () => (env().SIRE_AUTH_BASE || "https://api-seguridad.sunat.gob.pe").replace(/\/$/, "");

export const COD_LIBRO: Record<Registro, string> = { ventas: "140000", compras: "080000" };

/** periodo "2026-10" → "202610" */
export const perSunat = (periodo: string) => periodo.replace("-", "");

async function leerJson(r: Response, que: string) {
  const t = await r.text();
  let j: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { j = t ? JSON.parse(t) : null; } catch { /* respuesta no JSON */ }
  if (!r.ok) {
    const msg = j?.msg || j?.message || j?.error_description || j?.errors?.[0]?.msg || t.slice(0, 200);
    throw new SireError(`SUNAT respondió ${r.status} al ${que}: ${msg}`);
  }
  return j;
}

export async function obtenerToken(c: CredencialesSire, f: Fetch = fetch): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    scope: "https://api-sire.sunat.gob.pe",
    client_id: c.client_id,
    client_secret: c.client_secret,
    username: `${c.ruc} ${c.usuario_sol.trim().toUpperCase()}`, // "RUC USUARIO", separados por un espacio
    password: c.clave_sol,
  });
  const r = await f(`${SEGURIDAD()}/v1/clientessol/${encodeURIComponent(c.client_id)}/oauth2/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const j = await leerJson(r, "pedir el acceso");
  if (!j?.access_token) throw new SireError("SUNAT no entregó el acceso. Revisa las credenciales de API, el usuario y la clave SOL.");
  return j.access_token;
}

function urlExportar(registro: Registro, per: string) {
  return registro === "ventas"
    ? `${BASE()}/v1/contribuyente/migeigv/libros/rvie/propuesta/web/propuesta/${per}/exportapropuesta?codTipoArchivo=0`
    : `${BASE()}/v1/contribuyente/migeigv/libros/rce/propuesta/web/propuesta/${per}/exportacioncomprobantepropuesta?codTipoArchivo=0&codOrigenEnvio=2`;
}

export async function solicitarPropuesta(token: string, registro: Registro, per: string, f: Fetch = fetch): Promise<string> {
  const r = await f(urlExportar(registro, per), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const j = await leerJson(r, "solicitar la propuesta");
  if (!j?.numTicket) throw new SireError("SUNAT no devolvió número de ticket para la propuesta.");
  return String(j.numTicket);
}

export interface ArchivoListo { nomArchivoReporte: string; codTipoArchivoReporte: string | null; codProceso: string | null }

/** Devuelve el archivo si el ticket terminó; null si SUNAT aún procesa. */
export async function consultarTicket(token: string, registro: Registro, per: string, ticket: string, f: Fetch = fetch): Promise<ArchivoListo | null> {
  const q = new URLSearchParams({ perIni: per, perFin: per, page: "1", perPage: "20", numTicket: ticket, codLibro: COD_LIBRO[registro], codOrigenEnvio: "2" });
  const r = await f(`${BASE()}/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/consultaestadotickets?${q}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const j = await leerJson(r, "consultar el ticket");
  const reg = (j?.registros ?? []).find((x: any) => String(x?.numTicket) === ticket) ?? j?.registros?.[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!reg) return null;
  const estado = `${reg.desEstadoProceso ?? ""}`.toLowerCase();
  if (estado.includes("error") || estado.includes("rechaz")) throw new SireError(`SUNAT no pudo generar la propuesta: ${reg.desEstadoProceso}`);
  const arch = reg.archivoReporte?.[0];
  if (!arch?.nomArchivoReporte) return null;
  return {
    nomArchivoReporte: arch.nomArchivoReporte,
    codTipoArchivoReporte: arch.codTipoArchivoReporte ?? arch.codTipoAchivoReporte ?? null,
    codProceso: reg.codProceso != null ? String(reg.codProceso) : null,
  };
}

export async function descargarArchivo(token: string, registro: Registro, per: string, ticket: string, a: ArchivoListo, f: Fetch = fetch): Promise<Uint8Array> {
  const q = new URLSearchParams({
    nomArchivoReporte: a.nomArchivoReporte,
    codTipoArchivoReporte: a.codTipoArchivoReporte ?? "null",
    codLibro: COD_LIBRO[registro],
    perTributario: per,
    codProceso: a.codProceso ?? "",
    numTicket: ticket,
  });
  const r = await f(`${BASE()}/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/archivoreporte?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) await leerJson(r, "descargar el archivo");
  return new Uint8Array(await r.arrayBuffer());
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Todo el recorrido. Espera hasta `maxMs` a que SUNAT prepare el archivo. */
export async function descargarPropuesta(
  c: CredencialesSire, registro: Registro, periodo: string,
  opts: { fetch?: Fetch; maxMs?: number; pausaMs?: number; token?: string } = {},
): Promise<{ datos: Uint8Array; ticket: string; token: string }> {
  const f = opts.fetch ?? fetch;
  const per = perSunat(periodo);
  const token = opts.token ?? await obtenerToken(c, f);
  const ticket = await solicitarPropuesta(token, registro, per, f);
  const fin = Date.now() + (opts.maxMs ?? 40000);
  for (;;) {
    const listo = await consultarTicket(token, registro, per, ticket, f);
    if (listo) return { datos: await descargarArchivo(token, registro, per, ticket, listo, f), ticket, token };
    if (Date.now() > fin) throw new SireError(`SUNAT aún está preparando la propuesta (ticket ${ticket}). Inténtalo de nuevo en un minuto.`);
    await esperar(opts.pausaMs ?? 3000);
  }
}
