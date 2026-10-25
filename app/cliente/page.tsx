import { exigirCliente } from "@/lib/sesion";
import { Encabezado } from "@/components/Encabezado";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import { SubirXml } from "@/components/SubirXml";
import { Chip, ChipEstado } from "@/components/Chip";
import { esPeriodo, periodoActual, periodoTexto } from "@/lib/periodo";
import { soles, fechaCorta } from "@/lib/format";
import { REGIMEN_TXT, TIPO_DOC_TXT, type Cierre, type Comprobante } from "@/lib/types";
import { subirXmlCliente } from "./actions";

export const dynamic = "force-dynamic";

export default async function PortalCliente({ searchParams }: { searchParams: { periodo?: string } }) {
  const { supabase, perfil, cliente } = await exigirCliente();
  const periodo = esPeriodo(searchParams.periodo) ? searchParams.periodo : periodoActual();

  const [{ data: docs }, { data: cierre }] = await Promise.all([
    supabase.from("comprobantes").select("*").eq("cliente_id", cliente.id).eq("periodo", periodo).order("created_at", { ascending: false }).returns<Comprobante[]>(),
    supabase.from("cierres").select("*").eq("cliente_id", cliente.id).eq("periodo", periodo).maybeSingle<Cierre & { resumen: { declarar?: { igv: number; renta: number } } | null }>(),
  ]);
  const lista = docs ?? [];
  const observados = lista.filter((d) => d.estado === "observado");
  const validados = lista.filter((d) => d.estado === "validado").length;

  return (
    <>
      <Encabezado rol="cliente" email={perfil.email} titulo={cliente.razon_social} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Mis comprobantes de {periodoTexto(periodo)}</h1>
            <p className="text-sm text-gris">RUC {cliente.ruc} · {REGIMEN_TXT[cliente.regimen]}</p>
          </div>
          <SelectorPeriodo periodo={periodo} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="panel"><p className="etiqueta">Enviados</p><p className="num font-display text-3xl font-bold">{lista.length}</p></div>
          <div className="panel"><p className="etiqueta">Validados por tu contador</p><p className="num font-display text-3xl font-bold text-verde">{validados}</p></div>
          <div className="panel">
            <p className="etiqueta">Declaración del mes</p>
            {cierre?.estado === "declarado" ? (
              <div className="space-y-1">
                <Chip tono="ok">Declarado</Chip>
                {cierre.resumen?.declarar && <p className="text-sm">IGV: <b className="num">{soles(cierre.resumen.declarar.igv)}</b> · Renta: <b className="num">{soles(cierre.resumen.declarar.renta)}</b></p>}
              </div>
            ) : (
              <p className="mt-1"><Chip tono="alerta">En preparación</Chip></p>
            )}
          </div>
        </div>

        {observados.length > 0 && (
          <section className="panel border-[#E8B4AE] bg-[#FDF3F2]">
            <h2 className="text-lg font-bold">Tu contador necesita algo</h2>
            <ul className="mt-2 space-y-2">
              {observados.map((d) => (
                <li key={d.id} className="text-sm"><b className="num">{d.serie_numero}</b> · {d.contraparte_nombre}<br /><span className="text-[#A3261E]">{d.observacion}</span></li>
              ))}
            </ul>
          </section>
        )}

        <section className="panel space-y-3">
          <h2 className="text-lg font-bold">Subir comprobantes</h2>
          <SubirXml accion={subirXmlCliente} periodo={periodo} />
          <p className="text-xs text-gris">Descarga el XML desde tu sistema de facturación o desde SUNAT Operaciones en Línea. El sistema detecta solo si es compra o venta.</p>
        </section>

        <section className="panel">
          <h2 className="mb-3 text-lg font-bold">Enviados en {periodoTexto(periodo)}</h2>
          {lista.length === 0 ? (
            <p className="text-sm text-gris">Aún no hay comprobantes en este periodo. Sube tus XML de compras y ventas arriba.</p>
          ) : (
            <ul className="divide-y divide-linea">
              {lista.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{d.contraparte_nombre}</p>
                    <p className="text-xs text-gris"><span className="num">{d.serie_numero}</span> · {TIPO_DOC_TXT[d.tipo_doc] ?? d.tipo_doc} de {d.tipo} · {fechaCorta(d.fecha_emision)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="num font-semibold">{d.moneda === "PEN" ? soles(d.total) : `${d.moneda} ${d.total.toFixed(2)}`}</span>
                    <ChipEstado estado={d.estado} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
