-- Contaya · Fase 2A · SIRE, credenciales cifradas y bitácora
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0001_init.sql (una sola vez).

-- Comprobantes que llegan del SIRE
alter table public.comprobantes drop constraint if exists comprobantes_origen_check;
alter table public.comprobantes add constraint comprobantes_origen_check check (origen in ('xml','manual','sire'));
alter table public.comprobantes add column if not exists car_sunat text;
alter table public.comprobantes add column if not exists semaforo text not null default 'ambar'
  check (semaforo in ('verde','ambar','rojo'));
alter table public.comprobantes add column if not exists en_sire boolean not null default false;

-- Credenciales SUNAT por cliente. Los secretos se guardan CIFRADOS (AES-256-GCM) por el servidor.
-- Sin políticas de lectura: ni el contador ni el cliente pueden leer esta tabla desde el navegador.
create table public.credenciales_sire (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  usuario_sol text not null,
  client_id text not null,
  secretos_cifrados text not null,      -- {client_secret, clave_sol} cifrados
  autorizacion_fecha date not null,     -- fecha de la autorización firmada por el cliente
  registrado_por uuid references auth.users(id),
  ultimo_uso timestamptz,
  ultimo_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.credenciales_sire enable row level security;
-- El contador solo puede ver SI existen y su estado, mediante esta vista sin secretos:
create view public.estado_credenciales_sire with (security_invoker = false) as
  select cliente_id, usuario_sol, autorizacion_fecha, ultimo_uso, ultimo_error, updated_at
  from public.credenciales_sire
  where public.es_contador();
grant select on public.estado_credenciales_sire to authenticated;

-- Historial de importaciones del SIRE (archivo o API)
create table public.importaciones_sire (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  periodo text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  registro text not null check (registro in ('ventas','compras')),
  via text not null check (via in ('archivo','api')),
  filas int not null default 0,
  nuevos int not null default 0,
  actualizados int not null default 0,
  verdes int not null default 0,
  ambar int not null default 0,
  rojos int not null default 0,
  total_base numeric(14,2),
  total_igv numeric(14,2),
  error text,
  hecho_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.importaciones_sire enable row level security;
create policy contador_todo on public.importaciones_sire for all using (public.es_contador()) with check (public.es_contador());

-- Bitácora: quién hizo qué y cuándo (incluye cada uso de credenciales SUNAT)
create table public.bitacora (
  id bigint generated always as identity primary key,
  cliente_id uuid references public.clientes(id) on delete set null,
  usuario_id uuid references auth.users(id),
  accion text not null,
  detalle jsonb,
  created_at timestamptz not null default now()
);
alter table public.bitacora enable row level security;
create policy contador_lee on public.bitacora for select using (public.es_contador());
create policy contador_escribe on public.bitacora for insert with check (public.es_contador());

-- Mismo formato de serie-número para XML y SIRE: "F001-00000123" → "F001-123"
update public.comprobantes
  set serie_numero = split_part(serie_numero, '-', 1) || '-' || regexp_replace(split_part(serie_numero, '-', 2), '^0+(?=\d)', '')
  where serie_numero ~ '^[A-Za-z0-9]+-0+\d+$';
