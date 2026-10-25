export function soles(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return "S/ " + v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
