-- CNPJ novo gastou cerca de US$ 0,40 numa rodada de 100 empresas, no limite do teto da cascata. A rodada passa a
-- pedir no máximo 25 empresas e US$ 0,20 (o passo também lê esses números e para ao atingir). O teto da cascata
-- (US$ 0,50) e o número de Contas não mudam. Não marca a cascata como disponível.

update private.signal_cascade_steps s
set
  max_items = 25,
  est_items = 25,
  input_template = s.input_template || jsonb_build_object('tetoResultados', 25, 'tetoUsd', 0.20)
from private.signal_cascades c
where c.id = s.cascade_id
  and c.signal_type = 'cnpj_novo'
  and s.ordem = 1;
