-- Sinais reais: rollout incremental por fonte.
-- Nesta fase, somente abertura de vagas permanece liberada. Os demais actors externos ficam "out",
-- estado que o catálogo traduz para "Em breve" e que impede criar Monitoramentos.
update private.signal_actors
set state = 'out', updated_at = now()
where signal_type not in ('vaga_linkedin', 'vaga_indeed');

-- Cascatas de Sinais externas/genéricas também não podem reabrir um card por acidente.
-- A cascata privada de vagas continua habilitada para o fluxo já validado.
update private.signal_cascades
set state = 'disabled'
where signal_type <> 'vaga_mercado'
  and state in ('available', 'testing');

comment on table private.signal_actors is
  'Registro de disponibilidade dos Sinais reais. O rollout atual libera apenas vaga_linkedin e vaga_indeed; fontes futuras entram por migration própria após validação.';
