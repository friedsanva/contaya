import Link from "next/link";
import { exigirContador } from "@/lib/sesion";
import { Encabezado } from "@/components/Encabezado";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import { Chip, type TonoChip } from "@/components/Chip";
import { esPeriodo, periodoActual, periodoTexto } from "@/lib/periodo";
import { REGIMEN_TXT, type Cliente } from "@/lib/types";

export const dynamic = "force-dynamic";

type Fila = { cliente_id: string; estado: string; alertas: string[] };

function estadoDe(n: { total: number; pend: number; obs: number; declarado: boolean }): [string, TonoChip] {
  if (n.declarado) return ["Declarado", "ok"];
  if (n.total === 0) return ["Sin comprobantes", "neutro"];
  if (n.obs) return ["Con observaciones", "error"];
  if (n.pend) return ["En revisión", "alerta"];
  return ["Listo para declarar", "info"];
}

export default async function Cartera({ searchParams }: { searchParams: { periodo?: string } }) {
  const { supabase, perfil } = await exigirContador();
  const periodo = esPeriodo(searchParams.periodo) ? searchParams.periodo : periodoActual();

  const [{ data: clientes }, { data: filas }, { data: cierres }] = await Promise.all([
    supabase.from("clientes").select("*").eq("activo", true).order("razon_social").returns<Cliente[]>(),
    supabase.from("comprobantes").select("cliente_id, estado, alertas").eq("periodo", periodo).returns<Fila[]>(),
    supabase.from("cierres").select("cliente_id, estado").eq("periodo", periodo),
  ]);

  const resumen = new Map<string, { total: number; val: number; pend: number; obs: number; alertas: number; declarado: boolean }>();
  for (const c of clientes ?? []) resumen.set(c.id, { total: 0, val: 0, pend: 0, obs: 0, alertas: 0, declarado: false });
  for (const f of filas ?? []) {
    const r = resumen.get(f.cliente_id); if (!r) continue;
    r.total++;
    if (f.estado === "validado") r.val++; else if (f.estado === "observado") r.obs++; else r.pend++;
    if (f.estado === "recibido" && f.alertas?.length) r.alertas++;
  }
  for (const c of cierres ?? []) { const r = resumen.get(c.cliente_id); if (r && c.estado === "declarado") r.declarado = true; }

  const tot = [...resumen.values()];
  const pend = tot.reduce((s, r) => s + r.pend, 0);
  const obs = tot.reduce((s, r) => s + r.obs, 0);
  const decl = tot.filter((r) => r.declarado).length;

  return (
    <>
      <Encabezado rol="contador" email={perfil.email} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Cartera de clientes</h1>
            <p className="text-sm text-gris">Avance de {periodoTexto(periodo)}</p>
          </div>
          <SelectorPeriodo periodo={periodo} />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="panel"><p className="etiqueta">Comprobantes</p><p className="num font-display text-3xl font-bold">{(filas ?? []).length}</p></div>
          <div className="panel"><p className="etiqueta">Por revisar</p><p className="num font-display text-3xl font-bold text-[#8A5A00]">{pend}</p></div>
          <div className="panel"><p className="etiqueta">Observados</p><p className="num font-display text-3xl font-bold text-[#A3261E]">{obs}</p></div>
          <div className="panel"><p className="etiqueta">Declarados</p><p className="num font-display text-3xl font-bold">{decl} <span className="text-base text-gris">de {(clientes ?? []).length}</span></p></div>
        </div>

        {(clientes ?? []).length === 0 ? (
          <div className="panel space-y-3 text-center">
            <h2 className="text-xl font-bold">Aún no tienes clientes</h2>
            <p className="text-gris">Registra tu primer cliente para que empiece a subir sus comprobantes.</p>
            <Link href="/contador/clientes/nuevo" className="btn-primario">Registrar cliente</Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(clientes ?? []).map((c) => {
              const r = resumen.get(c.id)!;
              const [txt, tono] = estadoDe(r);
              return (
                <Link key={c.id} href={`/contador/${c.id}?periodo=${periodo}`} className="panel flex flex-col gap-3 transition hover:border-verde">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Chip tono={tono}>{txt}</Chip>
                    <span className="text-xs font-semibold text-gris">{REGIMEN_TXT[c.regimen]}{c.tiene_planilla ? " · planilla" : ""}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-lg font-semibold leading-tight">{c.razon_social}</p>
                    <p className="num text-xs text-gris">RUC {c.ruc}</p>
                  </div>
                  <div className="flex h-1.5 overflow-hidden rounded bg-hoja" aria-label={`${r.val} de ${r.total} validados`}>
                    <i className="block bg-verde" style={{ width: r.total ? `${(r.val / r.total) * 100}%` : 0 }} />
                    <i className="block bg-[#D9534F]" style={{ width: r.total ? `${(r.obs / r.total) * 100}%` : 0 }} />
                  </div>
                  <div className="flex justify-between text-xs text-gris">
                    <span>{r.val}/{r.total} validados</span>
                    <span className={r.alertas ? "font-bold text-[#A3261E]" : ""}>{r.alertas ? `${r.alertas} con alerta` : "Sin alertas"}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
