-- Contaya · Fase 1 · Esquema inicial
-- Ejecutar en Supabase → SQL Editor (una sola vez, en un proyecto nuevo).

-- =========================================================
-- Tablas
-- =========================================================
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  ruc text not null unique check (ruc ~ '^(10|15|17|20)\d{9}$'),
  razon_social text not null,
  regimen text not null check (regimen in ('NRUS','RER','RMT','GENERAL')),
  tasa_pago_cuenta numeric(6,3) not null default 1,
  tiene_planilla boolean not null default false,
  plan text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text,
  rol text not null default 'cliente' check (rol in ('contador','cliente')),
  cliente_id uuid references public.clientes(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.comprobantes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  periodo text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  tipo text not null check (tipo in ('venta','compra')),
  tipo_doc text not null default '01',
  serie_numero text not null,
  fecha_emision date not null,
  contraparte_ruc text not null,
  contraparte_nombre text not null,
  moneda text not null default 'PEN',
  tipo_cambio numeric(8,3),
  base_gravada numeric(14,2) not null default 0,
  no_gravado numeric(14,2) not null default 0,
  igv numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  estado text not null default 'recibido' check (estado in ('recibido','validado','observado')),
  alertas text[] not null default '{}',
  observacion text,
  archivo_path text,
  origen text not null default 'xml' check (origen in ('xml','manual')),
  subido_por uuid references auth.users(id),
  validado_por uuid references auth.users(id),
  validado_at timestamptz,
  created_at timestamptz not null default now(),
  -- el mismo comprobante no se registra dos veces
  unique (cliente_id, tipo, contraparte_ruc, tipo_doc, serie_numero)
);
create index comprobantes_cliente_periodo on public.comprobantes (cliente_id, periodo);

create table public.cierres (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  periodo text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  saldo_favor_anterior numeric(14,2) not null default 0,
  percepciones numeric(14,2) not null default 0,
  retenciones numeric(14,2) not null default 0,
  saldo_percepciones_anterior numeric(14,2) not null default 0,
  sire_ventas numeric(14,2),
  sire_compras numeric(14,2),
  estado text not null default 'abierto' check (estado in ('abierto','declarado')),
  numero_orden text,
  -- foto de la liquidación al momento de declarar
  resumen jsonb,
  declarado_at timestamptz,
  declarado_por uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (cliente_id, periodo)
);

-- =========================================================
-- Funciones de apoyo para los permisos
-- =========================================================
create or replace function public.es_contador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'contador');
$$;

create or replace function public.mi_cliente_id() returns uuid
language sql stable security definer set search_path = public as $$
  select cliente_id from public.perfiles where id = auth.uid();
$$;

-- Cada usuario nuevo recibe un perfil "cliente" sin empresa asignada.
-- El rol y la empresa solo los asigna el contador desde la app (con la llave de servidor).
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end; $$;

create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

-- =========================================================
-- Seguridad por filas (RLS): cada cliente ve solo lo suyo
-- =========================================================
alter table public.clientes enable row level security;
alter table public.perfiles enable row level security;
alter table public.comprobantes enable row level security;
alter table public.cierres enable row level security;

create policy contador_todo on public.clientes for all using (public.es_contador()) with check (public.es_contador());
create policy cliente_ve_su_empresa on public.clientes for select using (id = public.mi_cliente_id());

create policy contador_todo on public.perfiles for all using (public.es_contador()) with check (public.es_contador());
create policy ve_su_perfil on public.perfiles for select using (id = auth.uid());

create policy contador_todo on public.comprobantes for all using (public.es_contador()) with check (public.es_contador());
create policy cliente_ve_los_suyos on public.comprobantes for select using (cliente_id = public.mi_cliente_id());
create policy cliente_sube_los_suyos on public.comprobantes for insert
  with check (cliente_id = public.mi_cliente_id() and estado = 'recibido' and validado_por is null);

create policy contador_todo on public.cierres for all using (public.es_contador()) with check (public.es_contador());
create policy cliente_ve_sus_cierres on public.cierres for select using (cliente_id = public.mi_cliente_id());

-- =========================================================
-- Almacenamiento de archivos XML (privado). Ruta: <cliente_id>/<periodo>/<archivo>
-- =========================================================
insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false)
  on conflict (id) do nothing;

create policy contador_archivos on storage.objects for all
  using (bucket_id = 'comprobantes' and public.es_contador())
  with check (bucket_id = 'comprobantes' and public.es_contador());

create policy cliente_lee_sus_archivos on storage.objects for select
  using (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = public.mi_cliente_id()::text);

create policy cliente_sube_sus_archivos on storage.objects for insert
  with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = public.mi_cliente_id()::text);

-- =========================================================
-- Primer contador (ejecutar DESPUÉS de crear tu usuario en Authentication → Users):
--   update public.perfiles set rol = 'contador', nombre = 'Tu nombre' where email = 'tu-correo@dominio.pe';
-- =========================================================
