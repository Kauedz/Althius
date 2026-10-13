-- Fontes que o teste real de 13/10/2026 reprovou. A semente só insere: esta migração atualiza as cascatas já
-- registradas. Nada aqui cria tabela nem apaga dado.
--
--   mudanca_regulatoria e licenca_instalacao_dou: o monitor da Seção 1 do Diário Oficial passa a ser o principal
--     (entrada {q, s: DO1}). Ele olha cerca de 3 dias e casa palavra solta; a regra fica com a frase exata, na mesma
--     janela. A busca longa vira reserva. Cadência de 72 horas para não pular edição. O teto da licença sobe a US$ 0,50
--     para a reserva (cerca de US$ 0,20 por execução) caber depois de um principal que devolveu lixo.
--   grupo_a_cativo: a lista de consumidores livres segue a URL aberta. Se ela não responde, o passo degrada no código
--     (Sinal marcado, sem a exclusão). Não há URL reserva conferida, então o modelo não ganha uma.
--   nova_cooperativa: a busca principal pede CNAE do agro entre empresas novas (até 100). A base por natureza jurídica
--     fica de reserva. O filtro de ativa, janela e agro continua no passo.
--   cnpj_novo: a nota registra que MEI e empresário individual não viram Sinal (o descarte é no passo, antes de gravar).

update private.signal_cascades set
  cadence_hours = 72,
  notes = 'Sinal de mercado: atos da Seção 1 do Diário Oficial da União. A busca olha cerca de 3 dias e casa palavra solta; só entra a publicação que traz a frase exata (IBS, CBS, reforma tributária ou agência reguladora) dentro dessa janela. Ato de pessoal é descartado. A cadência é de 3 dias para não pular edição.',
  updated_at = now()
where signal_type = 'mudanca_regulatoria';

update private.signal_cascade_steps s set
  actor_id = 'brasildados~dou-monitor',
  est_fixed_usd = 0.10,
  est_per_item_usd = 0.01,
  est_items = 10,
  max_items = 20,
  fallbacks = '[{"kind":"actor","actorId":"jenko_systems~diario-oficial-uniao-dou","priceModel":"PAY_PER_EVENT","estFixedUsd":0.20,"estPerItemUsd":0.0001}]'::jsonb,
  input_template = '{"termos":["IBS","CBS","reforma tributária","agência reguladora"],"secao":"do1","janelaDias":3}'::jsonb,
  known_price = '{"fonte":"API pública da Store, 12/10/2026 (conferido em 13/10/2026); principal trocado depois do teste real de 13/10/2026","porExecucao":0.10,"porResultado":0.01,"alternativa":{"porExecucao":0.20,"porResultado":0.0001}}'::jsonb
from private.signal_cascades c
where s.cascade_id = c.id and c.signal_type = 'mudanca_regulatoria' and s.ordem = 1;

update private.signal_cascade_steps s set
  input_template = '{"termos":["IBS","CBS","reforma tributária","agência reguladora"],"janelaDias":3}'::jsonb
from private.signal_cascades c
where s.cascade_id = c.id and c.signal_type = 'mudanca_regulatoria' and s.ordem = 2;

update private.signal_cascades set
  cap_usd = 0.50,
  cadence_hours = 72,
  notes = 'Sinal de mercado: publicações da Seção 1 do Diário Oficial da União com a frase exata "licença de instalação", nos últimos 3 dias. A busca casa palavra solta; a regra fica só com a frase. Licença de pessoa física (CPF) é descartada. Há caminho de reserva quando o resultado não confere com a consulta. Parcial: as licenças estaduais não entram.',
  updated_at = now()
where signal_type = 'licenca_instalacao_dou';

update private.signal_cascade_steps s set
  actor_id = 'brasildados~dou-monitor',
  est_fixed_usd = 0.10,
  est_per_item_usd = 0.01,
  est_items = 10,
  max_items = 20,
  fallbacks = '[{"kind":"actor","actorId":"jenko_systems~diario-oficial-uniao-dou","priceModel":"PAY_PER_EVENT","estFixedUsd":0.20,"estPerItemUsd":0.0001}]'::jsonb,
  input_template = '{"termo":"\"licença de instalação\"","secao":"do1","janelaDias":3}'::jsonb,
  known_price = '{"fonte":"API pública da Store, 12/10/2026; principal trocado depois do teste real de 13/10/2026","porExecucao":0.10,"porResultado":0.01,"alternativa":{"porExecucao":0.20,"porResultado":0.0001}}'::jsonb
from private.signal_cascades c
where s.cascade_id = c.id and c.signal_type = 'licenca_instalacao_dou' and s.ordem = 1;

update private.signal_cascade_steps s set
  input_template = '{"janelaDias":3}'::jsonb
from private.signal_cascades c
where s.cascade_id = c.id and c.signal_type = 'licenca_instalacao_dou' and s.ordem = 2;

update private.signal_cascades set
  notes = 'Inferência, não confirmação: atividade e porte da Receita, fora da lista de consumidores livres e especiais da CCEE (pela raiz do CNPJ). A lista é aberta e a URL fica no modelo do passo 2. Se a lista não responde, o Sinal sai marcado de que a exclusão não foi feita, sem afirmar que a empresa está fora do mercado livre. Se a lista não cabe no limite de leitura, nada é afirmado.',
  updated_at = now()
where signal_type = 'grupo_a_cativo';

update private.signal_cascades set
  notes = 'Só cooperativa agro ativa (natureza jurídica 214-3), aberta na janela da cascata, com CNAE do agro. A busca principal pede os CNAEs do agro entre as empresas novas; se o que volta não passa no filtro (baixada, antiga ou fora do agro), a outra base assume. A base da Receita é mensal (atraso de até 30 dias).',
  updated_at = now()
where signal_type = 'nova_cooperativa';

update private.signal_cascade_steps s set
  actor_id = 'johnatan029~cnpj-new-companies',
  est_fixed_usd = 0.00005,
  est_per_item_usd = 0.004,
  est_items = 100,
  max_items = 100,
  fallbacks = '[{"kind":"actor","actorId":"epicscrapers~brazil-cnpj-scraper","priceModel":"PAY_PER_EVENT","estFixedUsd":0.00005,"estPerItemUsd":0.0009}]'::jsonb,
  known_price = '{"fonte":"relatório de preços de 12/10/2026 (faixa Free), reconferido em 13/10/2026; principal trocado depois do teste real","porItem":0.004,"porInicio":0.00005,"alternativa":{"porItem":0.0009,"porInicio":0.00005},"observacao":"A busca principal pede CNAE do agro entre empresas novas. A outra base não filtra por data de abertura; o passo fica só com ativa, na janela e do agro."}'::jsonb
from private.signal_cascades c
where s.cascade_id = c.id and c.signal_type = 'nova_cooperativa' and s.ordem = 1;

update private.signal_cascades set
  notes = 'Mapa de Mercado, ICP B. Empresas abertas no mês (base mensal da Receita, atraso de até 30 dias) que são Contas do Workspace. MEI e empresário individual (natureza jurídica 213-5 e razão social de pessoa) não viram Sinal. Filtros do pedido: UF, CNAE, porte e mês.',
  updated_at = now()
where signal_type = 'cnpj_novo';
