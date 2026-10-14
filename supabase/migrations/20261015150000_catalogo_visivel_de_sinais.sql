-- Catálogo visível de Sinais (PR-A). Um card por Sinal, com os nichos em que vale.
-- Não substitui private.signal_catalog (o registro técnico do tipo/coletor) nem apaga cascata.
-- workspace_id nulo = card global; preenchido = só aquele Workspace (Sinal feito sob pedido).
-- O teto padrão de varredura é US$ 20/mês por Workspace. Esta migração não liga a Automação.

create table public.signal_niches (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> '' and length(name) <= 80 and private.texto_sem_marca(name))
);

create table public.signal_catalog (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,80}$'),
  name text not null check (btrim(name) <> '' and length(name) <= 120 and private.texto_sem_marca(name)),
  phrase text not null check (btrim(phrase) <> '' and length(phrase) <= 400 and private.texto_sem_marca(phrase)),
  family text not null check (family in (
    'vagas-e-equipes', 'movimentacao-profissional', 'anuncios', 'presenca-publica',
    'reputacao-e-concorrencia', 'expansao-e-registros', 'capital-e-financas',
    'comercio-exterior', 'regulacao', 'energia', 'agro', 'historico-comercial'
  )),
  source_label text not null check (btrim(source_label) <> '' and length(source_label) <= 200 and private.texto_sem_marca(source_label)),
  estimated_cost_label text not null check (btrim(estimated_cost_label) <> '' and length(estimated_cost_label) <= 200 and private.texto_sem_marca(estimated_cost_label)),
  estimated_cost_usd numeric(8, 2) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  collector_types text[] not null default '{}',
  job_filters jsonb,
  -- Nulo: todo Workspace vê. Preenchido: só o Workspace que pediu o Sinal.
  workspace_id uuid references public.workspaces(id) on delete cascade,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create index signal_catalog_workspace_idx on public.signal_catalog (workspace_id) where workspace_id is not null;

create table public.signal_catalog_niches (
  catalog_id text not null references public.signal_catalog(id) on delete cascade,
  niche_slug text not null references public.signal_niches(slug),
  primary key (catalog_id, niche_slug)
);

alter table public.signal_niches enable row level security;
alter table public.signal_catalog enable row level security;
alter table public.signal_catalog_niches enable row level security;

revoke all on public.signal_niches from public, anon, authenticated;
revoke all on public.signal_catalog from public, anon, authenticated;
revoke all on public.signal_catalog_niches from public, anon, authenticated;
grant select on public.signal_niches to authenticated;
grant select on public.signal_catalog to authenticated;
grant select on public.signal_catalog_niches to authenticated;

-- O CHECK chama private.texto_sem_marca com o papel de quem insere. Sem o EXECUTE, a equipe
-- leva 42501 (permission denied for function) antes de gravar o card do Workspace. O schema
-- private continua sem USAGE para authenticated: o papel não chama a função pelo nome.
grant execute on function private.texto_sem_marca(text) to authenticated;

-- Quem pode gravar um Sinal feito sob pedido. A lista começa vazia: o Nan inclui os user ids.
create table private.althius_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table private.althius_staff enable row level security;
revoke all on private.althius_staff from public, anon, authenticated, service_role;

create function private.is_althius_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.althius_staff s where s.user_id = p_user_id);
$$;

revoke all on function private.is_althius_staff(uuid) from public, anon, authenticated, service_role;
grant execute on function private.is_althius_staff(uuid) to authenticated;

create policy "authenticated reads niche names"
  on public.signal_niches for select to authenticated
  using (true);

create policy "members read global or own catalog cards"
  on public.signal_catalog for select to authenticated
  using (
    workspace_id is null
    or exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = signal_catalog.workspace_id
        and m.user_id = (select auth.uid()) and m.active
    )
  );

create policy "staff inserts a workspace scoped card"
  on public.signal_catalog for insert to authenticated
  with check (workspace_id is not null and private.is_althius_staff((select auth.uid())));

create policy "staff updates a workspace scoped card"
  on public.signal_catalog for update to authenticated
  using (workspace_id is not null and private.is_althius_staff((select auth.uid())))
  with check (workspace_id is not null and private.is_althius_staff((select auth.uid())));

grant insert, update on public.signal_catalog to authenticated;

create policy "members read niches of visible cards"
  on public.signal_catalog_niches for select to authenticated
  using (exists (
    select 1 from public.signal_catalog c
    where c.id = signal_catalog_niches.catalog_id
      and (
        c.workspace_id is null
        or exists (
          select 1 from public.workspace_memberships m
          where m.workspace_id = c.workspace_id and m.user_id = (select auth.uid()) and m.active
        )
      )
  ));

create policy "staff writes niches of workspace scoped cards"
  on public.signal_catalog_niches for insert to authenticated
  with check (
    private.is_althius_staff((select auth.uid()))
    and exists (
      select 1 from public.signal_catalog c
      where c.id = signal_catalog_niches.catalog_id and c.workspace_id is not null
    )
  );

grant insert on public.signal_catalog_niches to authenticated;

insert into public.signal_niches (slug, name) values
  ('comex-e-importacao', 'Comex e importação'),
  ('contabilidade-e-tributario', 'Contabilidade e tributário'),
  ('juridico-empresarial', 'Jurídico empresarial'),
  ('energia-e-mercado-livre', 'Energia e mercado livre'),
  ('industria-fornecedores-b2b', 'Indústria, fornecedores B2B'),
  ('logistica-e-transporte', 'Logística e transporte'),
  ('corretoras-de-beneficios', 'Corretoras de benefícios'),
  ('agro-b2b', 'Agro B2B');

insert into public.signal_catalog (
  id, name, phrase, family, source_label, estimated_cost_label, estimated_cost_usd, collector_types, job_filters, sort_order
) values
  ('abertura-de-vagas', 'Abertura de vagas', 'Acompanha vagas publicadas para os cargos do nicho, num card só.',
    'vagas-e-equipes', 'Vagas públicas em sites de emprego', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['vaga_linkedin', 'vaga_indeed', 'vaga_comex', 'vaga_logistica', 'vaga_engenharia_manutencao'],
    '{"comex-e-importacao":["Analista de comércio exterior","Coordenador de importação","Especialista em drawback","Despachante aduaneiro"],"contabilidade-e-tributario":["Analista fiscal","Coordenador tributário","Contador","Analista de obrigações acessórias"],"juridico-empresarial":["Advogado empresarial","Analista jurídico","Coordenador de contratos","Compliance"],"energia-e-mercado-livre":["Analista de energia","Gestor de mercado livre","Engenheiro eletricista","Comprador de energia"],"industria-fornecedores-b2b":["Engenheiro de manutenção","Comprador industrial","Coordenador de produção","Engenheiro de processos"],"logistica-e-transporte":["Analista de logística","Coordenador de transporte","Gerente de centro de distribuição","Planejador de rotas"],"corretoras-de-beneficios":["Consultor de benefícios","Analista de recursos humanos","Coordenador de gente e gestão","Gerente de benefícios"],"agro-b2b":["Agrônomo","Gerente comercial agro","Analista de crédito rural","Coordenador de compras agrícolas"]}'::jsonb,
    10),
  ('nova-lideranca', 'Nova liderança', 'Detecta a chegada de uma nova liderança nas áreas que decidem a compra.',
    'movimentacao-profissional', 'Movimentação pública de cargos de liderança', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['nova_lideranca'], null, 20),
  ('novas-contratacoes', 'Novas contratações e saídas', 'Registra quem entrou ou saiu nos cargos do comitê de compra.',
    'movimentacao-profissional', 'Movimentação pública de pessoas nas empresas', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['entradas_e_saidas'], null, 30),
  ('promocoes', 'Promoções e mudança de emprego', 'Avisa quando alguém é promovido ou muda de empresa e passa a decidir a compra.',
    'movimentacao-profissional', 'Movimentação pública de carreira', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['mudanca_de_emprego'], null, 40),
  ('anuncio-de-movimentacao', 'Anúncio público de movimentação', 'Lê publicações em que alguém da empresa anuncia um cargo novo, uma promoção ou uma chegada.',
    'movimentacao-profissional', 'Publicações públicas de profissionais', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['anuncio_de_movimentacao'], null, 50),
  ('crescimento-de-equipes', 'Crescimento ou redução de equipes', 'Aponta quando o quadro da empresa cresce ou encolhe além do ritmo do nicho.',
    'vagas-e-equipes', 'Quadro público de pessoas da empresa, comparado mês a mês', 'Cerca de US$ 0,80 a cada 200 empresas por mês', 0.80,
    array['crescimento_de_equipes', 'cruzando_faixa_de_headcount'], null, 60),
  ('anuncios-meta', 'Anunciando na Meta', 'Avisa quando a empresa passa a anunciar no Facebook e no Instagram.',
    'anuncios', 'Biblioteca pública de anúncios', 'Cerca de US$ 0,50 a cada 200 empresas por mês', 0.50,
    array['anuncio_meta'], null, 70),
  ('anuncios-google', 'Anunciando no Google', 'Avisa quando aparece o primeiro anúncio da empresa na busca ou no vídeo.',
    'anuncios', 'Transparência pública de anúncios', 'Cerca de US$ 0,40 a cada 200 empresas por mês', 0.40,
    array[]::text[], null, 80),
  ('anuncios-linkedin', 'Anunciando no LinkedIn', 'Avisa quando a empresa começa uma campanha na rede profissional.',
    'anuncios', 'Biblioteca pública de anúncios profissionais', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['anuncio_linkedin'], null, 90),
  ('publicacoes-da-empresa', 'Publicações da empresa', 'Encontra posts da empresa sobre expansão, unidade nova, contratação, investimento ou certificação.',
    'presenca-publica', 'Publicações públicas da empresa', 'Cerca de US$ 3 a cada 200 empresas por mês', 3,
    array[]::text[], null, 100),
  ('avaliacoes-google-maps', 'Avaliações no Google Maps', 'Aponta queda de nota e reclamações repetidas, sem guardar quem avaliou.',
    'reputacao-e-concorrencia', 'Avaliações públicas de estabelecimentos', 'Cerca de US$ 0,60 a cada 200 empresas por mês', 0.60,
    array['avaliacoes_google_maps'], null, 110),
  ('nova-empresa-aberta', 'Nova empresa aberta', 'Avisa quando abre uma empresa nova no perfil que você acompanha.',
    'expansao-e-registros', 'Base pública de CNPJ', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['cnpj_novo'], null, 120),
  ('nova-cooperativa', 'Nova cooperativa', 'Avisa quando uma cooperativa nova é registrada.',
    'agro', 'Base pública de CNPJ', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['nova_cooperativa'], null, 130),
  ('entrada-de-socio', 'Entrada de sócio', 'Detecta a entrada de um sócio, sem publicar o nome da pessoa.',
    'expansao-e-registros', 'Base pública de CNPJ', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['entrada_de_socio'], null, 140),
  ('mudanca-de-porte-ou-regime', 'Mudança de porte ou regime', 'Avisa quando a empresa muda de porte ou de regime tributário.',
    'expansao-e-registros', 'Base pública de CNPJ', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['mudanca_de_porte_ou_regime'], null, 150),
  ('nova-filial-ou-sede', 'Nova filial ou mudança de sede', 'Identifica filial nova, planta, centro de distribuição ou troca de sede.',
    'expansao-e-registros', 'Base pública de CNPJ', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['nova_planta_filial', 'novo_cd_ou_filial', 'nova_filial_icp_g', 'troca_de_sede', 'expansao_de_planta'], null, 160),
  ('financiamento-bndes-finep', 'Financiamento BNDES/Finep', 'Encontra financiamentos públicos anunciados para indústria e energia.',
    'capital-e-financas', 'Divulgações públicas de financiamento', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['financiamento_bndes_finep'], null, 170),
  ('nova-mercadoria-importada', 'Nova mercadoria importada', 'Detecta uma mercadoria nova na pauta de importação do mercado.',
    'comercio-exterior', 'Estatísticas públicas de comércio exterior', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['ncm_nova_na_pauta'], null, 180),
  ('mudanca-regulatoria-e-licenca', 'Mudança regulatória e licença de instalação', 'Acompanha mudança de regra e licença de instalação publicadas no diário oficial.',
    'regulacao', 'Publicações oficiais', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['mudanca_regulatoria', 'licenca_instalacao_dou'], null, 190),
  ('processos-e-recuperacao', 'Processos públicos e recuperação judicial', 'Detecta processo público relevante ou recuperação judicial da empresa.',
    'regulacao', 'Publicações oficiais de processos', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['processos_publicos', 'recuperacao_judicial'], null, 200),
  ('meta-esg-publicada', 'Meta ESG publicada', 'Encontra meta ambiental ou social que a empresa tornou pública.',
    'energia', 'Relatos públicos da empresa', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['meta_esg_publicada'], null, 210),
  ('grupo-a-e-cnae-eletrointensivo', 'Consumidor Grupo A e CNAE eletrointensivo', 'Aponta consumidor do Grupo A ainda cativo e atividade eletrointensiva.',
    'energia', 'Dados públicos do mercado de energia e base de CNPJ', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['grupo_a_cativo', 'cnae_eletrointensivo'], null, 220),
  ('calendario-e-plano-safra', 'Calendário de safra e Plano Safra', 'Marca a janela da safra e a liberação do Plano Safra.',
    'agro', 'Calendários públicos da safra', 'Dentro do teto de US$ 20 por mês do Workspace', null,
    array['calendario_de_safra', 'liberacao_plano_safra'], null, 230),
  ('sem-resposta', 'Ausência de resposta', 'Retoma Contas sem resposta há o prazo que você definir.',
    'historico-comercial', 'Interações do próprio Workspace', 'Sem custo de fonte externa', null,
    array['sem_resposta'], null, 240),
  ('negociacao-parada', 'Negociação parada', 'Aponta negociação sem atividade há o prazo que você definir.',
    'historico-comercial', 'Interações do próprio Workspace', 'Sem custo de fonte externa', null,
    array['negociacao_parada'], null, 250),
  ('proposta-recusada', 'Proposta recusada', 'Traz de volta a Conta cuja proposta foi recusada há o tempo que você escolher.',
    'historico-comercial', 'Interações do próprio Workspace', 'Sem custo de fonte externa', null,
    array['proposta_recusada'], null, 260);

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select c.id, n.slug
from public.signal_catalog c
cross join public.signal_niches n
where c.id in (
  'abertura-de-vagas', 'nova-lideranca', 'novas-contratacoes', 'promocoes', 'anuncio-de-movimentacao',
  'publicacoes-da-empresa', 'sem-resposta', 'negociacao-parada', 'proposta-recusada'
);

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select c.id, n.slug
from public.signal_catalog c
join public.signal_niches n on n.slug in (
  'contabilidade-e-tributario', 'juridico-empresarial', 'corretoras-de-beneficios', 'agro-b2b', 'industria-fornecedores-b2b'
)
where c.id in ('anuncios-meta', 'anuncios-google');

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select 'crescimento-de-equipes', slug from public.signal_niches
where slug in ('corretoras-de-beneficios', 'contabilidade-e-tributario', 'logistica-e-transporte', 'industria-fornecedores-b2b');

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select 'anuncios-linkedin', slug from public.signal_niches
where slug in ('industria-fornecedores-b2b', 'energia-e-mercado-livre', 'logistica-e-transporte');

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select 'avaliacoes-google-maps', slug from public.signal_niches
where slug in ('logistica-e-transporte', 'industria-fornecedores-b2b', 'agro-b2b', 'energia-e-mercado-livre');

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select 'nova-empresa-aberta', slug from public.signal_niches
where slug in ('contabilidade-e-tributario', 'juridico-empresarial', 'corretoras-de-beneficios');

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select 'nova-cooperativa', slug from public.signal_niches where slug = 'agro-b2b';

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select 'entrada-de-socio', slug from public.signal_niches
where slug in ('contabilidade-e-tributario', 'juridico-empresarial');

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select 'mudanca-de-porte-ou-regime', slug from public.signal_niches where slug = 'contabilidade-e-tributario';

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select 'nova-filial-ou-sede', slug from public.signal_niches
where slug in ('logistica-e-transporte', 'industria-fornecedores-b2b', 'energia-e-mercado-livre', 'corretoras-de-beneficios');

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select 'financiamento-bndes-finep', slug from public.signal_niches
where slug in ('industria-fornecedores-b2b', 'energia-e-mercado-livre');

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select 'nova-mercadoria-importada', slug from public.signal_niches where slug = 'comex-e-importacao';

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select 'mudanca-regulatoria-e-licenca', slug from public.signal_niches
where slug in ('juridico-empresarial', 'industria-fornecedores-b2b');

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select 'processos-e-recuperacao', slug from public.signal_niches where slug = 'juridico-empresarial';

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select id, 'energia-e-mercado-livre' from public.signal_catalog
where id in ('meta-esg-publicada', 'grupo-a-e-cnae-eletrointensivo');

insert into public.signal_catalog_niches (catalog_id, niche_slug)
select 'calendario-e-plano-safra', slug from public.signal_niches where slug = 'agro-b2b';

-- A tela lê só o que o card mostra, já filtrado pelo Workspace.
create function public.list_visible_signal_catalog(p_workspace_id uuid)
returns table (
  id text,
  name text,
  phrase text,
  family text,
  source_label text,
  estimated_cost_label text,
  estimated_cost_usd numeric,
  niche_slugs text[],
  collector_types text[],
  job_filters jsonb,
  workspace_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and m.active
  ) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  return query
  select c.id, c.name, c.phrase, c.family, c.source_label, c.estimated_cost_label, c.estimated_cost_usd,
    coalesce(
      (select array_agg(n.niche_slug order by n.niche_slug) from public.signal_catalog_niches n where n.catalog_id = c.id),
      '{}'::text[]
    ),
    c.collector_types, c.job_filters, c.workspace_id
  from public.signal_catalog c
  where c.workspace_id is null or c.workspace_id = p_workspace_id
  order by c.sort_order, c.name;
end;
$$;

revoke all on function public.list_visible_signal_catalog(uuid) from public, anon;
grant execute on function public.list_visible_signal_catalog(uuid) to authenticated;

-- Teto padrão. Sem linha, o Workspace usa 20. Não muda o modo confirmar/automático.
create table private.workspace_signal_budget (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  monthly_cap_usd numeric(12, 2) not null default 20 check (monthly_cap_usd > 0),
  created_at timestamptz not null default now()
);

alter table private.workspace_signal_budget enable row level security;
revoke all on private.workspace_signal_budget from public, anon, authenticated, service_role;

insert into private.workspace_signal_budget (workspace_id)
select w.id from public.workspaces w
on conflict (workspace_id) do nothing;

create function private.seed_workspace_signal_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.workspace_signal_budget (workspace_id) values (new.id) on conflict (workspace_id) do nothing;
  return new;
end;
$$;

revoke all on function private.seed_workspace_signal_budget() from public, anon, authenticated, service_role;

create trigger workspaces_seed_signal_budget
  after insert on public.workspaces
  for each row execute function private.seed_workspace_signal_budget();

create function public.workspace_signal_monthly_cap(p_workspace_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and m.active
  ) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  return coalesce(
    (select b.monthly_cap_usd from private.workspace_signal_budget b where b.workspace_id = p_workspace_id),
    20
  );
end;
$$;

revoke all on function public.workspace_signal_monthly_cap(uuid) from public, anon;
grant execute on function public.workspace_signal_monthly_cap(uuid) to authenticated;
