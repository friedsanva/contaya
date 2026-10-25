export type Regimen = "NRUS" | "RER" | "RMT" | "GENERAL";
export type Rol = "contador" | "cliente";
export type TipoRegistro = "venta" | "compra";
export type EstadoComprobante = "recibido" | "validado" | "observado";

export interface Cliente {
  id: string;
  ruc: string;
  razon_social: string;
  regimen: Regimen;
  tasa_pago_cuenta: number; // % sobre ingresos netos (RMT 1, RER 1.5, General 1.5 o coeficiente)
  tiene_planilla: boolean;
  plan: string | null;
  activo: boolean;
}

export interface Perfil {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: Rol;
  cliente_id: string | null;
}

export interface Comprobante {
  id: string;
  cliente_id: string;
  periodo: string; // YYYY-MM
  tipo: TipoRegistro;
  tipo_doc: string; // 01 factura, 03 boleta, 07 nota de crédito, 08 nota de débito
  serie_numero: string;
  fecha_emision: string;
  contraparte_ruc: string;
  contraparte_nombre: string;
  moneda: string;
  tipo_cambio: number | null;
  base_gravada: number;
  no_gravado: number;
  igv: number;
  total: number;
  estado: EstadoComprobante;
  alertas: string[];
  observacion: string | null;
  archivo_path: string | null;
  origen: "xml" | "manual";
  created_at: string;
}

export interface Cierre {
  id: string;
  cliente_id: string;
  periodo: string;
  saldo_favor_anterior: number;
  percepciones: number;
  retenciones: number;
  saldo_percepciones_anterior: number;
  sire_ventas: number | null;
  sire_compras: number | null;
  estado: "abierto" | "declarado";
  numero_orden: string | null;
  declarado_at: string | null;
}

export const REGIMEN_TXT: Record<Regimen, string> = {
  NRUS: "Nuevo RUS",
  RER: "RER",
  RMT: "MYPE Tributario",
  GENERAL: "Régimen General",
};

export const TIPO_DOC_TXT: Record<string, string> = {
  "01": "Factura",
  "03": "Boleta",
  "07": "Nota de crédito",
  "08": "Nota de débito",
};
