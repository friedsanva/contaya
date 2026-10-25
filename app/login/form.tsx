"use client";
import { useFormState, useFormStatus } from "react-dom";
import { ingresar } from "./actions";

function Boton() {
  const { pending } = useFormStatus();
  return <button className="btn-primario w-full py-2.5" disabled={pending}>{pending ? "Ingresando…" : "Ingresar"}</button>;
}

export function FormLogin() {
  const [estado, accion] = useFormState(ingresar, undefined);
  return (
    <form action={accion} className="space-y-4">
      <label className="block space-y-1" htmlFor="email">
        <span className="etiqueta">Correo</span>
        <input id="email" name="email" type="email" autoComplete="email" required className="campo" />
      </label>
      <label className="block space-y-1" htmlFor="password">
        <span className="etiqueta">Contraseña</span>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="campo" />
      </label>
      {estado?.error && <p role="alert" className="text-sm font-semibold text-[#A3261E]">{estado.error}</p>}
      <Boton />
    </form>
  );
}
