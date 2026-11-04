"use client";
import { useFormState, useFormStatus } from "react-dom";
import { importarArchivoSire, importarDesdeSunat, guardarCredenciales, type ResultadoSire } from "../../sire-actions";

function Boton({ texto, enviando, clase = "btn-primario" }: { texto: string; enviando: string; clase?: string }) {
  const { pending } = useFormStatus();
  return <button className={clase} disabled={pending}>{pending ? enviando : texto}</button>;
}

function Resultado({ r }: { r?: ResultadoSire }) {
  if (!r) return null;
  return <p role="status" className={`whitespace-pre-line text-sm font-semibold ${r.ok ? "text-verde" : "text-[#A3261E]"}`}>{r.mensaje}</p>;
}

export function FormSunat({ clienteId, periodo }: { clienteId: string; periodo: string }) {
  const [r, accion] = useFormState(importarDesdeSunat, undefined);
  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="cliente_id" value={clienteId} />
      <input type="hidden" name="periodo" value={periodo} />
      <Boton texto="Descargar ventas y compras de SUNAT" enviando="Conectando con SUNAT… (puede tardar hasta 1 minuto)" />
      <Resultado r={r} />
    </form>
  );
}

export function FormArchivoSire({ clienteId, periodo }: { clienteId: string; periodo: string }) {
  const [r, accion] = useFormState(importarArchivoSire, undefined);
  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="cliente_id" value={clienteId} />
      <input type="hidden" name="periodo" value={periodo} />
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2" htmlFor="reg-compras"><input id="reg-compras" type="radio" name="registro" value="compras" defaultChecked /> Compras (RCE)</label>
        <label className="flex items-center gap-2" htmlFor="reg-ventas"><input id="reg-ventas" type="radio" name="registro" value="ventas" /> Ventas (RVIE)</label>
      </div>
      <input id="archivo-sire" name="archivo" type="file" accept=".txt,.csv,.zip" required className="campo" aria-label="Archivo de propuesta del SIRE" />
      <Boton texto="Importar archivo" enviando="Importando…" clase="btn-verde" />
      <Resultado r={r} />
    </form>
  );
}

export function FormCredenciales({ clienteId }: { clienteId: string }) {
  const [r, accion] = useFormState(guardarCredenciales, undefined);
  return (
    <form action={accion} className="space-y-3" autoComplete="off">
      <input type="hidden" name="cliente_id" value={clienteId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1" htmlFor="usuario_sol"><span className="etiqueta">Usuario SOL (secundario)</span>
          <input id="usuario_sol" name="usuario_sol" required className="campo uppercase" autoComplete="off" /></label>
        <label className="block space-y-1" htmlFor="clave_sol"><span className="etiqueta">Clave SOL</span>
          <input id="clave_sol" name="clave_sol" type="password" required className="campo" autoComplete="new-password" /></label>
        <label className="block space-y-1" htmlFor="client_id"><span className="etiqueta">ID de credenciales de API (client_id)</span>
          <input id="client_id" name="client_id" required className="campo" autoComplete="off" /></label>
        <label className="block space-y-1" htmlFor="client_secret"><span className="etiqueta">Clave de credenciales de API (client_secret)</span>
          <input id="client_secret" name="client_secret" type="password" required className="campo" autoComplete="new-password" /></label>
        <label className="block space-y-1" htmlFor="autorizacion_fecha"><span className="etiqueta">Fecha de la autorización firmada</span>
          <input id="autorizacion_fecha" name="autorizacion_fecha" type="date" required className="campo" /></label>
      </div>
      <label className="flex items-start gap-2 text-sm" htmlFor="autorizado">
        <input id="autorizado" name="autorizado" type="checkbox" className="mt-1 h-4 w-4" />
        Tengo la autorización firmada del cliente para descargar su información del SIRE.
      </label>
      <Boton texto="Guardar cifradas" enviando="Guardando…" />
      <Resultado r={r} />
    </form>
  );
}
