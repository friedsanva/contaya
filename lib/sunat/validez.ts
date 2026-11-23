import type { Semaforo } from "../sire/semaforo";

/**
 * Validez de comprobantes con el servicio oficial de SUNAT
 * "Consulta Integrada de Comprobantes de Pago por Servicio Web" (manual v2.0).
 * - Token: POST api-seguridad.sunat.gob.pe/v1/clientesextranet/{client_id}/oauth2/token/ (client_credentials)
 * - Consulta: POST api.sunat.gob.pe/v1/contribuyente/contribuyentes/{RUC consultante}/validarcomprobante
 * Aquí solo hay reglas puras (qué preguntar y cómo leer la respuesta) y el cliente HTTP con `fetch` inyectable.
 * Pruebas en tests/validez.test.ts.
 */

/** Tipos de comprobante que el servicio acepta (Anexo del manual). */
export const TIPOS_CONSULTABLES = new Set(["01", "03", "04", "07", "08", "R1", "R7"]);

export const ESTADO_CP: Record<number, string> = {
  0: "NO EXISTE", 1: "ACEPTADO", 2: "ANULADO", 3: "AUTORIZADO", 4: "NO AUTORIZADO",
};
export const ESTADO_RUC: Record<string, string> = {
  "00": "ACTIVO", "01": "BAJA PROVISIONAL", "02": "BAJA PROV. POR OFICIO", "03": "SUSPENSIÓN TEMPORAL",
  "10": "BAJA DEFINITIVA", "11": "BAJA DE OFICIO", "22": "INHABILITADO-VENT.ÚNICA",
};
export const COND_DOMICILIO: Record<string, string> = {
  "00": "HABIDO", "09": "PENDIENTE", "11": "POR VERIFICAR", "12": "NO HABIDO", "20": "NO HALLADO",
};

export interface ConsultaValidez {
  numRuc: string;       // RUC del EMISOR del comprobante
  codComp: string;
  numeroSerie: string;
  numero: number;
  fechaEmision: string; // dd/mm/yyyy
  monto?: number;       // solo para electrónicos
}

/** Lo que guardamos de la respuesta de SUNAT (columna comprobantes.validez_sunat). */
export interface ValidezSunat {
  estadoCp: number | null;
  estadoRuc: string | null;
  condDomiRuc: string | null;
  observaciones: string[];
}

export interface DatosComprobante {
  tipo: "venta" | "compra";
  tipo_doc: string;
  serie_numero: string;   // "F001-123"
  fecha_emision: string;  // YYYY-MM-DD
  contraparte_ruc: string;
  total: number;
}

const esRuc = (s: string) => /^(10|15|16|17|20)\d{9}$/.test(s);

/** Serie electrónica = empieza con letra (F001, B001, E001, EB01…). Las físicas son numéricas (0001). */
export const esElectronico = (serie: string) => /^[A-Z]/i.test(serie.trim());

/**
 * Arma la consulta para un comprobante. Devuelve null (con el motivo) si no se puede consultar.
 * En ventas el emisor es el propio cliente; en compras, el proveedor.
 */
export function armarConsulta(c: DatosComprobante, rucCliente: string): { consulta: ConsultaValidez } | { motivo: string } {
  if (!TIPOS_CONSULTABLES.has(c.tipo_doc)) return { motivo: `El tipo de comprobante ${c.tipo_doc} no se consulta en este servicio` };
  const emisor = c.tipo === "venta" ? rucCliente : c.contraparte_ruc;
  if (!esRuc(emisor)) return { motivo: "El emisor no tiene un RUC válido" };
  const i = c.serie_numero.lastIndexOf("-");
  const serie = (i < 0 ? "" : c.serie_numero.slice(0, i)).trim().toUpperCase();
  const numero = Number(c.serie_numero.slice(i + 1));
  if (!serie || serie.length > 4 || !Number.isInteger(numero) || numero <= 0) return { motivo: "Serie o número no reconocido" };
  const m = c.fecha_emision.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { motivo: "Fecha de emisión no válida" };
  const consulta: ConsultaValidez = { numRuc: emisor, codComp: c.tipo_doc, numeroSerie: serie, numero, fechaEmision: `${m[3]}/${m[2]}/${m[1]}` };
  if (esElectronico(serie)) consulta.monto = Math.round(Math.abs(c.total) * 100) / 100;
  return { consulta };
}

export interface EvaluacionValidez { semaforo: Semaforo; alertas: string[] }

/** Prefijo de las alertas que vienen de esta consulta (para reconocerlas y no duplicarlas). */
export const PREFIJO = "SUNAT:";

/**
 * Reglas del semáforo para la validez (docs/proceso-mensual.md):
 * - Rojo: comprobante que no existe, anulado o no autorizado; proveedor no habido o de baja.
 * - Ámbar: proveedor suspendido, inhabilitado o "no hallado".
 * - Informativo: domicilio pendiente o por verificar.
 * El estado del RUC solo se juzga en compras (en ventas el emisor es el propio cliente).
 */
export function evaluarValidez(v: ValidezSunat, tipo: "venta" | "compra"): EvaluacionValidez {
  const ORD: Record<Semaforo, number> = { verde: 0, ambar: 1, rojo: 2 };
  let s: Semaforo = "verde";
  const a: string[] = [];
  const marcar = (n: Semaforo, msg: string) => { if (ORD[n] > ORD[s]) s = n; a.push(`${PREFIJO} ${msg}`); };

  switch (v.estadoCp) {
    case 1: case 3: break;
    case 0: marcar("rojo", "el comprobante no existe en SUNAT (no fue informado)"); break;
    case 2: marcar("rojo", "comprobante ANULADO (comunicado de baja)"); break;
    case 4: marcar("rojo", "comprobante NO AUTORIZADO por imprenta"); break;
    default: marcar("ambar", "no se pudo confirmar el estado del comprobante");
  }

  if (tipo === "compra") {
    const er = v.estadoRuc;
    if (er && ["01", "02", "10", "11"].includes(er)) marcar("rojo", `RUC del proveedor en ${ESTADO_RUC[er]}`);
    else if (er && er !== "00") marcar("ambar", `RUC del proveedor en ${ESTADO_RUC[er] ?? `estado ${er}`}`);

    const cd = v.condDomiRuc;
    if (cd === "12") marcar("rojo", "proveedor NO HABIDO: revisar el crédito fiscal");
    else if (cd === "20") marcar("ambar", "proveedor NO HALLADO");
    else if (cd === "09" || cd === "11") a.push(`ℹ ${PREFIJO} domicilio del proveedor ${COND_DOMICILIO[cd]}`);
  }
  return { semaforo: s, alertas: a };
}

/* ---------------- Cliente HTTP (solo servidor) ---------------- */

export class ValidezError extends Error {}
type Fetch = typeof fetch;
const env = () => process.env as Record<string, string | undefined>;
const SEGURIDAD = () => (env().SIRE_AUTH_BASE || "https://api-seguridad.sunat.gob.pe").replace(/\/$/, "");
const API = () => (env().SUNAT_API_BASE || "https://api.sunat.gob.pe").replace(/\/$/, "");
export const SCOPE_VALIDEZ = "https://api.sunat.gob.pe/v1/contribuyente/contribuyentes";

export async function tokenValidez(client_id: string, client_secret: string, f: Fetch = fetch): Promise<string> {
  const r = await f(`${SEGURIDAD()}/v1/clientesextranet/${encodeURIComponent(client_id)}/oauth2/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE_VALIDEZ, client_id, client_secret }),
  });
  const t = await r.text();
  let j: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { j = t ? JSON.parse(t) : null; } catch { /* no JSON */ }
  if (!r.ok || !j?.access_token) {
    const msg = j?.error_description || j?.msg || j?.message || t.slice(0, 160);
    throw new ValidezError(`SUNAT no dio acceso a la consulta de validez (${r.status}): ${msg || "sin detalle"}. Revisa las credenciales de API.`);
  }
  return j.access_token;
}

export async function consultarValidez(token: string, rucConsultante: string, q: ConsultaValidez, f: Fetch = fetch): Promise<ValidezSunat> {
  const r = await f(`${API()}/v1/contribuyente/contribuyentes/${rucConsultante}/validarcomprobante`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(q),
  });
  const t = await r.text();
  let j: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { j = t ? JSON.parse(t) : null; } catch { /* no JSON */ }
  if (!r.ok || !j || j.success === false || !j.data) {
    throw new ValidezError(`SUNAT no respondió la consulta de ${q.numeroSerie}-${q.numero} (${r.status}): ${j?.message || j?.msg || t.slice(0, 120) || "sin detalle"}`);
  }
  const d = j.data;
  const n = d.estadoCp === undefined || d.estadoCp === null || d.estadoCp === "" ? null : Number(d.estadoCp);
  const obs = d.observaciones ?? d.Observaciones ?? [];
  return {
    estadoCp: Number.isFinite(n) ? n : null,
    estadoRuc: d.estadoRuc ? String(d.estadoRuc) : null,
    condDomiRuc: d.condDomiRuc ? String(d.condDomiRuc) : null,
    observaciones: Array.isArray(obs) ? obs.map(String) : [],
  };
}

/**
 * Suma el resultado de la consulta a lo que el comprobante ya tenía (solo puede empeorar el semáforo).
 * Si queda en ámbar o rojo y estaba validado, vuelve a la bandeja del contador ("recibido").
 */
export function aplicarValidez(
  actual: { semaforo: Semaforo; alertas: string[]; estado: "recibido" | "validado" | "observado" },
  v: ValidezSunat, tipo: "venta" | "compra",
): { semaforo: Semaforo; alertas: string[]; vuelveABandeja: boolean } {
  const ORD: Record<Semaforo, number> = { verde: 0, ambar: 1, rojo: 2 };
  const e = evaluarValidez(v, tipo);
  const previas = actual.alertas.filter((x) => !x.startsWith(PREFIJO) && !x.startsWith(`ℹ ${PREFIJO}`));
  const semaforo = ORD[e.semaforo] > ORD[actual.semaforo] ? e.semaforo : actual.semaforo;
  return { semaforo, alertas: [...previas, ...e.alertas], vuelveABandeja: actual.estado === "validado" && e.semaforo !== "verde" };
}
