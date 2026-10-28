-- Fase 1 do fluxo básico (decisão 7 do Kauê, 28/10/2026): a busca de contas pelo LinkedIn passa a "disponível" depois de
-- uma execução real controlada. Execução de validação: run Apify PJ1zde6MEUtUKUl1X (28/10/2026 12h15 BRT, build 0.0.21),
-- com o plano do account-discovery para o ICP da Equipe Althius (Logística e Corretora de seguros, 1-50 funcionários,
-- Brasil, 10 empresas): 10 empresas devolvidas, 8 do setor pedido, custo de uso US$ 0,041 (teto do Actor US$ 0,45).
-- Só muda o estado e a versão deste Actor; o Actor da Receita segue "em teste" até ter a mesma validação.
-- Mudança de dado aditiva: nenhuma linha é apagada, nenhum outro Actor muda.
update private.discovery_actors
set state = 'available',
    version = '0.0.21',
    notes = 'Empresas do LinkedIn por palavra-chave, local e porte; traz site, número de funcionários, setor e locais. '
         || 'Validado numa execução real em 28/10/2026 (run PJ1zde6MEUtUKUl1X): busca booleana por texto e local "Brazil" '
         || 'devolveram empresas do setor pedido.',
    updated_at = now()
where purpose = 'buscar_contas'
  and actor_id = 'harvestapi~linkedin-company-search'
  and state = 'testing';
