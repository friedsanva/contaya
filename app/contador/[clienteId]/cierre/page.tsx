import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirContador } from "@/lib/sesion";
import { Encabezado } from "@/components/Encabezado";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import { Chip } from "@/components/Chip";
import { esPeriodo, moverPeriodo, periodoActual, periodoTexto } from "@/lib/periodo";
import { soles } from "@/lib/format";
import { liquidar, diferenciaSire, type Liquidacion } from "@/lib/calculos";
import { REGIMEN_TXT, type Cierre, type Cliente, type Comprobante } from "@/lib/types";
import { guardarCierre, marcarDeclarado, reabrirPeriodo } from "../../actions";

export const dynamic = "force-dynamic";

type CierreDb = Cierre & { resumen: Liquidacion | null };

function Linea({ t, v, fuerte, signo }: { t: string; v: number; fuerte?: boolean; signo?: string }) {
  return (
    <div className={`flex justify-between gap-4 border-b border-dashed border-linea py-2 ${fuerte ? "border-b-0 border-t-2 border-t-tinta pt-3 text-lg font-bold" : ""}`}>
      <span>{t}</span><span className="num">{signo}{soles(v)}</span>
    </div>
  );
}

function Campo({ name, label, valor }: { name: string; label: string; valor: number | null }) {
  return (
    <label className="flex items-center justify-between gap-4 border-b border-dashed border-linea py-2" htmlFor={name}>
      <span>{label}</span>
      <input id={name} name={name} type="number" step="0.01" defaultValue={valor ?? ""} className="campo num w-36 text-right" />
    </label>
  );
}

export default async function CierreMes({ params, searchParams }: { params: { clienteId: string }; searchParams: { periodo?: string } }) {
  const { supabase, perfil } = await exigirContador();
  const periodo = esPeriodo(searchParams.periodo) ? searchParams.periodo : periodoActual();
  const { data: cliente } = await supabase.from("clientes").select("*").eq("id", params.clienteId).maybeSingle<Cliente>();
  if (!cliente) notFound();

  const [{ data: docs }, { data: cierre }, { data: previo }] = await Promise.all([
    supabase.from("comprobantes").select("*").eq("cliente_id", cliente.id).eq("periodo", periodo).returns<Comprobante[]>(),
    supabase.from("cierres").select("*").eq("cliente_id", cliente.id).eq("periodo", periodo).maybeSingle<CierreDb>(),
    supabase.from("cierres").select("*").eq("cliente_id", cliente.id).eq("periodo", moverPeriodo(periodo, -1)).maybeSingle<CierreDb>(),
  ]);

  // Si no hay cierre guardado, se sugieren los saldos que dejó el mes anterior.
  const saldoAnt = cierre ? Number(cierre.saldo_favor_anterior) : Number(previo?.resumen?.saldo_favor_siguiente ?? 0);
  const percAnt = cierre ? Number(cierre.saldo_percepciones_anterior) : Number(previo?.resumen?.percepciones_por_aplicar ?? 0);
  const l = liquidar(docs ?? [], {
    saldo_favor_anterior: saldoAnt,
    percepciones: Number(cierre?.percepciones ?? 0),
    retenciones: Number(cierre?.retenciones ?? 0),
    saldo_percepciones_anterior: percAnt,
    tasa_pago_cuenta: Number(cliente.tasa_pago_cuenta),
  });
  const dV = diferenciaSire(l.ventas_base, cierre?.sire_ventas ?? null);
  const dC = diferenciaSire(l.compras_base, cierre?.sire_compras ?? null);
  const declarado = cierre?.estado === "declarado";
  const nrus = cliente.regimen === "NRUS";
  const ocultos = (
    <>
      <input type="hidden" name="cliente_id" value={cliente.id} />
      <input type="hidden" name="periodo" value={periodo} />
    </>
  );
  const chipSire = (d: number | null) => d === null ? <Chip tono="neutro">Sin dato</Chip> : Math.abs(d) < 0.01 ? <Chip tono="ok">Cuadra</Chip> : <Chip tono="error">Dif. {soles(d)}</Chip>;

  return (
    <>
      <Encabezado rol="contador" email={perfil.email} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <Link href={`/contador/${cliente.id}?periodo=${periodo}`} className="text-sm text-gris hover:underline">← Bandeja</Link>
            <h1 className="text-2xl font-bold sm:text-3xl">Cierre de {periodoTexto(periodo)}</h1>
            <p className="text-sm text-gris">{cliente.razon_social} · RUC {cliente.ruc} · {REGIMEN_TXT[cliente.regimen]}</p>
          </div>
          <SelectorPeriodo periodo={periodo} />
        </div>

        {l.pendientes > 0 && (
          <div className="panel flex flex-wrap items-center justify-between gap-3 border-sol bg-[#FEF8EC]">
            <p>Quedan <b>{l.pendientes}</b> comprobantes sin validar. El cálculo solo considera los validados.</p>
            <Link className="btn" href={`/contador/${cliente.id}?periodo=${periodo}`}>Ir a la bandeja</Link>
          </div>
        )}

        {nrus ? (
          <section className="panel space-y-2">
            <h2 className="text-lg font-bold">Nuevo RUS</h2>
            <p className="text-gris">Este cliente paga una cuota fija según su categoría; no liquida IGV ni pago a cuenta. Controla que no supere los límites de su categoría.</p>
            <Linea t="Ingresos del mes (validados)" v={l.ventas_base + l.igv_ventas + l.ventas_no_gravadas} />
            <Linea t="Compras del mes (validadas)" v={l.compras_base + l.igv_compras + l.compras_sin_credito} />
          </section>
        ) : (
          <form action={guardarCierre} className="grid gap-6 lg:grid-cols-2">
            {ocultos}
            <section className="panel">
              <h2 className="mb-2 text-lg font-bold">Liquidación de IGV</h2>
              <Linea t="Ventas gravadas (base)" v={l.ventas_base} />
              {l.ventas_no_gravadas !== 0 && <Linea t="Ventas no gravadas" v={l.ventas_no_gravadas} />}
              <Linea t="IGV de ventas (débito fiscal)" v={l.igv_ventas} />
              <Linea t="Compras gravadas (base)" v={l.compras_base} />
              <Linea t="IGV de compras (crédito fiscal)" v={l.igv_compras} signo="− " />
              {l.compras_sin_credito !== 0 && <Linea t="Compras sin crédito fiscal (boletas)" v={l.compras_sin_credito} />}
              <Campo name="saldo_favor_anterior" label="Saldo a favor del mes anterior" valor={saldoAnt} />
              <Campo name="percepciones" label="Percepciones del periodo" valor={Number(cierre?.percepciones ?? 0)} />
              <Campo name="retenciones" label="Retenciones del periodo" valor={Number(cierre?.retenciones ?? 0)} />
              <Campo name="saldo_percepciones_anterior" label="Percepciones/retenciones no aplicadas (meses anteriores)" valor={percAnt} />
              <Linea t="IGV por pagar" v={l.igv_por_pagar} fuerte />
              {l.saldo_favor_siguiente > 0 && <p className="text-sm text-verde">Saldo a favor para el mes siguiente: <b className="num">{soles(l.saldo_favor_siguiente)}</b></p>}
              {l.percepciones_por_aplicar > 0 && <p className="text-sm text-verde">Percepciones/retenciones por aplicar: <b className="num">{soles(l.percepciones_por_aplicar)}</b></p>}
            </section>

            <div className="space-y-6">
              <section className="panel">
                <h2 className="mb-2 text-lg font-bold">{cliente.regimen === "RER" ? "Cuota RER" : "Pago a cuenta de Renta"}</h2>
                <Linea t="Ingresos netos del mes" v={l.ingresos_netos} />
                <div className="flex justify-between border-b border-dashed border-linea py-2"><span>Tasa</span><span className="num">{Number(cliente.tasa_pago_cuenta)}%</span></div>
                <Linea t={cliente.regimen === "RER" ? "Cuota RER" : "Pago a cuenta"} v={l.pago_a_cuenta} fuerte />
              </section>

              <section className="panel">
                <h2 className="text-lg font-bold">Cuadre con la propuesta del SIRE</h2>
                <p className="mb-2 text-sm text-gris">Ingresa las bases imponibles que muestra la propuesta del SIRE (RVIE y RCE).</p>
                <label className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-linea py-2" htmlFor="sire_ventas">
                  <span>Ventas según SIRE</span>
                  <span className="flex items-center gap-2"><input id="sire_ventas" name="sire_ventas" type="number" step="0.01" defaultValue={cierre?.sire_ventas ?? ""} className="campo num w-36 text-right" />{chipSire(dV)}</span>
                </label>
                <label className="flex flex-wrap items-center justify-between gap-2 py-2" htmlFor="sire_compras">
                  <span>Compras según SIRE</span>
                  <span className="flex items-center gap-2"><input id="sire_compras" name="sire_compras" type="number" step="0.01" defaultValue={cierre?.sire_compras ?? ""} className="campo num w-36 text-right" />{chipSire(dC)}</span>
                </label>
              </section>

              <div className="flex justify-end"><button className="btn-primario" disabled={declarado}>Guardar y recalcular</button></div>
            </div>
          </form>
        )}

        <section className="panel space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Declaración del periodo</h2>
              {!nrus && <p className="text-sm text-gris">Montos a declarar (redondeados): IGV <b className="num">{soles(l.declarar.igv)}</b> · {cliente.regimen === "RER" ? "Cuota RER" : "Renta"} <b className="num">{soles(l.declarar.renta)}</b></p>}
            </div>
            {declarado ? <Chip tono="ok">Declarado{cierre?.numero_orden ? ` · N.° orden ${cierre.numero_orden}` : ""}</Chip> : <Chip tono="alerta">Pendiente</Chip>}
          </div>
          {declarado ? (
            <form action={reabrirPeriodo}>{ocultos}<button className="btn">Reabrir periodo</button></form>
          ) : (
            <details>
              <summary className="btn-primario cursor-pointer list-none" aria-disabled={l.pendientes > 0}>Marcar como declarado</summary>
              <form action={marcarDeclarado} className="mt-3 flex flex-wrap items-center gap-2">
                {ocultos}
                <label htmlFor="numero_orden" className="text-sm">¿Ya presentaste el Formulario 621 en SUNAT? N.° de orden:</label>
                <input id="numero_orden" name="numero_orden" maxLength={40} className="campo w-48" placeholder="Opcional" />
                <button className="btn-verde">Sí, marcar declarado</button>
              </form>
              {l.pendientes > 0 && <p className="mt-2 text-sm text-[#8A5A00]">Atención: aún hay comprobantes sin validar.</p>}
            </details>
          )}
          <p className="text-xs text-gris">La presentación del Formulario 621 la hace el contador en SUNAT con Clave SOL. Contaya prepara y cuadra los montos.</p>
        </section>
      </main>
    </>
  );
}
