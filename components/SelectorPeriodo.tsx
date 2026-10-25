"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { periodoTexto, ultimosPeriodos, periodoActual, moverPeriodo } from "@/lib/periodo";

export function SelectorPeriodo({ periodo }: { periodo: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const opciones = ultimosPeriodos(moverPeriodo(periodoActual(), 1), 14);
  if (!opciones.includes(periodo)) opciones.push(periodo);
  return (
    <label className="flex items-center gap-2" htmlFor="periodo">
      <span className="etiqueta">Periodo</span>
      <select
        id="periodo"
        className="campo w-auto"
        value={periodo}
        onChange={(e) => {
          const p = new URLSearchParams(params.toString());
          p.set("periodo", e.target.value);
          router.push(`${ruta}?${p.toString()}`);
        }}
      >
        {opciones.map((o) => <option key={o} value={o}>{periodoTexto(o)}</option>)}
      </select>
    </label>
  );
}
