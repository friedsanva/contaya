import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/sesion";

export default async function Inicio() {
  const { perfil } = await obtenerSesion();
  redirect(perfil?.rol === "contador" ? "/contador" : "/cliente");
}
