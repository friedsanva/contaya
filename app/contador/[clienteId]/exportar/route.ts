import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { esPeriodo } from "@/lib/periodo";
import type { Comprobante } from "@/lib/types";

const celda = (v: unknown) => {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Registro de ventas o compras del periodo en CSV (se abre directo en Excel). */
export async function GET(req: NextRequest, { params }: { params: { clienteId: string } }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });
  const periodo = req.nextUrl.searchParams.get("periodo");
  const tipo = req.nextUrl.searchParams.get("tipo") === "venta" ? "venta" : "compra";
  if (!esPeriodo(periodo)) return new NextResponse("Periodo no válido", { status: 400 });

  const { data: cliente } = await supabase.from("clientes").select("ruc").eq("id", params.clienteId).single();
  if (!cliente) return new NextResponse("No encontrado", { status: 404 });
  const { data } = await supabase.from("comprobantes").select("*").eq("cliente_id", params.clienteId).eq("periodo", periodo).eq("tipo", tipo).order("fecha_emision").returns<Comprobante[]>();

  const cab = ["Fecha", "Tipo doc", "Serie-Número", tipo === "venta" ? "Doc. cliente" : "RUC proveedor", "Razón social", "Moneda", "T.C.", "Base gravada", "No gravado", "IGV", "Total", "Estado", "Alertas"];
  const filas = (data ?? []).map((d) => [d.fecha_emision, d.tipo_doc, d.serie_numero, d.contraparte_ruc, d.contraparte_nombre, d.moneda, d.tipo_cambio ?? "", d.base_gravada, d.no_gravado, d.igv, d.total, d.estado, d.alertas.join(" | ")]);
  const csv = "﻿" + [cab, ...filas].map((f) => f.map(celda).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tipo === "venta" ? "ventas" : "compras"}-${cliente.ruc}-${periodo}.csv"`,
    },
  });
}
