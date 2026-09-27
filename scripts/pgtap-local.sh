#!/usr/bin/env bash
# Roda os testes pgTAP de supabase/tests num Postgres 16 local, sem Docker nem Supabase CLI.
# Cria do zero o banco indicado, um esqueleto do que a imagem do Supabase traz (papéis anon, authenticated e
# service_role, auth.users, auth.uid() e o schema extensions), aplica as migrations em ordem e roda os testes.
# Cada sessão ou agente usa um nome de banco próprio, para um não apagar o banco do outro.
#
# Preparação (uma vez por contêiner, como root):
#   apt-get install -y postgresql-16-pgtap
#   no /etc/postgresql/16/main/pg_hba.conf, "trust" nas linhas local e host de 127.0.0.1/::1
#   pg_ctlcluster 16 main start
#
# Uso: scripts/pgtap-local.sh <nome-do-banco> [supabase/tests/<arquivo>.sql ...]
# Sem arquivos, roda todos os de supabase/tests. Sai com 1 se alguma asserção falhar ou o plano não fechar.
set -euo pipefail

banco=${1:?informe o nome do banco (ex.: pgtap_trilha1)}
shift
raiz=$(cd "$(dirname "$0")/.." && pwd)
psql_=(psql -X -q -v ON_ERROR_STOP=1 -U postgres -h localhost)

if [ "$#" -eq 0 ]; then
  set -- "$raiz"/supabase/tests/*.sql
fi

"${psql_[@]}" -d postgres -c "drop database if exists \"$banco\" with (force)" -c "create database \"$banco\""

# O que a imagem do Supabase já traz e as migrations pressupõem.
"${psql_[@]}" -d "$banco" <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end
$$;

create schema if not exists extensions;
create schema if not exists auth;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255),
  confirmation_sent_at timestamptz,
  recovery_token varchar(255),
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz,
  updated_at timestamptz,
  phone text unique,
  phone_confirmed_at timestamptz,
  phone_change text default '',
  phone_change_token varchar(255) default '',
  phone_change_sent_at timestamptz,
  email_change_token_current varchar(255) default '',
  email_change_confirm_status smallint default 0,
  banned_until timestamptz,
  reauthentication_token varchar(255) default '',
  reauthentication_sent_at timestamptz,
  is_sso_user boolean not null default false,
  deleted_at timestamptz,
  is_anonymous boolean not null default false
);
grant select on auth.users to service_role;

-- Como no Supabase: a identidade vem das claims da requisição.
create function auth.uid() returns uuid language sql stable as $f$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$f$;
create function auth.role() returns text language sql stable as $f$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$f$;
create function auth.jwt() returns jsonb language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$f$;
create function auth.email() returns text language sql stable as $f$
  select auth.jwt() ->> 'email'
$f$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- Privilégios padrão do schema public no Supabase: por isso as migrations revogam explicitamente.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
SQL

for migration in "$raiz"/supabase/migrations/*.sql; do
  if ! saida=$("${psql_[@]}" -d "$banco" -f "$migration" 2>&1); then
    echo "migration falhou: $(basename "$migration")" >&2
    echo "$saida" >&2
    exit 1
  fi
done

falhou=0
for teste in "$@"; do
  nome=$(basename "$teste")
  saida=$("${psql_[@]}" -d "$banco" -At -f "$teste" 2>&1) || true
  plano=$(grep -Eo '^1\.\.[0-9]+' <<<"$saida" | head -n 1 | cut -d. -f3)
  ok=$(grep -Ec '^ok [0-9]+' <<<"$saida" || true)
  nao_ok=$(grep -Ec '^not ok [0-9]+' <<<"$saida" || true)
  if [ -z "$plano" ] || [ "$nao_ok" -ne 0 ] || [ "$ok" -ne "$plano" ] || grep -q '^psql:.*ERROR' <<<"$saida"; then
    falhou=1
    echo "FALHOU $nome: plano ${plano:-?}, ok $ok, not ok $nao_ok"
    grep -E '^not ok|^#|ERROR' <<<"$saida" | head -n 40
  else
    echo "ok     $nome: $ok/$plano"
  fi
done
exit "$falhou"
