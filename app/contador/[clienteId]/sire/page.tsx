import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirContador } from "@/lib/sesion";
import { Encabezado } from "@/components/Encabezado";
import { SelectorPeriodo } from "@/components/SelectorPeriodo";
import { Chip } from "@/components/Chip";
import { esPeriodo, periodoActual, periodoTexto } from "@/lib/periodo";
import { soles } from "@/lib/format";
import { hayLlave } from "@/lib/cripto";
import type { Cliente } from "@/lib/types";
import { FormArchivoSire, FormSunat, FormCredenciales } from "./forms";
import { revocarCredenciales } from "../../sire-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // la descarga desde SUNAT espera a que generen el archivo

type Importacion = { id: string; registro: string; via: string; filas: number; verdes: number; ambar: number; rojos: number; total_base: number | null; total_igv: number | null; error: string | null; created_at: string };
type EstadoCred = { usuario_sol: string; autorizacion_fecha: string; ultimo_uso: string | null; ultimo_error: string | null; updated_at: string };

export default async function Sire({ params, searchParams }: { params: { clienteId: string }; searchParams: { periodo?: string } }) {
  const { supabase, perfil } = await exigirContador();
  const periodo = esPeriodo(searchParams.periodo) ? searchParams.periodo : periodoActual();
  const { data: cliente } = await supabase.from("clientes").select("*").eq("id", params.clienteId).maybeSingle<Cliente>();
  if (!cliente) notFound();
  const [{ data: cred }, { data: hist }] = await Promise.all([
    supabase.from("estado_credenciales_sire").select("*").eq("cliente_id", cliente.id).maybeSingle<EstadoCred>(),
    supabase.from("importaciones_sire").select("*").eq("cliente_id", cliente.id).eq("periodo", periodo).order("created_at", { ascending: false }).limit(10).returns<Importacion[]>(),
  ]);
  const fechaHora = (s: string) => new Date(s).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" });

  return (
    <>
      <Encabezado rol="contador" email={perfil.email} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <Link href={`/contador/${cliente.id}?periodo=${periodo}`} className="text-sm text-gris hover:underline">← Bandeja</Link>
            <h1 className="text-2xl font-bold sm:text-3xl">SIRE de {periodoTexto(periodo)}</h1>
            <p className="text-sm text-gris">{cliente.razon_social} · RUC {cliente.ruc}</p>
          </div>
          <SelectorPeriodo periodo={periodo} />
        </div>

        <p className="panel text-sm">
          Las <b>ventas y compras</b> se toman de las propuestas del SIRE. Lo que cuadra se <b>valida solo</b> (verde);
          a tu bandeja solo llegan las excepciones (ámbar y rojo).
        </p>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="panel space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Descargar de SUNAT</h2>
              {cred ? <Chip tono={cred.ultimo_error ? "alerta" : "ok"}>{cred.ultimo_error ? "Último intento con error" : "Conectado"}</Chip> : <Chip tono="neutro">Sin credenciales</Chip>}
            </div>
            {cred ? (
              <>
                <p className="text-sm text-gris">Usuario SOL <b>{cred.usuario_sol}</b> · autorización del {cred.autorizacion_fecha}{cred.ultimo_uso ? ` · último uso ${fechaHora(cred.ultimo_uso)}` : ""}</p>
                {cred.ultimo_error && <p className="whitespace-pre-line text-xs text-[#A3261E]">{cred.ultimo_error}</p>}
                <FormSunat clienteId={cliente.id} periodo={periodo} />
              </>
            ) : (
              <p className="text-sm text-gris">Registra abajo las credenciales del cliente para descargar sus propuestas automáticamente.</p>
            )}
          </section>

          <section className="panel space-y-3">
            <h2 className="text-lg font-bold">Subir archivo del SIRE</h2>
            <p className="text-sm text-gris">Mientras no haya credenciales: en el SIRE del cliente, abre la propuesta y usa <b>Exportar</b> (TXT o CSV). Súbelo aquí tal cual, también si viene en ZIP.</p>
            <FormArchivoSire clienteId={cliente.id} periodo={periodo} />
          </section>
        </div>

        <section className="panel space-y-3">
          <h2 className="text-lg font-bold">Importaciones de {periodoTexto(periodo)}</h2>
          {(hist ?? []).length === 0 ? <p className="text-sm text-gris">Aún no se importó nada en este periodo.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-xs text-gris"><th className="py-2">Fecha</th><th>Registro</th><th>Vía</th><th className="text-right">Comprob.</th><th className="text-right">Base</th><th className="text-right">IGV</th><th>Resultado</th></tr></thead>
                <tbody>
                  {(hist ?? []).map((h) => (
                    <tr key={h.id} className="border-t border-linea">
                      <td className="py-2">{fechaHora(h.created_at)}</td>
                      <td className="capitalize">{h.registro}</td>
                      <td>{h.via === "api" ? "SUNAT" : "Archivo"}</td>
                      <td className="num text-right">{h.error ? "—" : h.filas}</td>
                      <td className="num text-right">{h.error ? "—" : soles(h.total_base)}</td>
                      <td className="num text-right">{h.error ? "—" : soles(h.total_igv)}</td>
                      <td>{h.error ? <span className="text-xs text-[#A3261E]">{h.error}</span> : (
                        <span className="flex flex-wrap gap-1"><Chip tono="ok">{h.verdes} verdes</Chip>{h.ambar > 0 && <Chip tono="alerta">{h.ambar} ámbar</Chip>}{h.rojos > 0 && <Chip tono="error">{h.rojos} rojos</Chip>}</span>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-gris">Cuadre: la base e IGV de cada importación deben coincidir con los totales que muestra el SIRE para este periodo.</p>
        </section>

        <section className="panel space-y-3">
          <h2 className="text-lg font-bold">{cred ? "Actualizar credenciales SUNAT" : "Registrar credenciales SUNAT"}</h2>
          {!hayLlave() ? (
            <p className="text-sm font-semibold text-[#A3261E]">Falta configurar CONTAYA_CRYPTO_KEY en Vercel. Sin esa llave no se pueden guardar credenciales de forma segura.</p>
          ) : (
            <>
              <ul className="list-disc space-y-1 pl-5 text-sm text-gris">
                <li>Pide al cliente crear un <b>usuario secundario SOL</b> con acceso al SIRE (no uses su clave principal).</li>
                <li>Con ese usuario, en SUNAT Operaciones en Línea, genera las <b>Credenciales de API SUNAT</b> (ID y clave del cliente).</li>
                <li>Se guardan <b>cifradas</b>; nadie podrá verlas después, ni siquiera tú.</li>
              </ul>
              <FormCredenciales clienteId={cliente.id} />
              {cred && <form action={revocarCredenciales}><input type="hidden" name="cliente_id" value={cliente.id} /><button className="btn text-[#A3261E]">Eliminar credenciales</button></form>}
            </>
          )}
        </section>
      </main>
    </>
  );
}
