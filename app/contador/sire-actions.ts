"use server";
import { revalidatePath } from "next/cache";
import { exigirContador } from "@/lib/sesion";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cifrar, descifrar, hayLlave } from "@/lib/cripto";
import { esPeriodo } from "@/lib/periodo";
import { importarPropuesta, type ResumenImportacion } from "@/lib/sire/importar";
import { descargarPropuesta, SireError, type CredencialesSire } from "@/lib/sire/api";
import { PropuestaInvalidaError, type Registro } from "@/lib/sire/propuesta";

export interface ResultadoSire { ok: boolean; mensaje: string; resumen?: Partial<Record<Registro, ResumenImportacion>> }

const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();

async function registrarImportacion(
  supabase: Awaited<ReturnType<typeof exigirContador>>["supabase"], userId: string,
  clienteId: string, periodo: string, registro: Registro, via: "archivo" | "api",
  r: ResumenImportacion | null, error: string | null,
) {
  await supabase.from("importaciones_sire").insert({
    cliente_id: clienteId, periodo, registro, via, hecho_por: userId, error,
    ...(r ? { filas: r.filas, nuevos: r.nuevos, actualizados: r.actualizados, verdes: r.verdes, ambar: r.ambar, rojos: r.rojos, total_base: r.total_base, total_igv: r.total_igv } : {}),
  });
}

function mensajeResumen(reg: Registro, r: ResumenImportacion) {
  const excepciones = r.ambar + r.rojos;
  return `${reg === "ventas" ? "Ventas" : "Compras"}: ${r.filas} comprobantes · ${r.verdes} validados solos` +
    (excepciones ? ` · ${excepciones} para revisar` : " · sin excepciones") +
    (r.soloEnContaya ? ` · ${r.soloEnContaya} subidos por el cliente que no están en SUNAT` : "");
}

/** Importa el archivo de propuesta exportado manualmente desde el SIRE (TXT, CSV o ZIP). */
export async function importarArchivoSire(_prev: ResultadoSire | undefined, form: FormData): Promise<ResultadoSire> {
  const { supabase, user } = await exigirContador();
  const clienteId = texto(form.get("cliente_id"));
  const periodo = texto(form.get("periodo"));
  const registro = texto(form.get("registro")) as Registro;
  const archivo = form.get("archivo");
  if (!esPeriodo(periodo) || !["ventas", "compras"].includes(registro)) return { ok: false, mensaje: "Datos incompletos." };
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, mensaje: "Elige el archivo exportado del SIRE." };
  if (archivo.size > 15 * 1024 * 1024) return { ok: false, mensaje: "El archivo pesa más de 15 MB." };
  try {
    const r = await importarPropuesta(supabase, clienteId, periodo, registro, new Uint8Array(await archivo.arrayBuffer()));
    await registrarImportacion(supabase, user.id, clienteId, periodo, registro, "archivo", r, null);
    await supabase.from("bitacora").insert({ cliente_id: clienteId, usuario_id: user.id, accion: "importar_sire_archivo", detalle: { periodo, registro, ...r } });
    revalidatePath(`/contador/${clienteId}`, "layout");
    return { ok: true, mensaje: mensajeResumen(registro, r), resumen: { [registro]: r } };
  } catch (e) {
    const msg = e instanceof PropuestaInvalidaError ? e.message : "No se pudo importar el archivo. Verifica que sea la propuesta exportada del SIRE.";
    await registrarImportacion(supabase, user.id, clienteId, periodo, registro, "archivo", null, msg);
    return { ok: false, mensaje: msg };
  }
}

/** Descarga ventas y compras directo de SUNAT con las credenciales del cliente. */
export async function importarDesdeSunat(_prev: ResultadoSire | undefined, form: FormData): Promise<ResultadoSire> {
  const { supabase, user } = await exigirContador();
  const clienteId = texto(form.get("cliente_id"));
  const periodo = texto(form.get("periodo"));
  if (!esPeriodo(periodo)) return { ok: false, mensaje: "Periodo no válido." };

  const admin = supabaseAdmin();
  const [{ data: cliente }, { data: cred }] = await Promise.all([
    supabase.from("clientes").select("ruc").eq("id", clienteId).single(),
    admin.from("credenciales_sire").select("*").eq("cliente_id", clienteId).maybeSingle(),
  ]);
  if (!cliente) return { ok: false, mensaje: "Cliente no encontrado." };
  if (!cred) return { ok: false, mensaje: "Este cliente aún no tiene credenciales SUNAT registradas." };

  let credenciales: CredencialesSire;
  try {
    const s = JSON.parse(descifrar(cred.secretos_cifrados));
    credenciales = { ruc: cliente.ruc, usuario_sol: cred.usuario_sol, client_id: cred.client_id, client_secret: s.client_secret, clave_sol: s.clave_sol };
  } catch {
    return { ok: false, mensaje: "No se pudieron leer las credenciales guardadas. Vuelve a registrarlas." };
  }

  const resumen: Partial<Record<Registro, ResumenImportacion>> = {};
  const mensajes: string[] = [];
  let token: string | undefined;
  for (const registro of ["ventas", "compras"] as Registro[]) {
    try {
      const d = await descargarPropuesta(credenciales, registro, periodo, { token, maxMs: 20000 });
      token = d.token;
      const r = await importarPropuesta(supabase, clienteId, periodo, registro, d.datos);
      resumen[registro] = r;
      mensajes.push(mensajeResumen(registro, r));
      await registrarImportacion(supabase, user.id, clienteId, periodo, registro, "api", r, null);
    } catch (e) {
      const msg = e instanceof SireError || e instanceof PropuestaInvalidaError ? e.message : "Error inesperado al conectar con SUNAT.";
      mensajes.push(`${registro === "ventas" ? "Ventas" : "Compras"}: ${msg}`);
      await registrarImportacion(supabase, user.id, clienteId, periodo, registro, "api", null, msg);
    }
  }
  const huboError = Object.keys(resumen).length < 2;
  await admin.from("credenciales_sire").update({ ultimo_uso: new Date().toISOString(), ultimo_error: huboError ? mensajes.join(" | ").slice(0, 500) : null }).eq("cliente_id", clienteId);
  await supabase.from("bitacora").insert({ cliente_id: clienteId, usuario_id: user.id, accion: "usar_credenciales_sunat", detalle: { periodo, ok: !huboError } });
  revalidatePath(`/contador/${clienteId}`, "layout");
  return { ok: !huboError, mensaje: mensajes.join("\n"), resumen };
}

/** Guarda (o reemplaza) las credenciales del cliente, cifradas. Nunca se devuelven al navegador. */
export async function guardarCredenciales(_prev: ResultadoSire | undefined, form: FormData): Promise<ResultadoSire> {
  const { supabase, user } = await exigirContador();
  if (!hayLlave()) return { ok: false, mensaje: "Falta configurar CONTAYA_CRYPTO_KEY en Vercel. Sin ella no se guardan credenciales." };
  const clienteId = texto(form.get("cliente_id"));
  const usuario = texto(form.get("usuario_sol")).toUpperCase();
  const clientId = texto(form.get("client_id"));
  const clientSecret = texto(form.get("client_secret"));
  const clave = String(form.get("clave_sol") ?? "");
  const fecha = texto(form.get("autorizacion_fecha"));
  if (form.get("autorizado") !== "on") return { ok: false, mensaje: "Confirma que tienes la autorización firmada del cliente." };
  if (!usuario || !clientId || !clientSecret || !clave) return { ok: false, mensaje: "Completa los cuatro datos de acceso." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, mensaje: "Indica la fecha de la autorización." };
  const { data: cliente } = await supabase.from("clientes").select("id").eq("id", clienteId).single();
  if (!cliente) return { ok: false, mensaje: "Cliente no encontrado." };

  const { error } = await supabaseAdmin().from("credenciales_sire").upsert({
    cliente_id: clienteId, usuario_sol: usuario, client_id: clientId,
    secretos_cifrados: cifrar(JSON.stringify({ client_secret: clientSecret, clave_sol: clave })),
    autorizacion_fecha: fecha, registrado_por: user.id, ultimo_error: null, updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, mensaje: "No se pudieron guardar las credenciales." };
  await supabase.from("bitacora").insert({ cliente_id: clienteId, usuario_id: user.id, accion: "registrar_credenciales_sunat", detalle: { usuario_sol: usuario } });
  revalidatePath(`/contador/${clienteId}/sire`);
  return { ok: true, mensaje: "Credenciales guardadas y cifradas." };
}

export async function revocarCredenciales(form: FormData) {
  const { supabase, user } = await exigirContador();
  const clienteId = texto(form.get("cliente_id"));
  await supabaseAdmin().from("credenciales_sire").delete().eq("cliente_id", clienteId);
  await supabase.from("bitacora").insert({ cliente_id: clienteId, usuario_id: user.id, accion: "revocar_credenciales_sunat" });
  revalidatePath(`/contador/${clienteId}/sire`);
}
