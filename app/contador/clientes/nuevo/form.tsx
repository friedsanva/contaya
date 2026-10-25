"use client";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { crearCliente } from "../../actions";

function Boton() {
  const { pending } = useFormStatus();
  return <button className="btn-primario" disabled={pending}>{pending ? "Registrando…" : "Registrar cliente"}</button>;
}

export function FormNuevoCliente() {
  const [estado, accion] = useFormState(crearCliente, undefined);

  if (estado?.ok) {
    const { razon_social, email, clave, clienteId } = estado.ok;
    const mensaje = clave
      ? `Hola, ya tienes acceso a Contaya.\nIngresa en: ${window.location.origin}/login\nCorreo: ${email}\nContraseña temporal: ${clave}\nTe recomendamos cambiarla en "Mi cuenta".`
      : "";
    return (
      <div className="panel space-y-4">
        <h2 className="text-xl font-bold">{razon_social} quedó registrado</h2>
        {clave ? (
          <>
            <p className="text-sm">Envía estos datos al cliente (por ejemplo por WhatsApp). <b>La contraseña no se volverá a mostrar.</b></p>
            <pre className="whitespace-pre-wrap rounded-lg bg-hoja p-3 text-sm">{mensaje}</pre>
            <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(mensaje).catch(() => {})}>Copiar mensaje</button>
          </>
        ) : (
          <p className="text-sm text-gris">No se creó usuario de portal. Puedes subir sus XML tú mismo desde su bandeja.</p>
        )}
        <div className="flex gap-2">
          <Link className="btn-primario" href={`/contador/${clienteId}`}>Abrir su bandeja</Link>
          <a className="btn" href="/contador/clientes/nuevo">Registrar otro</a>
        </div>
      </div>
    );
  }

  return (
    <form action={accion} className="panel space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1" htmlFor="ruc"><span className="etiqueta">RUC</span>
          <input id="ruc" name="ruc" inputMode="numeric" pattern="\d{11}" maxLength={11} required className="campo num" /></label>
        <label className="block space-y-1" htmlFor="regimen"><span className="etiqueta">Régimen</span>
          <select id="regimen" name="regimen" required className="campo" defaultValue="RMT">
            <option value="NRUS">Nuevo RUS</option>
            <option value="RER">RER</option>
            <option value="RMT">MYPE Tributario</option>
            <option value="GENERAL">Régimen General</option>
          </select></label>
      </div>
      <label className="block space-y-1" htmlFor="razon_social"><span className="etiqueta">Razón social</span>
        <input id="razon_social" name="razon_social" required className="campo" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1" htmlFor="tasa_pago_cuenta"><span className="etiqueta">Tasa pago a cuenta (%)</span>
          <input id="tasa_pago_cuenta" name="tasa_pago_cuenta" type="number" step="0.001" min="0" placeholder="Según régimen" className="campo num" /></label>
        <label className="block space-y-1" htmlFor="plan"><span className="etiqueta">Plan</span>
          <select id="plan" name="plan" className="campo" defaultValue="">
            <option value="">Sin definir</option>
            <option value="Emprende">Emprende</option>
            <option value="Crece">Crece</option>
            <option value="Empresa">Empresa</option>
          </select></label>
      </div>
      <label className="flex items-center gap-2 text-sm" htmlFor="tiene_planilla">
        <input id="tiene_planilla" name="tiene_planilla" type="checkbox" className="h-4 w-4" /> Tiene trabajadores en planilla
      </label>
      <fieldset className="space-y-3 border-t border-linea pt-4">
        <legend className="etiqueta">Usuario del portal (opcional)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1" htmlFor="email"><span className="etiqueta">Correo del cliente</span>
            <input id="email" name="email" type="email" className="campo" /></label>
          <label className="block space-y-1" htmlFor="nombre"><span className="etiqueta">Nombre de contacto</span>
            <input id="nombre" name="nombre" className="campo" /></label>
        </div>
      </fieldset>
      {estado?.error && <p role="alert" className="text-sm font-semibold text-[#A3261E]">{estado.error}</p>}
      <Boton />
    </form>
  );
}
