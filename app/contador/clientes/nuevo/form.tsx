"use client";
import Link from "next/link";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { crearCliente } from "../../actions";
import { rucValido, alertaRuc, type DatosRuc } from "@/lib/ruc";

const TASAS: Record<string, { tasa: string; ayuda: string }> = {
  NRUS: { tasa: "0", ayuda: "Nuevo RUS no hace pagos a cuenta: paga una cuota fija según su categoría." },
  RER: { tasa: "1.5", ayuda: "RER: cuota mensual definitiva del 1.5 % de los ingresos netos (no hay declaración anual)." },
  RMT: { tasa: "1", ayuda: "MYPE Tributario: 1 % de los ingresos netos del mes mientras no supere 300 UIT al año; luego, coeficiente o 1.5 %." },
  GENERAL: { tasa: "1.5", ayuda: "Régimen General: el coeficiente del año anterior, o 1.5 % si no tuvo impuesto calculado. Cámbialo si corresponde." },
};

function CampoRuc({ onDatos }: { onDatos: (d: DatosRuc | null) => void }) {
  const [ruc, setRuc] = useState("");
  const [estado, setEstado] = useState<{ tono: "ok" | "error" | "info"; texto: string } | null>(null);
  async function buscar(valor: string) {
    if (!rucValido(valor)) { setEstado({ tono: "error", texto: "El RUC no es válido: revisa los 11 dígitos." }); onDatos(null); return; }
    setEstado({ tono: "info", texto: "Buscando en SUNAT…" });
    try {
      const r = await fetch(`/api/ruc/${valor}`);
      const d = await r.json();
      if (!r.ok) { setEstado({ tono: "error", texto: d.error ?? "No se encontró el RUC." }); onDatos(null); return; }
      onDatos(d);
      const alerta = alertaRuc(d);
      setEstado(alerta ? { tono: "error", texto: alerta } : { tono: "ok", texto: `${d.estado ?? "—"} · ${d.condicion ?? "—"}${d.direccion ? " · " + d.direccion : ""}` });
    } catch {
      setEstado({ tono: "error", texto: "No se pudo consultar ahora. Escribe la razón social a mano." });
      onDatos(null);
    }
  }
  return (
    <label className="block space-y-1" htmlFor="ruc"><span className="etiqueta">RUC</span>
      <input id="ruc" name="ruc" inputMode="numeric" pattern="\d{11}" maxLength={11} required className="campo num" value={ruc}
        onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 11); setRuc(v); setEstado(null); if (v.length === 11) buscar(v); }} />
      {estado && <span role="status" className={`block text-xs font-semibold ${estado.tono === "ok" ? "text-verde" : estado.tono === "error" ? "text-[#A3261E]" : "text-gris"}`}>{estado.texto}</span>}
    </label>
  );
}

function Boton() {
  const { pending } = useFormStatus();
  return <button className="btn-primario" disabled={pending}>{pending ? "Registrando…" : "Registrar cliente"}</button>;
}

export function FormNuevoCliente() {
  const [estado, accion] = useFormState(crearCliente, undefined);
  const [razon, setRazon] = useState("");
  const [regimen, setRegimen] = useState("RMT");
  const [tasa, setTasa] = useState(TASAS.RMT.tasa);

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
        <CampoRuc onDatos={(d) => d && setRazon(d.razon_social)} />
        <label className="block space-y-1" htmlFor="regimen"><span className="etiqueta">Régimen</span>
          <select id="regimen" name="regimen" required className="campo" value={regimen}
            onChange={(e) => { setRegimen(e.target.value); setTasa(TASAS[e.target.value].tasa); }}>
            <option value="NRUS">Nuevo RUS</option>
            <option value="RER">RER</option>
            <option value="RMT">MYPE Tributario</option>
            <option value="GENERAL">Régimen General</option>
          </select></label>
      </div>
      <label className="block space-y-1" htmlFor="razon_social"><span className="etiqueta">Razón social</span>
        <input id="razon_social" name="razon_social" required className="campo" value={razon} onChange={(e) => setRazon(e.target.value)} placeholder="Se completa sola al escribir el RUC" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1" htmlFor="tasa_pago_cuenta"><span className="etiqueta">{regimen === "RER" ? "Cuota RER (%)" : "Tasa de pago a cuenta de Renta (%)"}</span>
          <input id="tasa_pago_cuenta" name="tasa_pago_cuenta" type="number" step="0.0001" min="0" max="30" className="campo num" value={tasa} onChange={(e) => setTasa(e.target.value)} disabled={regimen === "NRUS"} />
          <span className="block text-xs text-gris">{TASAS[regimen].ayuda}</span></label>
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
