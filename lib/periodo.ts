const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];

const RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function esPeriodo(p: unknown): p is string {
  return typeof p === "string" && RE.test(p);
}

/** Periodo tributario que normalmente se trabaja hoy: el mes anterior (hora de Lima). */
export function periodoActual(hoy = new Date()): string {
  const lima = new Date(hoy.toLocaleString("en-US", { timeZone: "America/Lima" }));
  lima.setDate(1);
  lima.setMonth(lima.getMonth() - 1);
  return `${lima.getFullYear()}-${String(lima.getMonth() + 1).padStart(2, "0")}`;
}

export function periodoDeFecha(fecha: string): string {
  return fecha.slice(0, 7);
}

export function periodoTexto(p: string): string {
  const [y, m] = p.split("-");
  return `${MESES[Number(m) - 1]} ${y}`;
}

export function moverPeriodo(p: string, delta: number): string {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Lista de los últimos n periodos terminando en `hasta` (incluido), del más reciente al más antiguo. */
export function ultimosPeriodos(hasta: string, n = 12): string[] {
  return Array.from({ length: n }, (_, i) => moverPeriodo(hasta, -i));
}
