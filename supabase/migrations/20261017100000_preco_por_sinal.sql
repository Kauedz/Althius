-- Preço fixo por Sinal em créditos (creditos-moeda-unica). O crédito passa a ser a única moeda que o cliente vê: cada card do
-- catálogo tem um preço fixo por Conta varrida (`credits_per_account`), independente do fornecedor. O dólar sai dos rótulos;
-- a coluna `estimated_cost_usd` fica como registro interno e a tela não a lê mais.
--
--   Faixa 1, 1 crédito: fontes públicas (CNPJ, DOU, financiamento, comércio exterior, energia, safra, avaliações).
--   Faixa 2, 2 créditos: vagas, publicações, movimentação de pessoas e anúncios.
--   Sinais de Mercado, sem Conta: 3 créditos por execução (`signal_cascade_settings.credits_per_run`).
--   Histórico comercial do próprio Workspace: 0 (não chama fonte externa).

alter table public.signal_catalog
  add column if not exists credits_per_account integer not null default 1 check (credits_per_account >= 0);

comment on column public.signal_catalog.credits_per_account is
  'Créditos por Conta varrida por um Monitoramento deste Sinal. Preço fixo: não muda com o fornecedor.';

-- Faixa 2: 2 créditos por Conta.
update public.signal_catalog set credits_per_account = 2
where workspace_id is null and id in (
  'abertura-de-vagas', 'crescimento-de-equipes', 'nova-lideranca', 'novas-contratacoes', 'promocoes',
  'anuncio-de-movimentacao', 'anuncios-meta', 'anuncios-google', 'anuncios-linkedin', 'publicacoes-da-empresa');

-- Faixa 1: 1 crédito por Conta.
update public.signal_catalog set credits_per_account = 1
where workspace_id is null and id in (
  'avaliacoes-google-maps', 'nova-empresa-aberta', 'nova-cooperativa', 'entrada-de-socio', 'mudanca-de-porte-ou-regime',
  'nova-filial-ou-sede', 'financiamento-bndes-finep', 'nova-mercadoria-importada', 'mudanca-regulatoria-e-licenca',
  'processos-e-recuperacao', 'meta-esg-publicada', 'grupo-a-e-cnae-eletrointensivo', 'calendario-e-plano-safra');

-- Histórico comercial: sem fonte externa, sem custo.
update public.signal_catalog set credits_per_account = 0
where workspace_id is null and id in ('sem-resposta', 'negociacao-parada', 'proposta-recusada');

-- Os rótulos de custo: preço em créditos, sem dólar. Os Sinais de Mercado (sem Conta) custam 3 por execução.
update public.signal_catalog set estimated_cost_label = case
  when id in ('nova-mercadoria-importada', 'mudanca-regulatoria-e-licenca', 'calendario-e-plano-safra')
    then '3 créditos por execução'
  when credits_per_account = 0 then 'Sem custo em créditos'
  when credits_per_account = 1 then '1 crédito por Conta varrida'
  else credits_per_account::text || ' créditos por Conta varrida'
end
where workspace_id is null;

-- Quanto custa, por Conta varrida, um tipo técnico de Sinal (o `signal_type` do Monitoramento ou da cascata): o card global
-- que o tem entre os coletores. Tipo que nenhum card cita cobra 1.
create or replace function private.credits_per_account(p_signal_type text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.credits_per_account
     from public.signal_catalog c
     where c.workspace_id is null and p_signal_type = any (c.collector_types)
     order by c.sort_order, c.id
     limit 1),
    1);
$$;

revoke all on function private.credits_per_account(text) from public, anon, authenticated, service_role;

-- O preço de uma execução de cascata de Mercado (sem Conta). O multiplicador e o preço do crédito em dólar da cascata
-- ficam só como guarda interna.
alter table private.signal_cascade_settings
  add column if not exists credits_per_run integer not null default 3 check (credits_per_run >= 1);

comment on column private.signal_cascade_settings.credits_per_run is
  'Créditos de uma execução de cascata de Mercado, que não tem Conta. O preço do cliente não vem do custo.';
comment on column private.signal_cascade_settings.usd_per_credit is
  'Guarda interna: converte o custo da fonte em créditos equivalentes. Não define o preço do cliente.';
