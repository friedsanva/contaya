-- Contaya · Fase 2B-1 · Validez de cada comprobante (Consulta Integrada de CPE de SUNAT)
-- Guarda la última respuesta oficial de SUNAT por comprobante. No guarda credenciales.

alter table public.comprobantes add column if not exists validez_sunat jsonb;       -- {estadoCp, estadoRuc, condDomiRuc, observaciones}
alter table public.comprobantes add column if not exists validez_at timestamptz;    -- cuándo se consultó
alter table public.comprobantes add column if not exists validez_motivo text;       -- por qué no se pudo consultar (si aplica)

-- Para encontrar rápido lo que falta verificar en un periodo
create index if not exists comprobantes_validez_pendiente
  on public.comprobantes (cliente_id, periodo) where validez_at is null;

-- El cliente puede subir comprobantes, pero NUNCA marcar su validez: eso solo lo escribe Contaya
-- tras consultar a SUNAT (acción del contador). Se rehace la política de inserción del cliente.
drop policy if exists cliente_sube_los_suyos on public.comprobantes;
create policy cliente_sube_los_suyos on public.comprobantes for insert
  with check (cliente_id = public.mi_cliente_id() and estado = 'recibido' and validado_por is null
              and validez_sunat is null and validez_at is null and validez_motivo is null);
