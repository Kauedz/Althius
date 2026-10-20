-- O Apollo gasta (conector-apollo 01): o enriquecimento consome créditos do Apollo do Cliente e há ferramentas que
-- enviam e-mail pela conta da pessoa (https://docs.apollo.io/docs/apollo-mcp). Mesmo desenho do Clay (20261104120000):
-- `writes`, e a Edge Function trata toda ferramenta do Apollo como gasto (`ferramentasGastam`). O padrão das
-- Especialidades fica como está (decisão pendente em conector-clay 01). Aditiva: só dados.
update private.integration_catalog set writes = true where id = 'apollo';
