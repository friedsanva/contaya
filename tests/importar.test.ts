import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { importarPropuesta } from "@/lib/sire/importar";

type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Supabase mínimo en memoria: select/eq, insert, update/eq. Suficiente para el importador. */
function supabaseFalso(inicial: Fila[] = []) {
  const tabla: Fila[] = inicial.map((f) => ({ ...f }));
  let id = 1000;
  const consulta = (filtros: [string, unknown][] = []) => {
    const q = {
      eq: (k: string, v: unknown) => consulta([...filtros, [k, v]]),
      returns: () => Promise.resolve({ data: tabla.filter((f) => filtros.every(([k, v]) => f[k] === v)), error: null }),
    };
    return q;
  };
  const cliente = {
    from: () => ({
      select: () => consulta(),
      insert: (filas: Fila[]) => { filas.forEach((f) => tabla.push({ id: String(id++), alertas: [], ...f })); return Promise.resolve({ error: null }); },
      update: (cambios: Fila) => ({ eq: (_k: string, v: unknown) => { const f = tabla.find((x) => x.id === v); if (f) Object.assign(f, cambios); return Promise.resolve({ error: null }); } }),
    }),
  };
  return { cliente: cliente as never, tabla };
}

const rce = readFileSync(path.join(__dirname, "fixtures", "sire", "rce-202610.txt"), "utf8");
const CLI = "c1", PER = "2026-10";

describe("importarPropuesta", () => {
  it("valida solo lo verde y deja ámbar/rojo para el contador", async () => {
    const db = supabaseFalso();
    const r = await importarPropuesta(db.cliente, CLI, PER, "compras", rce);
    expect(r).toMatchObject({ filas: 3, nuevos: 3, verdes: 1, ambar: 1, rojos: 1 });
    expect(db.tabla.filter((f) => f.estado === "validado")).toHaveLength(1);
    expect(db.tabla.every((f) => f.origen === "sire" && f.en_sire)).toBe(true);
  });

  it("importar dos veces no duplica", async () => {
    const db = supabaseFalso();
    await importarPropuesta(db.cliente, CLI, PER, "compras", rce);
    const r2 = await importarPropuesta(db.cliente, CLI, PER, "compras", rce);
    expect(r2.nuevos).toBe(0);
    expect(r2.actualizados).toBe(3);
    expect(db.tabla).toHaveLength(3);
  });

  it("cruza con el XML del cliente y marca lo que no está en SUNAT", async () => {
    const base = { cliente_id: CLI, periodo: PER, tipo: "compra", tipo_doc: "01", origen: "xml", estado: "recibido", alertas: [], en_sire: false };
    const db = supabaseFalso([
      { ...base, id: "a", contraparte_ruc: "20100070970", serie_numero: "F001-4521", total: 4720 },
      { ...base, id: "b", contraparte_ruc: "20999999999", serie_numero: "F001-9", total: 100 },
    ]);
    const r = await importarPropuesta(db.cliente, CLI, PER, "compras", rce);
    expect(r).toMatchObject({ nuevos: 2, actualizados: 1, soloEnContaya: 1 });
    const a = db.tabla.find((f) => f.id === "a")!;
    expect(a).toMatchObject({ en_sire: true, estado: "validado" });
    const b = db.tabla.find((f) => f.id === "b")!;
    expect(b.semaforo).toBe("ambar");
    expect(b.alertas.join()).toMatch(/No figura en la propuesta del SIRE/);
  });

  it("si SUNAT difiere de un comprobante ya validado, lo devuelve a revisión", async () => {
    const db = supabaseFalso([{ id: "a", cliente_id: CLI, periodo: PER, tipo: "compra", tipo_doc: "01", origen: "xml", estado: "validado",
      alertas: [], contraparte_ruc: "20100070970", serie_numero: "F001-4521", total: 4000 }]);
    await importarPropuesta(db.cliente, CLI, PER, "compras", rce);
    const a = db.tabla.find((f) => f.id === "a")!;
    expect(a.estado).toBe("recibido");
    expect(a.alertas.join()).toMatch(/no coincide con SUNAT/);
  });
});
