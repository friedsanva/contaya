import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirContador } from "@/lib/sesion";
import { Encabezado } from "@/components/Encabezado";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import { SubirXml } from "@/components/SubirXml";
import { Chip, ChipEstado } from "@/components/Chip";
import { esPeriodo, periodoActual, periodoTexto } from "@/lib/periodo";
import { soles, fechaCorta } from "@/lib/format";
import { REGIMEN_TXT, TIPO_DOC_TXT, type Cliente, type Comprobante } from "@/lib/types";
import { validar, revertir, observar, fijarTipoCambio, validarSinAlertas, eliminarComprobante, subirXmlContador } from "../actions";

export const dynamic = "force-dynamic";

const ORDEN = { recibido: 0, observado: 1, validado: 2 } as const;
const SEM = { rojo: 0, ambar: 1, verde: 2 } as const;

export default async function Bandeja({ params, searchParams }: { params: { clienteId: string }; searchParams: { periodo?: string; tipo?: string } }) {
  const { supabase, perfil } = await exigirContador();
  const periodo = esPeriodo(searchParams.periodo) ? searchParams.periodo : periodoActual();
  const tipo = searchParams.tipo === "venta" ? "venta" : "compra";

  const { data: cliente } = await supabase.from("clientes").select("*").eq("id", params.clienteId).maybeSingle<Cliente>();
  if (!cliente) notFound();
  const { data: docs } = await supabase.from("comprobantes").select("*").eq("cliente_id", cliente.id).eq("periodo", periodo).returns<Comprobante[]>();
  const todos = docs ?? [];
  const lista = todos.filter((d) => d.tipo === tipo).sort((a, b) =>
    ORDEN[a.estado] - ORDEN[b.estado] || (SEM[a.semaforo] ?? 1) - (SEM[b.semaforo] ?? 1) || a.fecha_emision.localeCompare(b.fecha_emision));
  const nV = todos.filter((d) => d.tipo === "venta").length;
  const nC = todos.length - nV;
  const limpios = lista.filter((d) => d.estado === "recibido" && d.alertas.length === 0).length;
  const excepciones = todos.filter((d) => d.estado !== "validado").length;
  const autoValidados = todos.filter((d) => d.origen === "sire" && d.estado === "validado").length;
  const q = (t: string) => `?periodo=${periodo}&tipo=${t}`;

  return (
    <>
      <Encabezado rol="contador" email={perfil.email} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <Link href={`/contador?periodo=${periodo}`} className="text-sm text-gris hover:underline">← Cartera</Link>
            <h1 className="text-2xl font-bold sm:text-3xl">{cliente.razon_social}</h1>
            <p className="text-sm text-gris">RUC {cliente.ruc} · {REGIMEN_TXT[cliente.regimen]} · {periodoTexto(periodo)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelectorPeriodo periodo={periodo} />
            <Link className="btn" href={`/contador/${cliente.id}/sire?periodo=${periodo}`}>SIRE</Link>
            <Link className="btn-primario" href={`/contador/${cliente.id}/cierre?periodo=${periodo}`}>Cierre del mes →</Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="panel"><p className="etiqueta">Para revisar</p><p className="num font-display text-3xl font-bold text-[#8A5A00]">{excepciones}</p></div>
          <div className="panel"><p className="etiqueta">Validados solos (SIRE)</p><p className="num font-display text-3xl font-bold text-verde">{autoValidados}</p></div>
          <div className="panel col-span-2 md:col-span-1"><p className="etiqueta">Total del periodo</p><p className="num font-display text-3xl font-bold">{todos.length}</p></div>
        </div>

        <section className="panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-full bg-hoja p-1" role="group" aria-label="Registro">
              <Link href={q("venta")} aria-current={tipo === "venta" ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tipo === "venta" ? "bg-white shadow" : "text-gris"}`}>Ventas ({nV})</Link>
              <Link href={q("compra")} aria-current={tipo === "compra" ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tipo === "compra" ? "bg-white shadow" : "text-gris"}`}>Compras ({nC})</Link>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className="btn" href={`/contador/${cliente.id}/exportar?periodo=${periodo}&tipo=${tipo}`}>Exportar {tipo === "venta" ? "ventas" : "compras"} (CSV)</a>
              <form action={validarSinAlertas}>
                <input type="hidden" name="cliente_id" value={cliente.id} />
                <input type="hidden" name="periodo" value={periodo} />
                <input type="hidden" name="tipo" value={tipo} />
                <button className="btn-verde" disabled={!limpios}>Validar {limpios} sin alertas</button>
              </form>
            </div>
          </div>

          {lista.length === 0 ? (
            <p className="py-6 text-center text-sm text-gris">No hay {tipo === "venta" ? "ventas" : "compras"} en {periodoTexto(periodo)}.</p>
          ) : (
            <ul className="divide-y divide-linea border-t border-linea">
              {lista.map((d) => (
                <li key={d.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{d.contraparte_nombre}</p>
                    <p className="text-xs text-gris">
                      <span className="num">{d.serie_numero}</span> · {TIPO_DOC_TXT[d.tipo_doc] ?? d.tipo_doc} · {fechaCorta(d.fecha_emision)} · {d.contraparte_ruc}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="num font-semibold">{d.moneda === "PEN" ? soles(d.total) : `${d.moneda} ${Number(d.total).toFixed(2)}`}</p>
                    <p className="num text-xs text-gris">Base {Number(d.base_gravada).toFixed(2)} · IGV {Number(d.igv).toFixed(2)}{d.no_gravado ? ` · No grav. ${Number(d.no_gravado).toFixed(2)}` : ""}</p>
                  </div>
                  {d.alertas.map((a) => a.startsWith("ℹ")
                    ? <p key={a} className="text-xs text-gris sm:col-span-2">{a}</p>
                    : <p key={a} className={`text-xs font-semibold sm:col-span-2 ${d.semaforo === "rojo" ? "text-[#A3261E]" : "text-[#8A5A00]"}`}>⚠ {a}</p>)}
                  {d.observacion && d.estado === "observado" && <p className="text-xs text-[#8A5A00] sm:col-span-2">Observación enviada: {d.observacion}</p>}
                  <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                    <ChipEstado estado={d.estado} />
                    {d.origen === "sire" ? <Chip tono="info">SIRE</Chip> : d.en_sire ? <Chip tono="info">XML · en SIRE</Chip> : <Chip tono="neutro">XML</Chip>}
                    {d.estado !== "validado" && <Chip tono={d.semaforo === "rojo" ? "error" : d.semaforo === "ambar" ? "alerta" : "ok"}>{d.semaforo === "rojo" ? "Rojo" : d.semaforo === "ambar" ? "Ámbar" : "Verde"}</Chip>}
                    {d.moneda !== "PEN" && (
                      <form action={fijarTipoCambio} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={d.id} />
                        <label className="text-xs text-gris" htmlFor={`tc-${d.id}`}>T.C.</label>
                        <input id={`tc-${d.id}`} name="tipo_cambio" type="number" step="0.001" min="0" defaultValue={d.tipo_cambio ?? ""} placeholder="3.750" className="campo w-24 py-1 text-right" />
                        <button className="btn py-1">Guardar</button>
                      </form>
                    )}
                    {d.estado !== "validado" ? (
                      <form action={validar.bind(null, d.id)}>
                        <button className="btn-verde py-1" disabled={d.moneda !== "PEN" && !d.tipo_cambio} title={d.moneda !== "PEN" && !d.tipo_cambio ? "Registra el tipo de cambio primero" : ""}>Validar</button>
                      </form>
                    ) : (
                      <form action={revertir.bind(null, d.id)}><button className="btn py-1">Revertir</button></form>
                    )}
                    {d.estado !== "observado" && (
                      <details className="group">
                        <summary className="btn-sol cursor-pointer list-none py-1">Observar</summary>
                        <form action={observar} className="mt-2 flex flex-wrap gap-2">
                          <input type="hidden" name="id" value={d.id} />
                          <input name="motivo" required maxLength={500} placeholder="Motivo para el cliente" className="campo w-64 py-1" aria-label="Motivo de la observación" />
                          <button className="btn-primario py-1">Enviar</button>
                        </form>
                      </details>
                    )}
                    <details>
                      <summary className="btn cursor-pointer list-none py-1 text-gris">Eliminar</summary>
                      <form action={eliminarComprobante} className="mt-2 flex items-center gap-2">
                        <input type="hidden" name="id" value={d.id} />
                        <span className="text-xs">¿Eliminar este comprobante?</span>
                        <button className="btn py-1 text-[#A3261E]">Sí, eliminar</button>
                      </form>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel space-y-3">
          <h2 className="text-lg font-bold">Subir XML a nombre del cliente</h2>
          <SubirXml accion={subirXmlContador} periodo={periodo} clienteId={cliente.id} />
        </section>
      </main>
    </>
  );
}
