"use client";
import { useFormState } from "react-dom";
import { cambiarClave } from "./actions";

export function FormClave() {
  const [estado, accion] = useFormState(cambiarClave, undefined);
  return (
    <form action={accion} className="panel space-y-4">
      <h2 className="text-lg font-bold">Cambiar contraseña</h2>
      <label className="block space-y-1" htmlFor="nueva"><span className="etiqueta">Nueva contraseña</span>
        <input id="nueva" name="nueva" type="password" autoComplete="new-password" minLength={8} required className="campo" /></label>
      <label className="block space-y-1" htmlFor="repetir"><span className="etiqueta">Repite la contraseña</span>
        <input id="repetir" name="repetir" type="password" autoComplete="new-password" minLength={8} required className="campo" /></label>
      {estado?.error && <p role="alert" className="text-sm font-semibold text-[#A3261E]">{estado.error}</p>}
      {estado?.ok && <p role="status" className="text-sm font-semibold text-verde">Contraseña actualizada.</p>}
      <button className="btn-primario">Guardar</button>
    </form>
  );
}
