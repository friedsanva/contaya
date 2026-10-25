import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import type { Cliente, Perfil } from "./types";

export async function obtenerSesion() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("perfiles").select("*").eq("id", user.id).single<Perfil>();
  return { supabase, user, perfil };
}

export async function exigirContador() {
  const s = await obtenerSesion();
  if (s.perfil?.rol !== "contador") redirect("/");
  return { ...s, perfil: s.perfil as Perfil };
}

export async function exigirCliente() {
  const s = await obtenerSesion();
  if (s.perfil?.rol === "contador") redirect("/contador");
  if (!s.perfil?.cliente_id) redirect("/sin-empresa");
  const { data: cliente } = await s.supabase.from("clientes").select("*").eq("id", s.perfil.cliente_id).single<Cliente>();
  if (!cliente) redirect("/sin-empresa");
  return { ...s, perfil: s.perfil as Perfil, cliente };
}
