/** Utilidades de RUC (funciones puras, con pruebas en tests/ruc.test.ts). */

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Valida formato y dígito verificador (módulo 11) del RUC peruano. */
export function rucValido(ruc: string): boolean {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const suma = PESOS.reduce((s, p, i) => s + p * Number(ruc[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 10) dv = 0;
  if (dv === 11) dv = 1;
  return dv === Number(ruc[10]);
}

export interface DatosRuc {
  ruc: string;
  razon_social: string;
  estado: string | null;     // ACTIVO, BAJA DE OFICIO, ...
  condicion: string | null;  // HABIDO, NO HABIDO, ...
  direccion: string | null;
  fuente: string;
}

type Crudo = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Unifica la respuesta de los proveedores (Decolecta u OpenRUC). */
export function normalizarRuc(ruc: string, d: Crudo, fuente: string): DatosRuc | null {
  const razon = texto(d.razon_social) ?? texto(d.razonSocial) ?? texto(d.nombre);
  if (!razon) return null;
  return {
    ruc,
    razon_social: razon,
    estado: texto(d.estado),
    condicion: texto(d.condicion),
    direccion: texto(d.direccion) ?? texto(d["dirección"]),
    fuente,
  };
}

/** Mensaje de alerta si el contribuyente no está ACTIVO y HABIDO. */
export function alertaRuc(d: Pick<DatosRuc, "estado" | "condicion">): string | null {
  const malos: string[] = [];
  if (d.estado && d.estado.toUpperCase() !== "ACTIVO") malos.push(`estado ${d.estado}`);
  if (d.condicion && d.condicion.toUpperCase() !== "HABIDO") malos.push(`condición ${d.condicion}`);
  return malos.length ? `Atención: el contribuyente figura con ${malos.join(" y ")} en SUNAT.` : null;
}
