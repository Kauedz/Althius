-- A leitura da conexão Unipile ativa pelas Edge Functions (canais-16, ADR-0024).
--
-- O canais-15 criou `private.unipile_connections`: endereço, versão (v1 ou v2) e os NOMES dos segredos no Vault. As
-- funções que falam com a Unipile (envio, conexão de contas, webhook) precisam saber qual é a conexão ativa e ter a chave
-- e o segredo do webhook em mãos. Esta função devolve a linha ativa com a chave e o segredo lidos do Vault pelos nomes
-- que a linha guarda. É a única porta de leitura: o schema `private` não é exposto pela API, e só o service_role (as
-- funções, nunca o navegador) a executa.
--
-- Nada é gravado. Sem conexão ativa, não devolve linha: o canal fica desligado. Se o Vault não tem o segredo, devolve nulo
-- naquele campo: quem lê decide (a chave da variável de função só vale para a conexão padrão; ver connection.ts).
-- O Vault só existe no Supabase: a leitura é dinâmica e protegida por `to_regclass`, para o arquivo também aplicar num
-- banco sem ele.
-- Aditiva: uma função nova.

create function public.get_active_unipile_connection()
returns table (
  connection_id uuid,
  name text,
  base_url text,
  api_version text,
  api_key_secret_name text,
  webhook_secret_name text,
  api_key text,
  webhook_secret text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_connection private.unipile_connections;
  v_api_key text;
  v_webhook_secret text;
begin
  select c.* into v_connection from private.unipile_connections c where c.active;
  if not found then
    return;
  end if;

  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select s.decrypted_secret from vault.decrypted_secrets s where s.name = $1 limit 1'
      into v_api_key using v_connection.api_key_secret_name;
    execute 'select s.decrypted_secret from vault.decrypted_secrets s where s.name = $1 limit 1'
      into v_webhook_secret using v_connection.webhook_secret_name;
  end if;

  return query select
    v_connection.id, v_connection.name, v_connection.base_url, v_connection.api_version,
    v_connection.api_key_secret_name, v_connection.webhook_secret_name, v_api_key, v_webhook_secret;
end;
$$;

revoke all on function public.get_active_unipile_connection() from public, anon, authenticated;
grant execute on function public.get_active_unipile_connection() to service_role;

comment on function public.get_active_unipile_connection() is
  'The active Unipile connection (address, v1 or v2) with the API key and the webhook secret read from the Vault by '
  'name. Only the service_role (the Edge Functions) executes it; it returns no row when no connection is active.';
