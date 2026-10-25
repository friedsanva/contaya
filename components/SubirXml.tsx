"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ResultadoCarga } from "@/lib/registrar";

type Accion = (form: FormData) => Promise<ResultadoCarga[]>;

export function SubirXml({ accion, periodo, clienteId }: { accion: Accion; periodo: string; clienteId?: string }) {
  const [resultados, setResultados] = useState<ResultadoCarga[]>([]);
  const [encima, setEncima] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function enviar(files: FileList | File[]) {
    const lista = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".xml"));
    if (!lista.length) {
      setResultados([{ archivo: "", ok: false, mensaje: "Elige archivos .xml (el PDF no trae los datos que necesitamos)." }]);
      return;
    }
    const form = new FormData();
    form.set("periodo", periodo);
    if (clienteId) form.set("cliente_id", clienteId);
    lista.slice(0, 50).forEach((f) => form.append("archivos", f));
    iniciar(async () => {
      const r = await accion(form);
      setResultados(r);
      if (input.current) input.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor="archivos"
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); enviar(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${encima ? "border-verde bg-verde/10" : "border-linea bg-hoja"}`}
      >
        <input ref={input} id="archivos" type="file" accept=".xml,text/xml,application/xml" multiple className="sr-only" onChange={(e) => e.target.files && enviar(e.target.files)} disabled={pendiente} />
        <span className="font-display text-lg font-semibold">{pendiente ? "Leyendo tus comprobantes…" : "Arrastra tus XML aquí o toca para elegirlos"}</span>
        <span className="text-sm text-gris">Facturas, boletas y notas de compra y venta. Hasta 50 archivos por vez.</span>
      </label>
      {resultados.length > 0 && (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {resultados.map((r, i) => (
            <li key={i} className={r.ok ? "text-[#1F6B57]" : "text-[#A3261E]"}>
              {r.ok ? "✓" : "✗"} {r.archivo && <b className="font-semibold">{r.archivo}: </b>}{r.mensaje}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
