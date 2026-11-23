#!/usr/bin/env bash
# Aplica, en orden y una sola vez, cada archivo de supabase/migrations.
# Guarda lo aplicado en public._migraciones. Cada archivo corre en una transacción: si falla, no queda a medias.
set -euo pipefail
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "::error::Falta el secreto SUPABASE_DB_URL en GitHub (Settings → Secrets and variables → Actions)."; exit 1
fi
PSQL=(psql "$SUPABASE_DB_URL" -X -q -t -A -v ON_ERROR_STOP=1)

"${PSQL[@]}" -c "set client_min_messages to warning; create table if not exists public._migraciones (nombre text primary key, aplicada timestamptz not null default now());
alter table public._migraciones enable row level security;"

# Migraciones que se ejecutaron a mano antes de esta automatización: se registran sin volver a correrlas.
registrar_si_existe() { # $1 = archivo, $2 = tabla que crea
  "${PSQL[@]}" -c "insert into public._migraciones (nombre)
    select '$1' where to_regclass('public.$2') is not null on conflict do nothing;"
}
registrar_si_existe 0001_init.sql clientes
registrar_si_existe 0002_sire.sql credenciales_sire

for f in $(ls supabase/migrations/*.sql | sort); do
  n=$(basename "$f")
  ya=$("${PSQL[@]}" -c "select 1 from public._migraciones where nombre = '$n'")
  if [ "$ya" = "1" ]; then echo "✓ $n ya estaba aplicada"; continue; fi
  echo "→ Aplicando $n"
  { cat "$f"; echo; echo "insert into public._migraciones (nombre) values ('$n');"; } | "${PSQL[@]}" -1 -f -
  echo "✓ $n aplicada"
done
