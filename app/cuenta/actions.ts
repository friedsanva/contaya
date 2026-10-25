"use server";
import { supabaseServer } from "@/lib/supabase/server";

export async function cambiarClave(_prev: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const nueva = String(form.get("nueva") || "");
  const repetir = String(form.get("repetir") || "");
  if (nueva.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (nueva !== repetir) return { error: "Las contraseñas no coinciden." };
  const { error } = await supabaseServer().auth.updateUser({ password: nueva });
  if (error) return { error: "No se pudo cambiar la contraseña. Vuelve a ingresar e inténtalo de nuevo." };
  return { ok: true };
}
