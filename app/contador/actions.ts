"use server";
import { revalidatePath } from "next/cache";
import { randomInt } from "node:crypto";
import { exigirContador } from "@/lib/sesion";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrarXml, type ResultadoCarga } from "@/lib/registrar";
import { esPeriodo } from "@/lib/periodo";
import { liquidar } from "@/lib/calculos";
import type { Cliente, Comprobante, Regimen } from "@/lib/types";

const num = (v: FormDataEntryValue | null) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const numONull = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? null : num(v));

// ---------- Comprobantes ----------

export async function validar(id: string) {
  const { supabase, user } = await exigirContador();
  const { data: c } = await supabase.from("comprobantes").select("moneda, tipo_cambio").eq("id", id).single();
  if (c && c.moneda !== "PEN" && !c.tipo_cambio) return; // primero se registra el tipo de cambio
  await supabase.from("comprobantes").update({ estado: "validado", validado_por: user.id, validado_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/contador", "layout");
}

export async function revertir(id: string) {
  const { supabase } = await exigirContador();
  await supabase.from("comprobantes").update({ estado: "recibido", validado_por: null, validado_at: null }).eq("id", id);
  revalidatePath("/contador", "layout");
}

export async function observar(form: FormData) {
  const { supabase } = await exigirContador();
  const id = String(form.get("id"));
  const motivo = String(form.get("motivo") || "").trim().slice(0, 500) || "Revisar este comprobante";
  await supabase.from("comprobantes").update({ estado: "observado", observacion: motivo, validado_por: null, validado_at: null }).eq("id", id);
  revalidatePath("/contador", "layout");
}

export async function fijarTipoCambio(form: FormData) {
  const { supabase } = await exigirContador();
  const tc = num(form.get("tipo_cambio"));
  if (tc <= 0 || tc > 20) return;
  await supabase.from("comprobantes").update({ tipo_cambio: tc }).eq("id", String(form.get("id")));
  revalidatePath("/contador", "layout");
}

/** Valida en bloque los comprobantes "por revisar" que no tienen alertas. */
export async function validarSinAlertas(form: FormData) {
  const { supabase, user } = await exigirContador();
  const clienteId = String(form.get("cliente_id"));
  const periodo = String(form.get("periodo"));
  const tipo = String(form.get("tipo"));
  if (!esPeriodo(periodo)) return;
  await supabase.from("comprobantes")
    .update({ estado: "validado", validado_por: user.id, validado_at: new Date().toISOString() })
    .eq("cliente_id", clienteId).eq("periodo", periodo).eq("tipo", tipo).eq("estado", "recibido").eq("alertas", "{}");
  revalidatePath("/contador", "layout");
}

export async function eliminarComprobante(form: FormData) {
  const { supabase } = await exigirContador();
  const id = String(form.get("id"));
  const { data } = await supabase.from("comprobantes").select("archivo_path").eq("id", id).single();
  await supabase.from("comprobantes").delete().eq("id", id);
  if (data?.archivo_path) await supabase.storage.from("comprobantes").remove([data.archivo_path]);
  revalidatePath("/contador", "layout");
}

export async function subirXmlContador(form: FormData): Promise<ResultadoCarga[]> {
  const { supabase, user } = await exigirContador();
  const periodo = form.get("periodo");
  if (!esPeriodo(periodo)) return [{ archivo: "", ok: false, mensaje: "Periodo no válido." }];
  const { data: cliente } = await supabase.from("clientes").select("id, ruc").eq("id", String(form.get("cliente_id"))).single();
  if (!cliente) return [{ archivo: "", ok: false, mensaje: "Cliente no encontrado." }];
  const archivos = form.getAll("archivos").filter((f): f is File => f instanceof File).slice(0, 50);
  const out: ResultadoCarga[] = [];
  for (const a of archivos) out.push(await registrarXml(supabase, cliente, periodo, a, user.id));
  return out;
}

// ---------- Cierre mensual ----------

export async function guardarCierre(form: FormData) {
  const { supabase } = await exigirContador();
  const clienteId = String(form.get("cliente_id"));
  const periodo = String(form.get("periodo"));
  if (!esPeriodo(periodo)) return;
  await supabase.from("cierres").upsert({
    cliente_id: clienteId,
    periodo,
    saldo_favor_anterior: num(form.get("saldo_favor_anterior")),
    percepciones: num(form.get("percepciones")),
    retenciones: num(form.get("retenciones")),
    saldo_percepciones_anterior: num(form.get("saldo_percepciones_anterior")),
    sire_ventas: numONull(form.get("sire_ventas")),
    sire_compras: numONull(form.get("sire_compras")),
    updated_at: new Date().toISOString(),
  }, { onConflict: "cliente_id,periodo" });
  revalidatePath(`/contador/${clienteId}/cierre`);
}

export async function marcarDeclarado(form: FormData) {
  const { supabase, user } = await exigirContador();
  const clienteId = String(form.get("cliente_id"));
  const periodo = String(form.get("periodo"));
  if (!esPeriodo(periodo)) return;
  const [{ data: cliente }, { data: docs }, { data: cierre }] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", clienteId).single<Cliente>(),
    supabase.from("comprobantes").select("*").eq("cliente_id", clienteId).eq("periodo", periodo).returns<Comprobante[]>(),
    supabase.from("cierres").select("*").eq("cliente_id", clienteId).eq("periodo", periodo).maybeSingle(),
  ]);
  if (!cliente) return;
  const resumen = liquidar(docs ?? [], {
    saldo_favor_anterior: Number(cierre?.saldo_favor_anterior) || 0,
    percepciones: Number(cierre?.percepciones) || 0,
    retenciones: Number(cierre?.retenciones) || 0,
    saldo_percepciones_anterior: Number(cierre?.saldo_percepciones_anterior) || 0,
    tasa_pago_cuenta: Number(cliente.tasa_pago_cuenta) || 0,
  });
  await supabase.from("cierres").upsert({
    cliente_id: clienteId,
    periodo,
    estado: "declarado",
    numero_orden: String(form.get("numero_orden") || "").trim().slice(0, 40) || null,
    resumen,
    declarado_at: new Date().toISOString(),
    declarado_por: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "cliente_id,periodo" });
  revalidatePath("/contador", "layout");
}

export async function reabrirPeriodo(form: FormData) {
  const { supabase } = await exigirContador();
  await supabase.from("cierres").update({ estado: "abierto", declarado_at: null, declarado_por: null })
    .eq("cliente_id", String(form.get("cliente_id"))).eq("periodo", String(form.get("periodo")));
  revalidatePath("/contador", "layout");
}

// ---------- Alta de clientes ----------

export interface ResultadoAlta { error?: string; ok?: { razon_social: string; email: string; clave: string | null; clienteId: string } }

function claveTemporal() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => letras[randomInt(letras.length)]).join("");
}

const TASA_DEFECTO: Record<Regimen, number> = { NRUS: 0, RER: 1.5, RMT: 1, GENERAL: 1.5 };

export async function crearCliente(_prev: ResultadoAlta | undefined, form: FormData): Promise<ResultadoAlta> {
  const { supabase } = await exigirContador();
  const ruc = String(form.get("ruc") || "").trim();
  const razon = String(form.get("razon_social") || "").trim();
  const regimen = String(form.get("regimen")) as Regimen;
  const email = String(form.get("email") || "").trim().toLowerCase();
  const nombre = String(form.get("nombre") || "").trim();
  if (!/^(10|15|17|20)\d{9}$/.test(ruc)) return { error: "El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20." };
  if (!razon) return { error: "Escribe la razón social." };
  if (!(regimen in TASA_DEFECTO)) return { error: "Elige el régimen tributario." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "El correo no es válido." };
  const tasaTxt = String(form.get("tasa_pago_cuenta") || "").trim();

  const { data: cliente, error } = await supabase.from("clientes").insert({
    ruc,
    razon_social: razon,
    regimen,
    tasa_pago_cuenta: tasaTxt ? num(tasaTxt) : TASA_DEFECTO[regimen],
    tiene_planilla: form.get("tiene_planilla") === "on",
    plan: String(form.get("plan") || "") || null,
  }).select("id").single();
  if (error || !cliente) return { error: error?.code === "23505" ? "Ya existe un cliente con ese RUC." : "No se pudo crear el cliente." };

  if (!email) return { ok: { razon_social: razon, email: "", clave: null, clienteId: cliente.id } };

  // Crear el usuario del cliente con una contraseña temporal (sin depender de correos).
  const admin = supabaseAdmin();
  const clave = claveTemporal();
  const { data: creado, error: errUser } = await admin.auth.admin.createUser({ email, password: clave, email_confirm: true });
  if (errUser || !creado.user) {
    return { error: `El cliente se creó, pero no el usuario: ${errUser?.message ?? "error desconocido"}. Puedes intentarlo de nuevo desde su ficha.` };
  }
  await admin.from("perfiles").upsert({ id: creado.user.id, email, nombre: nombre || null, rol: "cliente", cliente_id: cliente.id });
  revalidatePath("/contador");
  return { ok: { razon_social: razon, email, clave, clienteId: cliente.id } };
}
